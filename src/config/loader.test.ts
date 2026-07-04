import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadConfig } from './loader';
import * as fs from 'fs/promises';
import * as path from 'path';

vi.mock('fs/promises');

describe('Config Loader', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('merges valid user config with defaults', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        planDir: 'my-plans',
        maxRetries: 5,
      }),
    );

    const config = await loadConfig();
    expect(config.planDir).toBe('my-plans');
    expect(config.maxRetries).toBe(5);
    expect(config.taskTimeoutMs).toBe(300000); // from defaults
  });

  it('rejects protected paths that escape process.cwd()', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        security: {
          protectedPaths: ['../escaped-path'],
        },
      }),
    );

    await expect(loadConfig()).rejects.toThrow(/escapes process\.cwd/);
  });

  it('returns defaults when no config file exists', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );

    const config = await loadConfig();
    expect(config.planDir).toBe('workflow_generated_plans');
  });

  it('rejects invalid schema values', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        maxRetries: 20, // Exceeds upper bound
      }),
    );

    await expect(loadConfig()).rejects.toThrow(/Max retries cannot exceed 10/);
  });
});
