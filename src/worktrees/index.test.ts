import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  getWorktreeBranchName, 
  promptForDirtyTaskWorktree,
  hasDirtyWorktree,
  createWorktree,
  removeWorktree
} from './index.js';
import * as prompts from '@clack/prompts';
import { execa } from 'execa';
import * as branchUtils from '../git/branch.js';
import * as fs from 'fs/promises';

vi.mock('@clack/prompts', () => ({
  select: vi.fn(),
  isCancel: vi.fn(),
}));

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

vi.mock('../git/branch.js', () => ({
  sanitizeBranchName: vi.fn((name) => name),
  hasUncommittedChanges: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  stat: vi.fn(),
}));

describe('Worktree Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getWorktreeBranchName', () => {
    it('should derive branch name from plan ID', () => {
      const result = getWorktreeBranchName('plan123');
      expect(result).toBe('plan123');
      expect(branchUtils.sanitizeBranchName).toHaveBeenCalledWith('plan123');
    });
  });

  describe('promptForDirtyTaskWorktree', () => {
    it('should return selected action', async () => {
      vi.mocked(prompts.select).mockResolvedValueOnce('retry');
      vi.mocked(prompts.isCancel).mockReturnValueOnce(false);
      
      const result = await promptForDirtyTaskWorktree();
      expect(result).toBe('retry');
    });

    it('should return halt on cancel', async () => {
      vi.mocked(prompts.select).mockResolvedValueOnce(undefined);
      vi.mocked(prompts.isCancel).mockReturnValueOnce(true);
      
      const result = await promptForDirtyTaskWorktree();
      expect(result).toBe('halt');
    });
  });

  describe('hasDirtyWorktree', () => {
    it('should return false if path does not exist', async () => {
      vi.mocked(fs.stat).mockRejectedValueOnce(new Error('ENOENT'));
      const result = await hasDirtyWorktree('/nonexistent');
      expect(result).toBe(false);
    });

    it('should return false if path is not a directory', async () => {
      vi.mocked(fs.stat).mockResolvedValueOnce({ isDirectory: () => false } as any);
      const result = await hasDirtyWorktree('/file');
      expect(result).toBe(false);
    });

    it('should return true if directory has uncommitted changes', async () => {
      vi.mocked(fs.stat).mockResolvedValueOnce({ isDirectory: () => true } as any);
      vi.mocked(branchUtils.hasUncommittedChanges).mockResolvedValueOnce(true);
      
      const result = await hasDirtyWorktree('/dirty-dir');
      expect(result).toBe(true);
    });
  });

  describe('createWorktree', () => {
    it('should create new branch if branch does not exist', async () => {
      vi.mocked(execa)
        .mockRejectedValueOnce(new Error('fatal: Needed a single revision')) // rev-parse fails
        .mockResolvedValueOnce({} as any); // worktree add succeeds
      
      await createWorktree('/worktree-path', 'my-branch', 'main', '/cwd');
      
      expect(execa).toHaveBeenNthCalledWith(1, 'git', ['rev-parse', '--verify', 'my-branch'], expect.any(Object));
      expect(execa).toHaveBeenNthCalledWith(2, 'git', ['worktree', 'add', '-b', 'my-branch', '/worktree-path', 'main'], expect.any(Object));
    });

    it('should checkout existing branch if branch exists', async () => {
      vi.mocked(execa)
        .mockResolvedValueOnce({ exitCode: 0 } as any) // rev-parse succeeds
        .mockResolvedValueOnce({} as any); // worktree add succeeds
      
      await createWorktree('/worktree-path', 'my-branch', 'main', '/cwd');
      
      expect(execa).toHaveBeenNthCalledWith(1, 'git', ['rev-parse', '--verify', 'my-branch'], expect.any(Object));
      expect(execa).toHaveBeenNthCalledWith(2, 'git', ['worktree', 'add', '/worktree-path', 'my-branch'], expect.any(Object));
    });
  });

  describe('removeWorktree', () => {
    it('should remove clean worktree', async () => {
      vi.mocked(fs.stat).mockResolvedValueOnce({ isDirectory: () => true } as any);
      vi.mocked(branchUtils.hasUncommittedChanges).mockResolvedValueOnce(false); // Clean
      
      await removeWorktree('/worktree-path', '/cwd');
      
      expect(execa).toHaveBeenCalledWith('git', ['worktree', 'remove', '/worktree-path'], expect.any(Object));
    });

    it('should throw if worktree is dirty', async () => {
      vi.mocked(fs.stat).mockResolvedValueOnce({ isDirectory: () => true } as any);
      vi.mocked(branchUtils.hasUncommittedChanges).mockResolvedValueOnce(true); // Dirty
      
      await expect(removeWorktree('/worktree-path', '/cwd')).rejects.toThrow('Cannot automatically delete dirty worktree: /worktree-path');
      expect(execa).not.toHaveBeenCalled();
    });
  });
});
