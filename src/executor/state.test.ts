import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveTaskExecutionResult } from './state.js';
import fs from 'node:fs/promises';
import path from 'node:path';

vi.mock('node:fs/promises');

describe('state storage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should save raw JSON and parsed sentinel to a state file', async () => {
    const config = { stateDir: '.claude-orchestrator/state' } as any;
    const planId = 'plan-123';
    const taskId = 'task-abc';
    const rawJson = '{"result": "output\\nORCHESTRATOR_RESULT: SUCCESS"}';
    const sentinel = { type: 'SUCCESS' as const };

    await saveTaskExecutionResult(config, planId, taskId, rawJson, sentinel);

    const expectedDir = path.join(process.cwd(), '.claude-orchestrator/state', 'plan-123');
    const expectedFile = path.join(expectedDir, 'task-abc.json');

    expect(fs.mkdir).toHaveBeenCalledWith(expectedDir, { recursive: true });

    // Check what was written
    const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
    expect(writeCall[0]).toBe(expectedFile);

    const writtenData = JSON.parse(writeCall[1] as string);
    expect(writtenData.rawJson).toBe(rawJson);
    expect(writtenData.sentinel).toEqual(sentinel);
    expect(writtenData.timestamp).toBeDefined();
  });
});
