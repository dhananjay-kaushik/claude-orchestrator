import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execa } from 'execa';
import {
  isGitRepository,
  initializeGitRepository,
  getAvailableBranches,
  resolveDefaultBranch,
} from './repo.js';

describe('Git Repository Helpers', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-orch-git-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('detects when not a git repository', async () => {
    const isGit = await isGitRepository(tempDir);
    expect(isGit).toBe(false);
  });

  it('initializes a git repository and detects it', async () => {
    await initializeGitRepository(tempDir);
    const isGit = await isGitRepository(tempDir);
    expect(isGit).toBe(true);
  });

  it('gets available branches', async () => {
    await initializeGitRepository(tempDir);
    await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: tempDir });
    await execa('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
    await fs.writeFile(path.join(tempDir, 'a.txt'), 'hello');
    await execa('git', ['add', 'a.txt'], { cwd: tempDir });
    await execa('git', ['commit', '-m', 'Initial commit'], { cwd: tempDir });

    await execa('git', ['branch', 'feature/test'], { cwd: tempDir });

    const branches = await getAvailableBranches(tempDir);
    expect(branches.length).toBeGreaterThanOrEqual(1);
    expect(branches).toContain('feature/test');
  });

  it('resolves default branch from available branches', async () => {
    await initializeGitRepository(tempDir);
    await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: tempDir });
    await execa('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
    await fs.writeFile(path.join(tempDir, 'a.txt'), 'hello');
    await execa('git', ['add', 'a.txt'], { cwd: tempDir });
    await execa('git', ['commit', '-m', 'Initial commit'], { cwd: tempDir });

    const { stdout: currentBranch } = await execa('git', ['branch', '--show-current'], {
      cwd: tempDir,
    });

    const defaultBranch = await resolveDefaultBranch(currentBranch.trim(), tempDir);
    expect(defaultBranch).toBe(currentBranch.trim());
  });

  it('resolves default branch to existing branch if config default is missing', async () => {
    await initializeGitRepository(tempDir);
    await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: tempDir });
    await execa('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
    await execa('git', ['checkout', '-b', 'prod'], { cwd: tempDir });
    await fs.writeFile(path.join(tempDir, 'a.txt'), 'hello');
    await execa('git', ['add', 'a.txt'], { cwd: tempDir });
    await execa('git', ['commit', '-m', 'Initial commit'], { cwd: tempDir });

    const defaultBranch = await resolveDefaultBranch('non-existent-branch', tempDir);
    expect(defaultBranch).toBe('prod');
  });
});
