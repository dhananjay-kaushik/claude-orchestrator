import { loadConfig } from '../config/loader.js';
import { discoverPlan } from '../plans/discovery.js';
import {
  parsePlan,
  ValidationError,
  determineNextTask,
  updateTaskStatus,
} from '../plans/parser.js';
import { checkClaudeSessionLimits, executeClaudeHeadless } from '../executor/execution.js';
import { runVerification } from '../executor/verification.js';
import { loadPlanState, savePlanState, getTaskState } from '../executor/state.js';
import { buildExecutionPrompt } from '../prompts/execution.js';
import { isGitRepository, initializeGitRepository, resolveDefaultBranch } from '../git/repo.js';
import { getWorktreeBranchName, createWorktree } from '../worktrees/index.js';
import {
  stageAllChanges,
  hasStagedChanges,
  createCommit,
  formatCommitMessage,
} from '../git/commit.js';
import fs from 'fs';
import path from 'path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { truncateForTerminal } from '../logging/format.js';
import { MODEL_OPTIONS } from '../models.js';

export interface RunCommandOptions {
  plan?: string;
  config?: string;
  task?: string;
  loop?: boolean;
  dryRun?: boolean;
}

export async function runCommand(options: RunCommandOptions): Promise<void> {
  p.intro(pc.bgBlue(pc.white(' Claude Orchestrator: Execution Phase ')));

  const isGit = await isGitRepository();
  if (!isGit) {
    const action = await p.select({
      message: 'This project is not a Git repository. Git is required for safe orchestration.',
      options: [
        { value: 'init', label: 'Initialize Git repository now' },
        { value: 'halt', label: 'Halt execution' },
      ],
    });

    if (p.isCancel(action) || action === 'halt') {
      p.log.info(pc.yellow('Execution halted. Please initialize Git to continue.'));
      process.exit(0);
      return;
    }

    await initializeGitRepository();
    p.log.success(pc.green('Git repository initialized.'));
  }

  const config = await loadConfig(options.config);

  const defaultModel = config.models?.execution || 'claude-sonnet-5';
  const modelChoice = await p.select({
    message: 'Which model should Claude use for execution?',
    initialValue: MODEL_OPTIONS.some((o) => o.value === defaultModel) ? defaultModel : 'other',
    options: [...MODEL_OPTIONS, { value: 'other', label: 'Other (enter manually)' }],
  });

  if (p.isCancel(modelChoice)) {
    p.cancel('Execution cancelled.');
    process.exit(0);
  }

  let executionModel = modelChoice as string;
  if (modelChoice === 'other') {
    const customModel = await p.text({
      message: 'Enter the model name or alias:',
      initialValue: defaultModel,
    });

    if (p.isCancel(customModel)) {
      p.cancel('Execution cancelled.');
      process.exit(0);
    }
    executionModel = customModel as string;
  }
  config.models = { ...config.models, execution: executionModel };

  const defaultBranchName = config.baseBranch || 'main';
  const baseBranch = await resolveDefaultBranch(defaultBranchName);
  p.log.info(`Using base branch: ${pc.cyan(baseBranch)}`);

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

  let keepLooping = true;
  while (keepLooping) {
    keepLooping = options.loop === true;
    await runOneTask(planPath, options, config, baseBranch);
  }
}

