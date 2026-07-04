import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPlanCommand } from './plan.js';
import * as p from '@clack/prompts';
import { execa } from 'execa';
import * as fs from 'fs/promises';
import { loadConfig } from '../config/loader.js';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  text: vi.fn(),
  select: vi.fn(),
  isCancel: vi.fn(),
  cancel: vi.fn(),
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

vi.mock('../config/loader.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('fs/promises', async (importOriginal) => {
  const mod = await importOriginal<typeof import('fs/promises')>();
  return {
    ...mod,
    mkdir: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
  };
});

describe('runPlanCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    vi.mocked(loadConfig).mockResolvedValue({
      models: { planning: 'claude-sonnet-5' },
      planDir: 'docs/plans',
      claude: { binary: 'claude' },
    } as any);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
    vi.mocked(fs.readdir).mockResolvedValue([]);
  });

  it('should prompt for model, plan directory, and mode, then create a new plan', async () => {
    vi.mocked(p.select)
      .mockResolvedValueOnce('claude-sonnet-5') // model
      .mockResolvedValueOnce('create'); // mode
    vi.mocked(p.text).mockResolvedValueOnce('docs/plans'); // plan dir
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce([] as any) // filesBefore
      .mockResolvedValueOnce([{ name: 'new-plan.md', isFile: () => true }] as any); // filesAfter
    vi.mocked(execa).mockResolvedValueOnce({} as any);

    await runPlanCommand({});

    expect(p.text).toHaveBeenCalledTimes(1);
    expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('docs/plans'), {
      recursive: true,
    });
    expect(execa).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['--model', 'claude-sonnet-5', expect.stringContaining('docs/plans')]),
      expect.objectContaining({ stdio: 'inherit' }),
    );
    expect(p.outro).toHaveBeenCalledWith(expect.stringContaining('new-plan.md'));
  });

  it('should let the user pick and edit an existing plan', async () => {
    vi.mocked(p.select)
      .mockResolvedValueOnce('claude-sonnet-5') // model
      .mockResolvedValueOnce('edit') // mode
      .mockResolvedValueOnce('/resolved/docs/plans/existing.md'); // discoverPlan's select
    vi.mocked(p.text).mockResolvedValueOnce('docs/plans'); // plan dir
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      { name: 'existing.md', isFile: () => true },
    ] as any); // discoverPlan listing
    vi.mocked(fs.stat)
      .mockResolvedValueOnce({ mtime: new Date('2024-01-01') } as any) // discoverPlan metadata
      .mockResolvedValueOnce({ mtimeMs: 1 } as any) // before edit
      .mockResolvedValueOnce({ mtimeMs: 2 } as any); // after edit
    vi.mocked(execa).mockResolvedValueOnce({} as any);

    await runPlanCommand({});

    expect(execa).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['--model', 'claude-sonnet-5', expect.stringContaining('existing.md')]),
      expect.objectContaining({ stdio: 'inherit' }),
    );
    expect(p.outro).toHaveBeenCalledWith(expect.stringContaining('Plan updated'));
  });

  it('should handle non-zero Claude exits gracefully', async () => {
    vi.mocked(p.select)
      .mockResolvedValueOnce('claude-sonnet-5') // model
      .mockResolvedValueOnce('create'); // mode
    vi.mocked(p.text).mockResolvedValueOnce('docs/plans'); // plan dir

    const execaError: any = new Error('Command failed');
    execaError.exitCode = 1;
    vi.mocked(execa).mockRejectedValueOnce(execaError);

    await runPlanCommand({});

    expect(p.outro).toHaveBeenCalledWith(expect.stringContaining('exited with code 1'));
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('should handle SIGINT cancellation gracefully', async () => {
    vi.mocked(p.select)
      .mockResolvedValueOnce('claude-sonnet-5') // model
      .mockResolvedValueOnce('create'); // mode
    vi.mocked(p.text).mockResolvedValueOnce('docs/plans'); // plan dir

    const execaError: any = new Error('Command failed');
    execaError.signal = 'SIGINT';
    vi.mocked(execa).mockRejectedValueOnce(execaError);

    await runPlanCommand({});

    expect(p.outro).toHaveBeenCalledWith(expect.stringContaining('Planning interrupted'));
    expect(process.exit).not.toHaveBeenCalled();
  });
});
