import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runCommand } from './run.js';
import fs from 'fs';
import * as parser from '../plans/parser.js';
import * as execution from '../executor/execution.js';
import * as loader from '../config/loader.js';
import * as discovery from '../plans/discovery.js';
import * as state from '../executor/state.js';
import * as p from '@clack/prompts';

vi.mock('fs');
vi.mock('../plans/parser.js');
vi.mock('../executor/execution.js');
vi.mock('../config/loader.js');
vi.mock('../plans/discovery.js');
vi.mock('../executor/state.js');
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}));

describe('runCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    vi.mocked(loader.loadConfig).mockResolvedValue({
      planDir: 'plans',
      taskTimeoutMs: 1000,
      claude: { binary: 'claude' }
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
  });

  it('stops if no executable tasks are found', async () => {
    vi.mocked(parser.parsePlan).mockReturnValue({
      planId: 'plan1',
      tasks: [{ id: '1', status: 'DONE', originalText: '- [x] task', headingContext: '' }]
    });
    vi.mocked(parser.determineNextTask).mockReturnValue(undefined);

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    await runCommand({});
    
    expect(p.log.success).toHaveBeenCalledWith(expect.stringContaining('No executable tasks found'));
    expect(mockExit).toHaveBeenCalledWith(0);
    
    mockExit.mockRestore();
  });

  it('runs Claude and marks task DONE on success', async () => {
    const mockTask = { id: '2', status: 'NOT_DONE', originalText: '- [ ] task 2', headingContext: '' } as any;
    vi.mocked(parser.parsePlan).mockReturnValue({ planId: 'plan1', tasks: [mockTask] });
    vi.mocked(parser.determineNextTask).mockReturnValue(mockTask);
    vi.mocked(execution.checkClaudeSessionLimits).mockResolvedValue({ limitReached: false });
    vi.mocked(execution.executeClaudeHeadless).mockResolvedValue({ success: true, exitCode: 0, sentinel: { type: 'SUCCESS' } });
    vi.mocked(parser.updateTaskStatus).mockReturnValueOnce('plan content IN_PROGRESS').mockReturnValueOnce('plan content DONE');

    await runCommand({});

    expect(parser.updateTaskStatus).toHaveBeenCalledWith('plan content', mockTask, 'IN_PROGRESS');
    expect(fs.writeFileSync).toHaveBeenCalledWith('plans/PLAN.md', 'plan content IN_PROGRESS', 'utf8');
    
    expect(execution.executeClaudeHeadless).toHaveBeenCalled();
    
    expect(parser.updateTaskStatus).toHaveBeenCalledWith('plan content IN_PROGRESS', mockTask, 'DONE');
    expect(fs.writeFileSync).toHaveBeenCalledWith('plans/PLAN.md', 'plan content DONE', 'utf8');
  });

  it('runs Claude and marks task FAILED on failure', async () => {
    const mockTask = { id: '2', status: 'NOT_DONE', originalText: '- [ ] task 2', headingContext: '' } as any;
    vi.mocked(parser.parsePlan).mockReturnValue({ planId: 'plan1', tasks: [mockTask] });
    vi.mocked(parser.determineNextTask).mockReturnValue(mockTask);
    vi.mocked(execution.checkClaudeSessionLimits).mockResolvedValue({ limitReached: false });
    vi.mocked(execution.executeClaudeHeadless).mockResolvedValue({ success: false, error: 'failed' });
    vi.mocked(parser.updateTaskStatus).mockReturnValueOnce('plan content IN_PROGRESS').mockReturnValueOnce('plan content FAILED');

    await runCommand({});

    expect(parser.updateTaskStatus).toHaveBeenCalledWith('plan content IN_PROGRESS', mockTask, 'FAILED');
    expect(fs.writeFileSync).toHaveBeenCalledWith('plans/PLAN.md', 'plan content FAILED', 'utf8');
  });
});
