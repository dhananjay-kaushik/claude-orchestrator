import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as p from '@clack/prompts';
import { discoverPlan } from './discovery.js';

vi.mock('fs/promises');
vi.mock('@clack/prompts');

describe('discoverPlan', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return null if planDir does not exist', async () => {
    const error = new Error('ENOENT');
    (error as NodeJS.ErrnoException).code = 'ENOENT';
    vi.mocked(fs.readdir).mockRejectedValue(error);

    const result = await discoverPlan({ planDir: 'missing-dir' });

    expect(result).toBeNull();
    expect(p.log.warn).toHaveBeenCalledWith(expect.stringContaining('missing-dir'));
  });

  it('should return null if no markdown files are found', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'not-a-plan.txt', isFile: () => true, isDirectory: () => false },
      { name: 'somedir.md', isFile: () => false, isDirectory: () => true },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    const result = await discoverPlan({ planDir: 'empty-dir' });

    expect(result).toBeNull();
    expect(p.log.warn).toHaveBeenCalledWith(expect.stringContaining('No Markdown plans found'));
  });

  it('should present a selector and return the selected plan', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'plan1.md', isFile: () => true, isDirectory: () => false },
      { name: 'plan2.md', isFile: () => true, isDirectory: () => false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    vi.mocked(fs.stat).mockImplementation(async (filePath) => {
      if (filePath.toString().includes('plan1.md')) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { mtime: new Date('2023-01-01T10:00:00Z') } as any;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { mtime: new Date('2023-01-02T10:00:00Z') } as any;
    });

    vi.mocked(p.select).mockResolvedValue(path.resolve(process.cwd(), 'plans', 'plan2.md'));

    const result = await discoverPlan({ planDir: 'plans' });

    expect(fs.readdir).toHaveBeenCalled();
    expect(p.select).toHaveBeenCalled();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callArgs = vi.mocked(p.select).mock.calls[0][0] as any;
    expect(callArgs.options).toHaveLength(2);
    // plan2 should be first because it is newer
    expect(callArgs.options[0].label).toBe('plan2.md');
    expect(result).toBe(path.resolve(process.cwd(), 'plans', 'plan2.md'));
  });

  it('should return null if selection is cancelled', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'plan1.md', isFile: () => true, isDirectory: () => false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.stat).mockResolvedValue({ mtime: new Date() } as any);
    
    vi.mocked(p.select).mockResolvedValue(new Error('cancel'));
    vi.mocked(p.isCancel).mockReturnValue(true);

    const result = await discoverPlan({ planDir: 'plans' });

    expect(result).toBeNull();
    expect(p.cancel).toHaveBeenCalledWith('Plan selection cancelled.');
  });
});
