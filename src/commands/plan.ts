import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig } from '../config/loader.js';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { execa } from 'execa';
import { buildPlanPrompt, buildEditPlanPrompt } from '../prompts/plan.js';
import { MODEL_OPTIONS } from '../models.js';
import { discoverPlan } from '../plans/discovery.js';

async function listMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md')).map((entry) => entry.name);
}

export async function runPlanCommand(options: { plan?: string; config?: string }): Promise<void> {
  const config = await loadConfig(options.config);

  p.intro(pc.bgBlue(pc.white(' Claude Orchestrator: Planning Phase ')));

  // 1. Model Selection
  const defaultModel = config.models?.planning || 'claude-sonnet-5';
  const modelChoice = await p.select({
    message: 'Which model should Claude use for planning?',
    initialValue: MODEL_OPTIONS.some((o) => o.value === defaultModel) ? defaultModel : 'other',
    options: [...MODEL_OPTIONS, { value: 'other', label: 'Other (enter manually)' }],
  });

  if (p.isCancel(modelChoice)) {
    p.cancel('Planning cancelled.');
    process.exit(0);
  }

  let modelResult: string | symbol = modelChoice as string;
  if (modelChoice === 'other') {
    modelResult = await p.text({
      message: 'Enter the model name or alias:',
      initialValue: defaultModel,
    });

    if (p.isCancel(modelResult)) {
      p.cancel('Planning cancelled.');
      process.exit(0);
    }
  }

  // 2. Plan Directory Confirmation
  const defaultPlanDir = config.planDir || '.claude-orchestrator/plans';
  const planDirResult = await p.text({
    message: 'Where should the plan be saved?',
    initialValue: defaultPlanDir,
  });

  if (p.isCancel(planDirResult)) {
    p.cancel('Planning cancelled.');
    process.exit(0);
  }

  const planDir = planDirResult as string;
  const resolvedPlanDir = path.resolve(process.cwd(), planDir);

  // Ensure plan directory exists
  try {
    await fs.mkdir(resolvedPlanDir, { recursive: true });
  } catch (error: any) {
    p.log.error(`Failed to create plan directory ${resolvedPlanDir}: ${error.message}`);
    process.exit(1);
  }

  // 3. Create new plan or edit an existing one
  const mode = await p.select({
    message: 'What do you want to do?',
    options: [
      { value: 'create', label: 'Create a new plan' },
      { value: 'edit', label: 'Edit an existing plan' },
    ],
  });

  if (p.isCancel(mode)) {
    p.cancel('Planning cancelled.');
    process.exit(0);
  }

  let planPrompt: string;
  let editingPlanPath: string | null = null;

  if (mode === 'edit') {
    editingPlanPath = await discoverPlan({ planDir });
    if (!editingPlanPath) {
      process.exit(0);
    }
    planPrompt = buildEditPlanPrompt(editingPlanPath, planDir);
  } else {
    planPrompt = buildPlanPrompt(planDir);
  }

  p.log.info(pc.cyan('Spawning Claude Code for interactive planning...'));

  // 3. Spawn Claude Code
  const claudeBinary = config.claude.binary || 'claude';

  const filesBefore = editingPlanPath ? null : new Set(await listMarkdownFiles(resolvedPlanDir));
  const editingMtimeBefore = editingPlanPath ? (await fs.stat(editingPlanPath)).mtimeMs : null;

  try {
    const childProcess = execa(claudeBinary, ['--model', modelResult as string, planPrompt], {
      stdio: 'inherit',
    });

    await childProcess;

    if (editingPlanPath) {
      const mtimeAfter = (await fs.stat(editingPlanPath)).mtimeMs;
      if (mtimeAfter !== editingMtimeBefore) {
        p.outro(pc.green(`Planning completed successfully. Plan updated at ${editingPlanPath}`));
      } else {
        p.outro(pc.yellow('The plan file was not changed.'));
      }
    } else {
      const filesAfter = await listMarkdownFiles(resolvedPlanDir);
      const createdPlan = filesAfter.find((file) => !filesBefore!.has(file));

      if (createdPlan) {
        p.outro(pc.green(`Planning completed successfully. Plan saved to ${path.join(resolvedPlanDir, createdPlan)}`));
      } else {
        p.outro(pc.yellow('No plan file was created. Run `claude-orchestrator plan` again to try once more.'));
      }
    }
  } catch (error: any) {
    if (error.signal === 'SIGINT' || error.isCanceled) {
      p.outro(pc.yellow('Planning interrupted.'));
    } else if (error.exitCode !== undefined && error.exitCode !== 0) {
      p.outro(pc.yellow(`Claude exited with code ${error.exitCode}. Please check the plan file.`));
    } else {
      p.log.error(pc.red(`Failed to spawn Claude: ${error.message}`));
      process.exit(1);
    }
  }
}
