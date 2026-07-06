import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { provisionWorktreeDependencies } from './index.js';

describe('provisionWorktreeDependencies', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
  });

  async function tmpDir() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ponytail-worktree-'));
    dirs.push(dir);
    return dir;
  }

  it('symlinks node_modules and venv dirs from cwd into the worktree, skipping nested ones and .git', async () => {
    const cwd = await tmpDir();
    const worktree = await tmpDir();

    await fs.mkdir(path.join(cwd, 'node_modules', 'some-pkg'), { recursive: true });
    await fs.mkdir(path.join(cwd, 'apps', 'web', 'node_modules'), { recursive: true });
    await fs.mkdir(path.join(cwd, 'apps', 'worker', 'venv', 'bin'), { recursive: true });
    await fs.mkdir(path.join(cwd, '.git', 'node_modules'), { recursive: true }); // should be skipped

    await provisionWorktreeDependencies(worktree, cwd);

    const rootLink = await fs.lstat(path.join(worktree, 'node_modules'));
    expect(rootLink.isSymbolicLink()).toBe(true);

    const webLink = await fs.lstat(path.join(worktree, 'apps', 'web', 'node_modules'));
    expect(webLink.isSymbolicLink()).toBe(true);

    const venvLink = await fs.lstat(path.join(worktree, 'apps', 'worker', 'venv'));
    expect(venvLink.isSymbolicLink()).toBe(true);
    expect(await fs.stat(path.join(worktree, 'apps', 'worker', 'venv', 'bin'))).toBeTruthy();

    await expect(fs.lstat(path.join(worktree, '.git'))).rejects.toThrow();
  });

  it('does not overwrite a dependency dir that already exists in the worktree', async () => {
    const cwd = await tmpDir();
    const worktree = await tmpDir();

    await fs.mkdir(path.join(cwd, 'node_modules'), { recursive: true });
    await fs.mkdir(path.join(worktree, 'node_modules'), { recursive: true });
    await fs.writeFile(path.join(worktree, 'node_modules', 'marker.txt'), 'keep-me');

    await provisionWorktreeDependencies(worktree, cwd);

    const stat = await fs.lstat(path.join(worktree, 'node_modules'));
    expect(stat.isSymbolicLink()).toBe(false);
    expect(await fs.readFile(path.join(worktree, 'node_modules', 'marker.txt'), 'utf8')).toBe('keep-me');
  });
});
