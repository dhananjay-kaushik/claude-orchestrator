import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execa } from 'execa';
import {
  sanitizeBranchName,
  hasUncommittedChanges,
  createAndCheckoutBranch
} from './branch.js';
import { initializeGitRepository } from './repo.js';

describe('Branch Management Utilities', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-orch-branch-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('sanitizeBranchName', () => {
    it('lowercases branch names', () => {
      expect(sanitizeBranchName('Feature-Login')).toBe('feature-login');
    });

    it('replaces invalid characters with hyphens', () => {
      expect(sanitizeBranchName('fix: login bug!')).toBe('fix-login-bug');
    });

    it('removes consecutive hyphens', () => {
      expect(sanitizeBranchName('fix---login___bug')).toBe('fix-login-bug');
    });

    it('removes leading and trailing hyphens', () => {
      expect(sanitizeBranchName('-fix-login-')).toBe('fix-login');
    });

    it('allows slashes', () => {
      expect(sanitizeBranchName('feature/login-page')).toBe('feature/login-page');
    });
  });

  describe('hasUncommittedChanges', () => {
    it('returns false for clean repo', async () => {
      await initializeGitRepository(tempDir);
      await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: tempDir });
      await execa('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
      
      await fs.writeFile(path.join(tempDir, 'a.txt'), 'hello');
      await execa('git', ['add', 'a.txt'], { cwd: tempDir });
      await execa('git', ['commit', '-m', 'Initial commit'], { cwd: tempDir });

      const isDirty = await hasUncommittedChanges(tempDir);
      expect(isDirty).toBe(false);
    });

    it('returns true for dirty repo', async () => {
      await initializeGitRepository(tempDir);
      
      await fs.writeFile(path.join(tempDir, 'a.txt'), 'hello');

      const isDirty = await hasUncommittedChanges(tempDir);
      expect(isDirty).toBe(true);
    });

    it('returns false if not a git repo', async () => {
      const isDirty = await hasUncommittedChanges(tempDir);
      expect(isDirty).toBe(false);
    });
  });

  describe('createAndCheckoutBranch', () => {
    it('creates and checks out a new branch', async () => {
      await initializeGitRepository(tempDir);
      await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: tempDir });
      await execa('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
      
      await fs.writeFile(path.join(tempDir, 'a.txt'), 'hello');
      await execa('git', ['add', 'a.txt'], { cwd: tempDir });
      await execa('git', ['commit', '-m', 'Initial commit'], { cwd: tempDir });

      await createAndCheckoutBranch('feature/test', tempDir);

      const { stdout: currentBranch } = await execa('git', ['branch', '--show-current'], { cwd: tempDir });
      expect(currentBranch.trim()).toBe('feature/test');
    });
  });
});
