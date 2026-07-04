import { loadConfig } from '../config/loader.js';
import { discoverPlan } from '../plans/discovery.js';
import { parsePlan, ValidationError, determineNextTask, updateTaskStatus } from '../plans/parser.js';
import { checkClaudeSessionLimits, executeClaudeHeadless } from '../executor/execution.js';
import { loadPlanState, savePlanState, getTaskState } from '../executor/state.js';
import { buildExecutionPrompt } from '../prompts/execution.js';
import fs from 'fs';
import path from 'path';
import * as p from '@clack/prompts';
import pc from 'picocolors';

export interface RunCommandOptions {
  plan?: string;
  config?: string;
  task?: string;
  loop?: boolean;
  dryRun?: boolean;
}

export async function runCommand(options: RunCommandOptions): Promise<void> {
  p.intro(pc.bgBlue(pc.white(' Claude Orchestrator: Execution Phase ')));

  const config = await loadConfig(options.config);

  let planPath = options.plan;
  if (!planPath) {
    const defaultPlanDir = config.planDir || '.claude-orchestrator/plans';
    const discoveredPlan = await discoverPlan({ planDir: defaultPlanDir });
    
    if (!discoveredPlan) {
      process.exit(0);
    }
    planPath = discoveredPlan;
  }

  p.log.info(`Selected plan: ${pc.cyan(planPath)}`);

  let parsedPlan;
  let planContent;
  try {
    planContent = fs.readFileSync(planPath, 'utf8');
    parsedPlan = parsePlan(planContent, planPath);
    p.log.success(pc.green(`Plan validated successfully: ${parsedPlan.tasks.length} tasks found.`));
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
  const nextTask = determineNextTask(parsedPlan.tasks, config.maxRetries || 3, retryCounts);

  if (!nextTask) {
    p.log.success(pc.green('No executable tasks found. Plan is complete or blocked.'));
    process.exit(0);
    return;
  }

  p.log.info(`Next task: ${nextTask.originalText.trim()}`);

  const limitInfo = await checkClaudeSessionLimits(config);
  if (limitInfo.limitReached) {
    p.log.warn(pc.yellow(`Claude session limit reached: ${limitInfo.message || 'unknown'}`));
    process.exit(0);
    return;
  }

  const updatedPlanContent = updateTaskStatus(planContent, nextTask, 'IN_PROGRESS');
  fs.writeFileSync(planPath, updatedPlanContent, 'utf8');
  p.log.info(pc.blue('Marked task as IN_PROGRESS.'));

  p.log.info('Spawning Claude Code...');
  const logsDir = config.logsDir || '.claude-orchestrator/logs';
  const taskLogDir = path.join(logsDir, parsedPlan.planId, nextTask.id);

  const worktreeDir = config.worktreeDir || '.claude-orchestrator/worktrees';
  const taskWorktree = path.join(process.cwd(), worktreeDir, parsedPlan.planId, nextTask.id);
  const taskState = getTaskState(state, nextTask.id);
  const retryContext = {
    lastError: taskState.lastError,
    lastVerificationError: taskState.lastVerificationError,
  };

  const prompt = buildExecutionPrompt(planPath, nextTask.originalText, nextTask.id, taskWorktree, retryContext);
  const outcome = await executeClaudeHeadless(config, prompt, taskLogDir, nextTask.id);

  taskState.attempts += 1;
  taskState.claudeExitCodes.push(outcome.exitCode ?? null);

  if (outcome.response) {
    taskState.claudeSessionId = outcome.response.session_id;
  }

  if (outcome.sentinel && 'handoffNotes' in outcome.sentinel && outcome.sentinel.handoffNotes) {
    taskState.handoffNotes = outcome.sentinel.handoffNotes;
  }

  if (outcome.success) {
    p.log.success(pc.green('Claude execution succeeded.'));

    p.log.info(pc.blue('Running verification gates... (placeholder)'));

    taskState.lastStatus = 'DONE';
    await savePlanState(state, config);

    const donePlanContent = updateTaskStatus(updatedPlanContent, nextTask, 'DONE');
    fs.writeFileSync(planPath, donePlanContent, 'utf8');
    p.log.success(pc.green('Marked task as DONE.'));
  } else {
    p.log.error(pc.red(`Claude execution failed: ${outcome.error}`));
    if (outcome.sessionLimitReached) {
       taskState.lastStatus = 'BLOCKED';
       taskState.limitResetTime = outcome.limitResetTime;
       taskState.limitMessage = outcome.error;
       await savePlanState(state, config);

       p.log.warn(pc.yellow(`Session limit reached. Resets in ${outcome.limitResetTime || 'unknown'}.`));
    } else {
       taskState.lastStatus = 'FAILED';
       taskState.lastError = outcome.error;
       await savePlanState(state, config);

       const failPlanContent = updateTaskStatus(updatedPlanContent, nextTask, 'FAILED');
       fs.writeFileSync(planPath, failPlanContent, 'utf8');
       p.log.error(pc.red('Marked task as FAILED.'));
    }
  }

  p.outro(pc.green('Execution engine iteration complete.'));
}

