import { execa } from 'execa';
import { isCancel, select } from '@clack/prompts';
import { sanitizeBranchName, hasUncommittedChanges } from '../git/branch.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const DEP_DIR_NAMES = new Set(['node_modules', 'venv', '.venv']);
const SKIP_DIR_NAMES = new Set(['.git', '.claude-orchestrator', '.next', '.turbo', 'dist', 'build']);

async function findDependencyDirs(dir: string, results: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (DEP_DIR_NAMES.has(entry.name)) {
      results.push(path.join(dir, entry.name));
      continue;
    }
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    await findDependencyDirs(path.join(dir, entry.name), results);
  }
  return results;
}

export type WorktreeResumeAction = 'continue' | 'retry' | 'halt';

/**
 * Prompts the user on how to handle a dirty task worktree.
 */
export async function promptForDirtyTaskWorktree(): Promise<WorktreeResumeAction> {
  const action = await select({
    message: 'The task worktree has uncommitted changes. How would you like to proceed?',
    options: [
      { value: 'continue', label: 'Continue in existing worktree (keep changes)' },
      { value: 'retry', label: 'Retry from a clean base' },
      { value: 'halt', label: 'Halt execution' },
    ]
  });

  if (isCancel(action)) {
    return 'halt';
  }

  return action as WorktreeResumeAction;
}

/**
 * Derives the single branch name shared by all tasks in a plan.
 */
export function getWorktreeBranchName(planId: string): string {
  return sanitizeBranchName(planId);
}

/**
 * Checks if the specified worktree path has uncommitted changes.
 */
export async function hasDirtyWorktree(worktreePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(worktreePath);
    if (!stat.isDirectory()) return false;
    return await hasUncommittedChanges(worktreePath);
  } catch {
    return false;
  }
}

/**
 * Creates an isolated worktree for a task.
 */
export async function createWorktree(
  worktreePath: string,
  branchName: string,
  baseBranch: string,
  cwd = process.cwd()
): Promise<void> {
  let branchExists = false;
  try {
    const { exitCode } = await execa('git', ['rev-parse', '--verify', branchName], { cwd, reject: false });
    branchExists = exitCode === 0;
  } catch {
    // Ignore error
  }

  await execa('git', ['worktree', 'prune'], { cwd });

  try {
    if (branchExists) {
      await execa('git', ['worktree', 'add', worktreePath, branchName], { cwd });
    } else {
      await execa('git', ['worktree', 'add', '-b', branchName, worktreePath, baseBranch], { cwd });
    }
  } catch (error: any) {
    if (!error.message.includes('already exists') && !error.message.includes('already used by worktree')) {
      throw error;
    }
  }
}

/**
 * Symlinks node_modules and Python venv directories from the main checkout into a
 * freshly created worktree, since these are gitignored and won't exist there otherwise.
 * Skips any path that already exists in the worktree.
 */
export async function provisionWorktreeDependencies(worktreePath: string, cwd = process.cwd()): Promise<void> {
  const depDirs = await findDependencyDirs(cwd);
  for (const depDir of depDirs) {
    const relPath = path.relative(cwd, depDir);
    const target = path.join(worktreePath, relPath);
    try {
      await fs.access(target);
      continue;
    } catch {
      // doesn't exist yet, create the symlink below
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.symlink(depDir, target, 'dir');
  }
}

/**
 * Merges a completed task branch into the base branch from the main worktree.
 * Refuses if the main worktree itself has uncommitted changes, since checkout would clobber them.
 */
export async function mergeWorktreeBranch(
  branchName: string,
  baseBranch: string,
  cwd = process.cwd()
): Promise<void> {
  if (await hasUncommittedChanges(cwd)) {
    throw new Error(`Cannot auto-merge: ${cwd} has uncommitted changes.`);
  }
  await execa('git', ['checkout', baseBranch], { cwd });
  await execa('git', ['merge', '--no-edit', branchName], { cwd });
}

/**
 * Removes a worktree if it is clean. Never deletes a dirty worktree automatically.
 */
export async function removeWorktree(worktreePath: string, cwd = process.cwd()): Promise<void> {
  const isDirty = await hasDirtyWorktree(worktreePath);
  if (isDirty) {
    throw new Error(`Cannot automatically delete dirty worktree: ${worktreePath}`);
  }
  
  try {
    await execa('git', ['worktree', 'remove', worktreePath], { cwd });
  } catch {
    // Ignore if removal fails (e.g., if it doesn't exist)
  }
}
