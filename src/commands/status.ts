import * as fs from 'fs';
import * as path from 'path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadConfig } from '../config/loader.js';
import { discoverPlan } from '../plans/discovery.js';
import { parsePlan, determineNextTask, ValidationError } from '../plans/parser.js';
import { loadPlanState } from '../executor/state.js';

export interface StatusCommandOptions {
  config?: string;
  plan?: string;
  task?: string;
}

export async function runStatusCommand(options: StatusCommandOptions): Promise<void> {
  p.intro(pc.bgBlue(pc.white(' Claude Orchestrator: Status ')));

  const config = await loadConfig(options.config);

  let planPath = options.plan;
  if (!planPath) {
    const defaultPlanDir = config.planDir || '.claude-orchestrator/plans';
    planPath = (await discoverPlan({ planDir: defaultPlanDir })) || undefined;
    if (!planPath) {
      process.exit(0);
    }
  }

  const planContent = fs.readFileSync(planPath, 'utf8');
  const planId = path.basename(planPath, path.extname(planPath));

  let parsedPlan;
  try {
    parsedPlan = parsePlan(planContent, planId);
  } catch (error) {
    if (error instanceof ValidationError) {
      p.log.error(pc.red(`Plan Validation Failed: ${error.message}`));
      process.exit(1);
    }
    throw error;
  }

  const state = await loadPlanState(parsedPlan.planId, config);
  const retryCounts: Record<string, number> = {};
  for (const [taskId, taskState] of Object.entries(state.tasks)) {
    retryCounts[taskId] = Math.max(0, taskState.attempts - 1);
  }
  const nextTask = options.task
    ? parsedPlan.tasks.find((t) => t.id === options.task)
    : determineNextTask(parsedPlan.tasks, config.maxRetries || 3, retryCounts);

  const counts = { NOT_DONE: 0, IN_PROGRESS: 0, DONE: 0, FAILED: 0, BLOCKED: 0 };
  for (const t of parsedPlan.tasks) counts[t.status]++;

  p.log.info(pc.blue('--- Plan Status ---'));
  p.log.info(`Plan Path:     ${planPath}`);
  p.log.info(`Total Tasks:   ${parsedPlan.tasks.length}`);
  p.log.info(`Not Started:   ${counts.NOT_DONE}`);
  p.log.info(`In Progress:   ${counts.IN_PROGRESS}`);
  p.log.info(`Done:          ${counts.DONE}`);
  p.log.info(`Failed:        ${counts.FAILED}`);
  p.log.info(`Blocked:       ${counts.BLOCKED}`);

  if (nextTask) {
    p.log.info(`Active Task:   [${nextTask.status}] ${nextTask.originalText.trim()}`);
    p.log.info(pc.cyan(`Resume with:   claude-orchestrator run --plan ${planPath}`));
  } else {
    p.log.info('Active Task:   none');
  }

  p.outro(pc.green('Status check complete.'));
}
