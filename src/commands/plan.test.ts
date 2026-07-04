import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPlanCommand } from './plan.js';
import * as p from '@clack/prompts';
import { execa } from 'execa';
import * as fs from 'fs/promises';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  text: vi.fn(),
  isCancel: vi.fn(),
  cancel: vi.fn(),
  log: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

vi.mock('../config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    models: { planning: 'claude-3-7-sonnet-20250219' },
    planDir: 'docs/plans',
    claude: { binary: 'claude' }
  }),
}));

vi.mock('fs/promises', async (importOriginal) => {
  const mod = await importOriginal<typeof import('fs/promises')>();
  return {
    ...mod,
    mkdir: vi.fn(),
  };
});

describe('runPlanCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  it('should prompt for model and plan directory', async () => {
    vi.mocked(p.text).mockResolvedValueOnce('claude-3-7-sonnet-20250219');
    vi.mocked(p.text).mockResolvedValueOnce('docs/plans');
    vi.mocked(execa).mockResolvedValueOnce({} as any);

    await runPlanCommand({});

    expect(p.text).toHaveBeenCalledTimes(2);
    expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('docs/plans'), { recursive: true });
    expect(execa).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['-p', expect.stringContaining('docs/plans')]),
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  it('should handle non-zero Claude exits gracefully', async () => {
    vi.mocked(p.text).mockResolvedValueOnce('claude-3-7-sonnet-20250219');
    vi.mocked(p.text).mockResolvedValueOnce('docs/plans');
    
    const execaError: any = new Error('Command failed');
    execaError.exitCode = 1;
    vi.mocked(execa).mockRejectedValueOnce(execaError);

    await runPlanCommand({});

    expect(p.outro).toHaveBeenCalledWith(expect.stringContaining('exited with code 1'));
    expect(process.exit).not.toHaveBeenCalled();
  });
});
