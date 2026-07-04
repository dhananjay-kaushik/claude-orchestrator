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
});
