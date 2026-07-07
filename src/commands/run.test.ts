import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runCommand } from './run.js';
import fs from 'fs';
import * as parser from '../plans/parser.js';
import * as execution from '../executor/execution.js';
import * as loader from '../config/loader.js';
import * as discovery from '../plans/discovery.js';
import * as state from '../executor/state.js';
import * as verification from '../executor/verification.js';
import * as worktrees from '../worktrees/index.js';
import * as commit from '../git/commit.js';
import * as p from '@clack/prompts';

vi.mock('fs');
vi.mock('../plans/parser.js');
vi.mock('../executor/execution.js');
vi.mock('../config/loader.js');
vi.mock('../plans/discovery.js');
vi.mock('../executor/state.js');
vi.mock('../executor/verification.js');
vi.mock('../worktrees/index.js');
vi.mock('../git/commit.js');
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  isCancel: vi.fn().mockReturnValue(false),
  confirm: vi.fn().mockResolvedValue(true),
  select: vi.fn(),
}));

describe('runCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(loader.loadConfig).mockResolvedValue({
      planDir: 'plans',
      taskTimeoutMs: 1000,
      claude: { binary: 'claude' },
    } as any);

    vi.mocked(discovery.discoverPlan).mockResolvedValue('plans/PLAN.md');
    vi.mocked(fs.readFileSync).mockReturnValue('plan content');

    vi.mocked(state.loadPlanState).mockResolvedValue({ planId: 'plan1', tasks: {} });
    vi.mocked(state.getTaskState).mockReturnValue({
      id: '2',
      attempts: 0,
      lastStatus: 'NOT_DONE',
      logFilePaths: [],
      claudeExitCodes: [],
      jsonResponsePaths: [],
      verificationResults: [],
    });
    vi.mocked(state.savePlanState).mockResolvedValue(undefined);
    vi.mocked(verification.runVerification).mockResolvedValue(null);
    vi.mocked(worktrees.getWorktreeBranchName).mockReturnValue('plan1-2');
    vi.mocked(worktrees.createWorktree).mockResolvedValue(undefined);
    vi.mocked(commit.stageAllChanges).mockResolvedValue(undefined);
    vi.mocked(commit.hasStagedChanges).mockResolvedValue(false);
    vi.mocked(commit.createCommit).mockResolvedValue('abc1234');
  });

  it('stops if no executable tasks are found', async () => {
    vi.mocked(parser.parsePlan).mockReturnValue({
      planId: 'plan1',
      tasks: [{ id: '1', status: 'DONE', originalText: '- [x] task', headingContext: '' }],
    });
    vi.mocked(parser.determineNextTask).mockReturnValue(undefined);

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    await runCommand({});

    expect(p.log.success).toHaveBeenCalledWith(
      expect.stringContaining('All tasks complete'),
    );
    expect(mockExit).toHaveBeenCalledWith(0);

    mockExit.mockRestore();
  });

  it('reports blocked plan summary with verification counts', async () => {
    vi.mocked(parser.parsePlan).mockReturnValue({
      planId: 'plan1',
      tasks: [
        { id: '1', status: 'DONE', originalText: '- [x] task', headingContext: '' },
        { id: '2', status: 'BLOCKED', originalText: '- [!] task 2', headingContext: '' },
      ],
    });
    vi.mocked(parser.determineNextTask).mockReturnValue(undefined);
    vi.mocked(state.loadPlanState).mockResolvedValue({
      planId: 'plan1',
      tasks: {
        '1': {
          id: '1',
          attempts: 1,
          lastStatus: 'DONE',
          logFilePaths: [],
          claudeExitCodes: [],
          jsonResponsePaths: [],
          verificationResults: [{ success: true, durationMs: 1, stdoutPath: '', stderrPath: '' }],
          totalCostUsd: 0.5,
          commitHash: 'abc123',
        },
        '2': {
          id: '2',
          attempts: 1,
          lastStatus: 'BLOCKED',
          logFilePaths: [],
          claudeExitCodes: [],
          jsonResponsePaths: [],
          verificationResults: [],
        },
      },
    } as any);

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    await runCommand({});

    expect(p.log.warn).toHaveBeenCalledWith(expect.stringContaining('Plan is blocked'));
    expect(p.log.info).toHaveBeenCalledWith('Completed Tasks: 1');
    expect(p.log.info).toHaveBeenCalledWith('Blocked Tasks:   1');
    expect(p.log.info).toHaveBeenCalledWith('Verification:    1 passed / 1 not passing');
    expect(p.log.info).toHaveBeenCalledWith('Total Commits:   1');
    expect(mockExit).toHaveBeenCalledWith(0);

    mockExit.mockRestore();
  });

  it('marks task BLOCKED when Claude reports a BLOCKED sentinel', async () => {
    const mockTask = {
      id: '2',
      status: 'NOT_DONE',
      originalText: '- [ ] task 2',
      headingContext: '',
    } as any;
    vi.mocked(parser.parsePlan).mockReturnValue({ planId: 'plan1', tasks: [mockTask] });
    vi.mocked(parser.determineNextTask).mockReturnValue(mockTask);
    vi.mocked(execution.checkClaudeSessionLimits).mockResolvedValue({ limitReached: false });
    vi.mocked(execution.executeClaudeHeadless).mockResolvedValue({
      success: true,
      exitCode: 0,
      sentinel: { type: 'BLOCKED', reason: 'missing credentials' },
    });
    vi.mocked(parser.updateTaskStatus)
      .mockReturnValueOnce('plan content IN_PROGRESS')
      .mockReturnValueOnce('plan content BLOCKED');

    await runCommand({});

    expect(parser.updateTaskStatus).toHaveBeenCalledWith(
      'plan content IN_PROGRESS',
      mockTask,
      'BLOCKED',
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith('plans/PLAN.md', 'plan content BLOCKED', 'utf8');
    expect(p.log.warn).toHaveBeenCalledWith(expect.stringContaining('missing credentials'));
    expect(verification.runVerification).not.toHaveBeenCalled();
  });

  it('runs Claude and marks task DONE on success', async () => {
    const mockTask = {
      id: '2',
      status: 'NOT_DONE',
      originalText: '- [ ] task 2',
      headingContext: '',
    } as any;
    vi.mocked(parser.parsePlan).mockReturnValue({ planId: 'plan1', tasks: [mockTask] });
    vi.mocked(parser.determineNextTask).mockReturnValue(mockTask);
    vi.mocked(execution.checkClaudeSessionLimits).mockResolvedValue({ limitReached: false });
    vi.mocked(execution.executeClaudeHeadless).mockResolvedValue({
      success: true,
      exitCode: 0,
      sentinel: { type: 'SUCCESS' },
    });
    vi.mocked(parser.updateTaskStatus)
      .mockReturnValueOnce('plan content IN_PROGRESS')
      .mockReturnValueOnce('plan content DONE');

    await runCommand({});

    expect(parser.updateTaskStatus).toHaveBeenCalledWith('plan content', mockTask, 'IN_PROGRESS');
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      'plans/PLAN.md',
      'plan content IN_PROGRESS',
      'utf8',
    );

    expect(execution.executeClaudeHeadless).toHaveBeenCalled();

    expect(parser.updateTaskStatus).toHaveBeenCalledWith(
      'plan content IN_PROGRESS',
      mockTask,
      'DONE',
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith('plans/PLAN.md', 'plan content DONE', 'utf8');

    // Regression: taskWorktree must actually be created (git worktree add) before
    // Claude runs there, not just referenced as a path that's assumed to exist.
    expect(worktrees.createWorktree).toHaveBeenCalledWith(
      expect.stringContaining('plan1'),
      'plan1-2',
      expect.any(String),
      expect.any(String),
    );
  });

  it('runs Claude and marks task FAILED on failure', async () => {
    const mockTask = {
      id: '2',
      status: 'NOT_DONE',
      originalText: '- [ ] task 2',
      headingContext: '',
    } as any;
    vi.mocked(parser.parsePlan).mockReturnValue({ planId: 'plan1', tasks: [mockTask] });
    vi.mocked(parser.determineNextTask).mockReturnValue(mockTask);
    vi.mocked(execution.checkClaudeSessionLimits).mockResolvedValue({ limitReached: false });
    vi.mocked(execution.executeClaudeHeadless).mockResolvedValue({
      success: false,
      error: 'failed',
    });
    vi.mocked(parser.updateTaskStatus)
      .mockReturnValueOnce('plan content IN_PROGRESS')
      .mockReturnValueOnce('plan content FAILED');

    await runCommand({});

    expect(parser.updateTaskStatus).toHaveBeenCalledWith(
      'plan content IN_PROGRESS',
      mockTask,
      'FAILED',
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith('plans/PLAN.md', 'plan content FAILED', 'utf8');
  });

  it('reports the failing command and truncated output when verification fails', async () => {
    const mockTask = {
      id: '2',
      status: 'NOT_DONE',
      originalText: '- [ ] task 2',
      headingContext: '',
    } as any;
    vi.mocked(parser.parsePlan).mockReturnValue({ planId: 'plan1', tasks: [mockTask] });
    vi.mocked(parser.determineNextTask).mockReturnValue(mockTask);
    vi.mocked(execution.checkClaudeSessionLimits).mockResolvedValue({ limitReached: false });
    vi.mocked(execution.executeClaudeHeadless).mockResolvedValue({
      success: true,
      exitCode: 0,
      sentinel: { type: 'SUCCESS' },
    });
    vi.mocked(verification.runVerification).mockResolvedValue({
      success: false,
      exitCode: 1,
      command: 'npm test',
      errorOutput: 'boom',
      stderrPath: '/logs/task-2/stderr.log',
    } as any);
    vi.mocked(parser.updateTaskStatus).mockReturnValueOnce('plan content IN_PROGRESS');

    await runCommand({});

    expect(p.log.error).toHaveBeenCalledWith(expect.stringContaining('Failing command: npm test'));
    expect(p.log.error).toHaveBeenCalledWith(expect.stringContaining('boom'));
    expect(p.log.info).toHaveBeenCalledWith(
      expect.stringContaining('Full output: /logs/task-2/stderr.log'),
    );
  });

  it('handles SIGINT gracefully and preserves IN_PROGRESS status', async () => {
    const mockTask = {
      id: '2',
      status: 'NOT_DONE',
      originalText: '- [ ] task 2',
      headingContext: '',
    } as any;
    vi.mocked(parser.parsePlan).mockReturnValue({ planId: 'plan1', tasks: [mockTask] });
    vi.mocked(parser.determineNextTask).mockReturnValue(mockTask);
    vi.mocked(execution.checkClaudeSessionLimits).mockResolvedValue({ limitReached: false });
    vi.mocked(execution.executeClaudeHeadless).mockResolvedValue({
      success: false,
      error: 'Execution interrupted by user',
      interrupted: true,
    });
    vi.mocked(parser.updateTaskStatus).mockReturnValueOnce('plan content IN_PROGRESS');

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    await runCommand({});

    expect(state.savePlanState).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1); // Only for IN_PROGRESS
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      'plans/PLAN.md',
      'plan content IN_PROGRESS',
      'utf8',
    );
    expect(p.log.warn).toHaveBeenCalledWith(expect.stringContaining('Task interrupted'));
    expect(mockExit).toHaveBeenCalledWith(130);

    mockExit.mockRestore();
  });

  it('continues in the existing worktree without recreating it', async () => {
    const mockTask = {
      id: '2',
      status: 'NOT_DONE',
      originalText: '- [ ] task 2',
      headingContext: '',
    } as any;
    vi.mocked(parser.parsePlan).mockReturnValue({ planId: 'plan1', tasks: [mockTask] });
    vi.mocked(parser.determineNextTask).mockReturnValue(mockTask);
    vi.mocked(fs.existsSync).mockReturnValue(true);

    // @ts-ignore
    p.select = vi.fn().mockResolvedValue('continue');

    vi.mocked(execution.checkClaudeSessionLimits).mockResolvedValue({ limitReached: false });
    vi.mocked(execution.executeClaudeHeadless).mockResolvedValue({
      success: true,
      exitCode: 0,
      sentinel: { type: 'SUCCESS' },
    });
    vi.mocked(parser.updateTaskStatus)
      .mockReturnValueOnce('plan content IN_PROGRESS')
      .mockReturnValueOnce('plan content DONE');

    await runCommand({});

    expect(worktrees.createWorktree).not.toHaveBeenCalled();
  });

});
