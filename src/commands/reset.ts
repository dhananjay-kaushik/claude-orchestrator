import * as fs from 'fs';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import path from 'node:path';
import { loadConfig } from '../config/loader.js';
import { discoverPlan } from '../plans/discovery.js';
import { parsePlan, updateTaskStatus, ValidationError } from '../plans/parser.js';
import { loadPlanState, savePlanState } from '../executor/state.js';
import { Config, PlanParseResult } from '../types/index.js';

export interface ResetCommandOptions {
  config?: string;
  plan?: string;
}

async function resolvePlan(
  options: ResetCommandOptions,
  config: Config,
): Promise<{ planPath: string; planContent: string; parsedPlan: PlanParseResult } | null> {
  let planPath = options.plan;
  if (!planPath) {
    const defaultPlanDir = config.planDir || '.claude-orchestrator/plans';
    planPath = (await discoverPlan({ planDir: defaultPlanDir })) || undefined;
    if (!planPath) {
      return null;
    }
  }

  const planContent = fs.readFileSync(planPath, 'utf8');
  const planId = path.basename(planPath, path.extname(planPath));

  try {
    const parsedPlan = parsePlan(planContent, planId);
    return { planPath, planContent, parsedPlan };
  } catch (error) {
    if (error instanceof ValidationError) {
      p.log.error(pc.red(`Plan Validation Failed: ${error.message}`));
      process.exit(1);
    }
    throw error;
  }
}

export async function runResetLastTaskCommand(options: ResetCommandOptions): Promise<void> {
  p.intro(pc.bgBlue(pc.white(' Claude Orchestrator: Reset Failed Task ')));

  const config = await loadConfig(options.config);
  const resolved = await resolvePlan(options, config);
  if (!resolved) return;
  const { planPath, planContent, parsedPlan } = resolved;

  const failedTask = parsedPlan.tasks.find((t) => t.status === 'FAILED' || t.status === 'BLOCKED');
  if (!failedTask) {
    p.outro(pc.yellow('No failed or blocked task found in this plan.'));
    return;
  }

  const state = await loadPlanState(parsedPlan.planId, config);
  const taskState = state.tasks[failedTask.id];

  p.log.info(pc.blue(`--- ${failedTask.status === 'BLOCKED' ? 'Blocked' : 'Failed'} Task ---`));
  p.log.info(`Task:      ${failedTask.originalText.trim()}`);
  p.log.info(`Heading:   ${failedTask.headingContext}`);
  p.log.info(`Attempts:  ${taskState?.attempts ?? 0} / ${config.maxRetries || 3}`);
  if (taskState?.lastError) p.log.info(`Last error: ${taskState.lastError}`);
  if (taskState?.lastVerificationError) p.log.info(`Last verification error: ${taskState.lastVerificationError}`);

  const confirmed = await p.confirm({
    message: 'Reset this task to NOT_DONE and clear its attempt history?',
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel('Reset cancelled.');
    return;
  }

  delete state.tasks[failedTask.id];
  await savePlanState(state, config);

  const updatedPlanContent = updateTaskStatus(planContent, failedTask, 'NOT_DONE');
  fs.writeFileSync(planPath, updatedPlanContent, 'utf8');

  p.outro(pc.green(`Task reset. Resume with: claude-orchestrator run --plan ${planPath}`));
}

export async function runResetPlanCommand(options: ResetCommandOptions): Promise<void> {
  p.intro(pc.bgBlue(pc.white(' Claude Orchestrator: Reset Plan Progress ')));

  const config = await loadConfig(options.config);
  const resolved = await resolvePlan(options, config);
  if (!resolved) return;
  const { planPath, planContent, parsedPlan } = resolved;

  const inProgressOrDone = parsedPlan.tasks.filter((t) => t.status !== 'NOT_DONE').length;
  if (inProgressOrDone === 0) {
    p.outro(pc.yellow('This plan has no progress to reset.'));
    return;
  }

  p.log.warn(pc.yellow(`This will reset all ${parsedPlan.tasks.length} tasks to NOT_DONE and clear all execution state for this plan.`));
  p.log.info('This only touches the plan checklist and local state — no commits, branches, or worktrees are touched.');

  const confirmed = await p.confirm({
    message: `Reset all progress for ${path.basename(planPath)}?`,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel('Reset cancelled.');
    return;
  }

  let updatedPlanContent = planContent;
  for (const task of parsedPlan.tasks) {
    if (task.status !== 'NOT_DONE') {
      updatedPlanContent = updateTaskStatus(updatedPlanContent, task, 'NOT_DONE');
    }
  }
  fs.writeFileSync(planPath, updatedPlanContent, 'utf8');

  await savePlanState({ planId: parsedPlan.planId, tasks: {} }, config);

  p.outro(pc.green(`Plan progress reset. Resume with: claude-orchestrator run --plan ${planPath}`));
}
