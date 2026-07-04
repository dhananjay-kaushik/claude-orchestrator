import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeClaudeHeadless } from './execution.js';
import { execa } from 'execa';
import * as fs from 'fs/promises';
import { Config, ClaudeJSONResponse } from '../types/index.js';

vi.mock('execa');
vi.mock('fs/promises');

describe('executeClaudeHeadless', () => {
  const mockConfig = {
    claude: {
      binary: 'claude',
      permissionMode: 'auto',
      allowedTools: ['read_file', 'write_file'],
    },
    taskTimeoutMs: 10000,
  } as unknown as Config;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses valid JSON response successfully with sentinel', async () => {
    const mockResponse: ClaudeJSONResponse = {
      result: 'task completed\nORCHESTRATOR_RESULT: SUCCESS',
      total_cost_usd: 0.1,
      usage: { tokens: 100 },
      session_id: 'session-123',
    };

    vi.mocked(execa).mockResolvedValueOnce({
      stdout: JSON.stringify(mockResponse),
      exitCode: 0,
    } as any);

    const outcome = await executeClaudeHeadless(mockConfig, 'prompt', 'logs', 'task-1');

    expect(outcome.success).toBe(true);
    expect(outcome.response).toEqual(mockResponse);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.sentinel).toEqual({ type: 'SUCCESS' });
    expect(fs.writeFile).toHaveBeenCalledWith(
      'logs/task-1-claude-response.json',
      JSON.stringify(mockResponse),
      'utf-8'
    );
  });

  it('fails when sentinel is missing', async () => {
    const mockResponse: ClaudeJSONResponse = {
      result: 'task completed without sentinel',
    };

    vi.mocked(execa).mockResolvedValueOnce({
      stdout: JSON.stringify(mockResponse),
      exitCode: 0,
    } as any);

    const outcome = await executeClaudeHeadless(mockConfig, 'prompt', 'logs', 'task-1');

    expect(outcome.success).toBe(false);
    expect(outcome.error).toBe('Missing required ORCHESTRATOR_RESULT sentinel');
    expect(outcome.sentinel).toBeNull();
  });

  it('fails on malformed JSON', async () => {
    vi.mocked(execa).mockResolvedValueOnce({
      stdout: 'not json',
      exitCode: 0,
    } as any);

    const outcome = await executeClaudeHeadless(mockConfig, 'prompt', 'logs', 'task-1');

    expect(outcome.success).toBe(false);
    expect(outcome.error).toBe('Malformed JSON response from Claude');
    expect(fs.writeFile).toHaveBeenCalledWith(
      'logs/task-1-claude-response.json',
      'not json',
      'utf-8'
    );
  });

  it('fails when is_error is true', async () => {
    const mockResponse: ClaudeJSONResponse = {
      result: 'error occurred',
      is_error: true,
    };

    vi.mocked(execa).mockResolvedValueOnce({
      stdout: JSON.stringify(mockResponse),
      exitCode: 0,
    } as any);

    const outcome = await executeClaudeHeadless(mockConfig, 'prompt', 'logs', 'task-1');

    expect(outcome.success).toBe(false);
    expect(outcome.error).toBe('Claude execution returned is_error: true');
    expect(outcome.response).toEqual(mockResponse);
  });

  it('fails when result is missing', async () => {
    const mockResponse: Partial<ClaudeJSONResponse> = {
      total_cost_usd: 0.1,
    };

    vi.mocked(execa).mockResolvedValueOnce({
      stdout: JSON.stringify(mockResponse),
      exitCode: 0,
    } as any);

    const outcome = await executeClaudeHeadless(mockConfig, 'prompt', 'logs', 'task-1');

    expect(outcome.success).toBe(false);
    expect(outcome.error).toBe('Claude execution missing required result field');
    expect(outcome.response).toEqual(mockResponse);
  });

  it('handles execa errors (e.g. timeout)', async () => {
    const error = new Error('Command failed with timeout') as any;
    error.exitCode = 124;
    error.stdout = '{"result": "partial"}';

    vi.mocked(execa).mockRejectedValueOnce(error);

    const outcome = await executeClaudeHeadless(mockConfig, 'prompt', 'logs', 'task-1');

    expect(outcome.success).toBe(false);
    expect(outcome.error).toBe('Command failed with timeout');
    expect(outcome.exitCode).toBe(124);
    expect(outcome.response).toEqual({ result: 'partial' });
    expect(fs.writeFile).toHaveBeenCalledWith(
      'logs/task-1-claude-response.json',
      '{"result": "partial"}',
      'utf-8'
    );
  });

  it('parses session limit reached from execa errors', async () => {
    const error = new Error('Command failed') as any;
    error.exitCode = 1;
    error.stdout = 'Error: Claude session limit reached. Resets in 2 hours.';

    vi.mocked(execa).mockRejectedValueOnce(error);

    const outcome = await executeClaudeHeadless(mockConfig, 'prompt', 'logs', 'task-1');

    expect(outcome.success).toBe(false);
    expect(outcome.sessionLimitReached).toBe(true);
    expect(outcome.limitResetTime).toBe('2 hours');
  });

  it('parses session limit reached from is_error JSON', async () => {
    const mockResponse: ClaudeJSONResponse = {
      result: 'Usage limit exceeded. Resets in 45 minutes',
      is_error: true,
    };

    vi.mocked(execa).mockResolvedValueOnce({
      stdout: JSON.stringify(mockResponse),
      exitCode: 0,
    } as any);

    const outcome = await executeClaudeHeadless(mockConfig, 'prompt', 'logs', 'task-1');

    expect(outcome.success).toBe(false);
    expect(outcome.sessionLimitReached).toBe(true);
    expect(outcome.limitResetTime).toBe('45 minutes');
  });
});

import { checkClaudeSessionLimits } from './execution.js';

describe('checkClaudeSessionLimits', () => {
  const mockConfig = {
    claude: { binary: 'claude' },
  } as unknown as Config;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns limitReached false if no limit is mentioned', async () => {
    vi.mocked(execa).mockResolvedValueOnce({
      stdout: JSON.stringify({ result: 'status OK', usage: { tokens: 10 } }),
      exitCode: 0,
    } as any);

    const info = await checkClaudeSessionLimits(mockConfig);
    expect(info.limitReached).toBe(false);
    expect(info.usage).toEqual({ tokens: 10 });
  });

  it('returns limitReached true if JSON says limit reached', async () => {
    vi.mocked(execa).mockResolvedValueOnce({
      stdout: JSON.stringify({ result: 'Session limit reached. Resets in 1 hour.' }),
      exitCode: 0,
    } as any);

    const info = await checkClaudeSessionLimits(mockConfig);
    expect(info.limitReached).toBe(true);
    expect(info.resetTime).toBe('1 hour');
  });

  it('returns limitReached true if execa throws with limit error', async () => {
    const error = new Error('Command failed') as any;
    error.stderr = 'Usage limit reached! Resets in 30 mins.';
    vi.mocked(execa).mockRejectedValueOnce(error);

    const info = await checkClaudeSessionLimits(mockConfig);
    expect(info.limitReached).toBe(true);
    expect(info.resetTime).toBe('30 mins');
  });
});
