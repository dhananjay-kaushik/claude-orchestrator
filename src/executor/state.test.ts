import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadPlanState, savePlanState, getTaskState } from './state.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { PlanState, Config } from '../types/index.js';

vi.mock('node:fs/promises');

describe('Execution State Storage', () => {
  const mockConfig: Pick<Config, 'stateDir'> = {
    stateDir: '.claude-orchestrator/state',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadPlanState', () => {
    it('returns empty state if file does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValue({ code: 'ENOENT' });
      const state = await loadPlanState('plan-1', mockConfig as Config);
      expect(state).toEqual({ planId: 'plan-1', tasks: {} });
    });

    it('recovers gracefully from corrupt state file', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('invalid json');
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const state = await loadPlanState('plan-1', mockConfig as Config);
      expect(state).toEqual({ planId: 'plan-1', tasks: {} });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Failed to parse state file'),
      );
      consoleWarnSpy.mockRestore();
    });

    it('loads valid state', async () => {
      const validState: PlanState = {
        planId: 'plan-1',
        tasks: {
          'task-1': {
            id: 'task-1',
            attempts: 1,
            lastStatus: 'NOT_DONE',
            logFilePaths: [],
            claudeExitCodes: [],
            jsonResponsePaths: [],
            verificationResults: [],
          },
        },
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(validState));
      const state = await loadPlanState('plan-1', mockConfig as Config);
      expect(state).toEqual(validState);
    });
  });

  describe('savePlanState', () => {
    it('writes state to the correct path', async () => {
      const state: PlanState = { planId: 'plan-1', tasks: {} };
      await savePlanState(state, mockConfig as Config);

      const expectedPath = path.join(process.cwd(), '.claude-orchestrator', 'state', 'plan-1.json');
      expect(fs.mkdir).toHaveBeenCalledWith(path.dirname(expectedPath), { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        expectedPath,
        JSON.stringify(state, null, 2),
        'utf-8',
      );
    });
  });

  describe('getTaskState', () => {
    it('returns existing task state', () => {
      const state: PlanState = {
        planId: 'plan-1',
        tasks: {
          'task-1': {
            id: 'task-1',
            attempts: 2,
            lastStatus: 'FAILED',
            logFilePaths: [],
            claudeExitCodes: [],
            jsonResponsePaths: [],
            verificationResults: [],
          },
        },
      };
      const taskState = getTaskState(state, 'task-1');
      expect(taskState.attempts).toBe(2);
      expect(taskState.lastStatus).toBe('FAILED');
    });

    it('initializes new task state if not present', () => {
      const state: PlanState = { planId: 'plan-1', tasks: {} };
      const taskState = getTaskState(state, 'task-1');
      expect(taskState.id).toBe('task-1');
      expect(taskState.attempts).toBe(0);
      expect(taskState.lastStatus).toBe('NOT_DONE');
      expect(state.tasks['task-1']).toBe(taskState);
    });
  });
});
