import * as fs from 'fs/promises';
import * as path from 'path';
import { loadConfig } from '../config/loader.js';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { execa } from 'execa';
import { buildPlanPrompt } from '../prompts/plan.js';

export async function runPlanCommand(options: { plan?: string; config?: string }): Promise<void> {
  const config = await loadConfig(options.config);

  p.intro(pc.bgBlue(pc.white(' Claude Orchestrator: Planning Phase ')));

  // 1. Model Selection
  const defaultModel = config.models.planning || 'claude-3-7-sonnet-20250219';
  const modelResult = await p.text({
    message: 'Which model should Claude use for planning?',
    initialValue: defaultModel,
  });

  if (p.isCancel(modelResult)) {
    p.cancel('Planning cancelled.');
    process.exit(0);
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

  const planPrompt = buildPlanPrompt(planDir);

  p.log.info(pc.cyan('Spawning Claude Code for interactive planning...'));

  // 3. Spawn Claude Code
  const claudeBinary = config.claude.binary || 'claude';
  
  try {
    const childProcess = execa(claudeBinary, ['-p', planPrompt], {
      stdio: 'inherit',
      env: {
        ...process.env,
        CLAUDE_MODEL: modelResult as string,
      }
    });

    await childProcess;
    
    p.outro(pc.green('Planning completed successfully.'));
  } catch (error: any) {
    if (error.exitCode !== undefined && error.exitCode !== 0) {
      p.outro(pc.yellow(`Claude exited with code ${error.exitCode}. Please check the plan file.`));
    } else {
      p.log.error(pc.red(`Failed to spawn Claude: ${error.message}`));
      process.exit(1);
    }
  }
}