async function runOneTask(
  planPath: string,
  options: RunCommandOptions,
  config: Awaited<ReturnType<typeof loadConfig>>,
  baseBranch: string,
): Promise<void> {
  let parsedPlan;
  let planContent;
  try {
    planContent = fs.readFileSync(planPath, 'utf8');
    const planId = path.basename(planPath, path.extname(planPath));
    parsedPlan = parsePlan(planContent, planId);
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
  let nextTask = determineNextTask(parsedPlan.tasks, config.maxRetries || 3, retryCounts);

  if (!nextTask) {
    let completed = 0, failed = 0, blocked = 0, totalCostUsd = 0, verified = 0, unverified = 0;
    const commits: string[] = [];
    for (const t of Object.values(state.tasks)) {
      if (t.lastStatus === 'DONE') completed++;
      if (t.lastStatus === 'FAILED') failed++;
      if (t.lastStatus === 'BLOCKED') blocked++;
      if (t.totalCostUsd) totalCostUsd += t.totalCostUsd;
      if (t.commitHash) commits.push(t.commitHash);
      const lastVerification = t.verificationResults?.[t.verificationResults.length - 1];
      if (lastVerification?.success) verified++;
      else unverified++;
    }

    const allDone = parsedPlan.tasks.every((t) => t.status === 'DONE');
    const hasBlocked = parsedPlan.tasks.some((t) => t.status === 'BLOCKED');
    if (allDone) {
      p.log.success(pc.green('All tasks complete. No further orchestration work is needed.'));
    } else if (hasBlocked) {
      p.log.warn(pc.yellow('Plan is blocked. Resolve the blocking issue(s) shown above, then rerun.'));
    } else {
      p.log.warn(pc.yellow('Remaining tasks have exhausted their retries and need manual intervention.'));
    }

    p.log.info(pc.blue('--- Plan Summary ---'));
    p.log.info(`Completed Tasks: ${completed}`);
    p.log.info(`Failed Tasks:    ${failed}`);
    p.log.info(`Blocked Tasks:   ${blocked}`);
    p.log.info(`Verification:    ${verified} passed / ${unverified} not passing`);
    p.log.info(`Total Commits:   ${commits.length}`);
    p.log.info(`Total Cost Est.: $${totalCostUsd.toFixed(4)}`);
    p.log.info(`Plan Path:       ${planPath}`);
    p.log.info(`Base Branch:     ${baseBranch}`);
    p.log.info(`Logs Directory:  ${config.logsDir}`);
    p.log.info(`State Directory: ${config.stateDir}`);
    process.exit(0);
    return;
  }

  p.log.info(`Next task: ${nextTask.originalText.trim()}`);

  const logsDir = config.logsDir || '.claude-orchestrator/logs';
  const taskLogDir = path.join(logsDir, parsedPlan.planId, nextTask.id);
  const worktreeDir = config.worktreeDir || '.claude-orchestrator/worktrees';
  const taskWorktree = path.join(process.cwd(), worktreeDir, parsedPlan.planId);

  if (options.dryRun) {
    p.log.info(pc.blue('--- DRY RUN ---'));
    p.log.info(`Plan: ${planPath}`);
    p.log.info(`Task: ${nextTask.originalText.trim()}`);
    
    const branchName = getWorktreeBranchName(parsedPlan.planId);
    p.log.info(`Branch Operation: Will use branch ${pc.cyan(branchName)} at worktree ${pc.cyan(taskWorktree)} based on ${pc.cyan(baseBranch)}`);
    
    if (config.verificationCommands && config.verificationCommands.length > 0) {
      p.log.info('Verification Commands:');
      for (const cmd of config.verificationCommands) {
        p.log.info(`  - ${cmd.command} ${cmd.args.join(' ')}`);
      }
    } else {
      p.log.info('Verification Commands: None configured.');
    }
    
    p.log.info(`Log Directory: ${taskLogDir}`);
    p.log.info(`State Directory: ${config.stateDir || '.claude-orchestrator/state'}`);
    
    p.outro(pc.green('Dry run complete. No state was mutated.'));
    process.exit(0);
    return;
  }

  const limitInfo = await checkClaudeSessionLimits(config);
  if (limitInfo.limitReached) {
    p.log.warn(pc.yellow(`Claude session limit reached: ${limitInfo.message || 'unknown'}`));
    process.exit(0);
    return;
  }

  const updatedPlanContent = updateTaskStatus(planContent, nextTask, 'IN_PROGRESS');
  fs.writeFileSync(planPath, updatedPlanContent, 'utf8');
  p.log.info(pc.blue('Marked task as IN_PROGRESS.'));

  // Re-parse so nextTask.originalText reflects the IN_PROGRESS marker just written;
  // later updateTaskStatus calls match against updatedPlanContent, not the stale NOT_DONE line.
  nextTask = parsePlan(updatedPlanContent, parsedPlan.planId).tasks.find((t) => t.id === nextTask!.id)!;

  p.log.info('Spawning Claude Code...');

  // The worktree/branch is shared across every task in the plan, so once
  // task 1 creates it, later tasks just keep committing onto it here.
  if (fs.existsSync(taskWorktree)) {
    p.log.info(pc.blue(`Reusing existing plan worktree at ${taskWorktree}.`));
  } else {
    const branchName = getWorktreeBranchName(parsedPlan.planId);
    await createWorktree(taskWorktree, branchName, baseBranch, process.cwd());
  }

  const taskState = getTaskState(state, nextTask.id);
  const retryContext = {
    lastError: taskState.lastError,
    lastVerificationError: taskState.lastVerificationError,
  };

  const prompt = buildExecutionPrompt(
    planPath,
    nextTask.originalText,
    nextTask.id,
    taskWorktree,
    retryContext,
  );
  const abortController = new AbortController();
  const onSigInt = () => {
    p.log.warn(pc.yellow('\nReceived SIGINT. Cancelling current task...'));
    abortController.abort();
  };
  process.on('SIGINT', onSigInt);

  let outcome;
  try {
    outcome = await executeClaudeHeadless(
      config,
      prompt,
      taskLogDir,
      nextTask.id,
      abortController.signal,
    );
  } finally {
    process.off('SIGINT', onSigInt);
  }

  taskState.attempts += 1;
  taskState.claudeExitCodes.push(outcome.exitCode ?? null);
  p.log.info(`Attempt ${taskState.attempts} of ${config.maxRetries || 3}`);

  if (outcome.response) {
    taskState.claudeSessionId = outcome.response.session_id;
    if (outcome.response.total_cost_usd !== undefined) {
      taskState.totalCostUsd = (taskState.totalCostUsd || 0) + outcome.response.total_cost_usd;
    }
    if (outcome.response.usage) {
      taskState.usage = taskState.usage || {};
      for (const [k, v] of Object.entries(outcome.response.usage)) {
        taskState.usage[k] = (taskState.usage[k] || 0) + (typeof v === 'number' ? v : 0);
      }
    }
  }

  if (outcome.sentinel && 'handoffNotes' in outcome.sentinel && outcome.sentinel.handoffNotes) {
    taskState.handoffNotes = outcome.sentinel.handoffNotes;
  }

  if (outcome.success && outcome.sentinel?.type === 'BLOCKED') {
    taskState.lastStatus = 'BLOCKED';
    taskState.blockReason = outcome.sentinel.reason;
    await savePlanState(state, config);

    const blockedPlanContent = updateTaskStatus(updatedPlanContent, nextTask, 'BLOCKED');
    fs.writeFileSync(planPath, blockedPlanContent, 'utf8');

    p.log.warn(pc.yellow(`Task blocked: ${outcome.sentinel.reason}`));
    p.log.info(pc.blue(`Detailed logs are available at: ${taskLogDir}`));
    p.log.info(`Resolve the blocker, then resume with: claude-orchestrator run --plan ${planPath}`);
  } else if (outcome.success) {
    p.log.success(pc.green('Claude execution succeeded.'));

    p.log.info(pc.blue('Running verification gates...'));
    
    let verificationPassed = false;
    const verificationResult = await runVerification(config, taskWorktree, taskLogDir);
    taskState.verificationResults = taskState.verificationResults || [];
    taskState.verificationResults.push(verificationResult);

    if (verificationResult === null) {
      const confirm = await p.confirm({
        message: 'No verification commands configured. Treat work as complete and commit?',
        initialValue: true,
      });
      
      if (p.isCancel(confirm) || !confirm) {
        verificationPassed = false;
        taskState.lastVerificationError = 'User rejected completion without verification.';
      } else {
        verificationPassed = true;
      }
    } else if (!verificationResult.success) {
      p.log.error(pc.red(`Verification failed with exit code ${verificationResult.exitCode ?? 'none'}.`));
      if (verificationResult.command) {
        p.log.error(pc.red(`Failing command: ${verificationResult.command}`));
      }
      p.log.error(truncateForTerminal(verificationResult.errorOutput));
      p.log.info(pc.blue(`Full output: ${verificationResult.stderrPath}`));
      taskState.lastVerificationError = verificationResult.errorOutput;
      verificationPassed = false;
    } else {
      p.log.success(pc.green('Verification passed.'));
      verificationPassed = true;
    }

    if (verificationPassed) {
      try {
        await stageAllChanges(taskWorktree);
        const hasChanges = await hasStagedChanges(taskWorktree);
        if (hasChanges) {
          const commitMsg = formatCommitMessage(config.commitMessageTemplate || 'chore: complete task from plan', {
            planName: parsedPlan.planId,
            taskId: nextTask.id,
            taskText: nextTask.originalText.replace(/^[-*]\s*\[.*?\]\s*/, '').trim(),
          });
          const commitHash = await createCommit(commitMsg, taskWorktree);
          taskState.commitHash = commitHash;
          p.log.success(pc.green(`Created commit ${commitHash}`));
        } else {
          p.log.info(pc.blue('No file changes to commit.'));
        }
      } catch (err) {
        p.log.warn(pc.yellow(`Failed to create commit: ${err instanceof Error ? err.message : String(err)}`));
      }

      taskState.lastStatus = 'DONE';
      await savePlanState(state, config);

      const donePlanContent = updateTaskStatus(updatedPlanContent, nextTask, 'DONE');
      fs.writeFileSync(planPath, donePlanContent, 'utf8');
      p.log.info(pc.blue(`Detailed logs are available at: ${taskLogDir}`));
      p.log.success(pc.green('Marked task as DONE.'));
    } else {
      taskState.lastStatus = 'FAILED';
      await savePlanState(state, config);
      const failPlanContent = updateTaskStatus(updatedPlanContent, nextTask, 'FAILED');
      fs.writeFileSync(planPath, failPlanContent, 'utf8');
      p.log.info(pc.blue(`Detailed logs are available at: ${taskLogDir}`));
      p.log.error(pc.red('Marked task as FAILED due to verification failure.'));
    }
  } else {
    p.log.error(pc.red(`Claude execution failed: ${outcome.error}`));
    if (outcome.interrupted) {
      // Leave task as IN_PROGRESS
      taskState.lastStatus = 'IN_PROGRESS';
      await savePlanState(state, config);
      p.log.warn(pc.yellow(`Task interrupted. Worktree preserved at ${taskWorktree}.`));
      p.log.info(`Resume command: claude-orchestrator run --plan ${planPath}`);
      process.exit(130); // 130 is standard for SIGINT exit
    } else if (outcome.sessionLimitReached) {
      taskState.lastStatus = 'BLOCKED';
      taskState.limitResetTime = outcome.limitResetTime;
      taskState.limitMessage = outcome.error;
      await savePlanState(state, config);

      p.log.warn(
        pc.yellow(`Session limit reached. Resets in ${outcome.limitResetTime || 'unknown'}.`),
      );
      p.log.info(`Resume command: claude-orchestrator run --plan ${planPath}`);
    } else {
      taskState.lastStatus = 'FAILED';
      taskState.lastError = outcome.error;
      await savePlanState(state, config);

      const failPlanContent = updateTaskStatus(updatedPlanContent, nextTask, 'FAILED');
      fs.writeFileSync(planPath, failPlanContent, 'utf8');
      p.log.info(pc.blue(`Detailed logs are available at: ${taskLogDir}`));
      p.log.error(pc.red('Marked task as FAILED.'));
    }
  }

  p.outro(pc.green('Execution engine iteration complete.'));
}
