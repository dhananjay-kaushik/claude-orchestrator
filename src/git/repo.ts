import { execa } from 'execa';

/**
 * Checks whether the specified directory is within a Git repository.
 */
export async function isGitRepository(cwd = process.cwd()): Promise<boolean> {
  try {
    const { exitCode } = await execa('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd,
      reject: false,
    });
    return exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Initializes a new Git repository in the specified directory.
 */
export async function initializeGitRepository(cwd = process.cwd()): Promise<void> {
  await execa('git', ['init'], { cwd });
}

/**
 * Gets all local branches in the Git repository.
 */
export async function getAvailableBranches(cwd = process.cwd()): Promise<string[]> {
  try {
    const { stdout } = await execa('git', ['branch', '--format=%(refname:short)'], { cwd });
    return stdout
      .split('\n')
      .map((b) => b.trim())
      .filter((b) => b.length > 0);
  } catch {
    return [];
  }
}

/**
 * Resolves the default branch. If the configured default branch exists, returns it.
 * Otherwise, falls back to common branch names or the first available branch.
 * If no branches exist, returns the configured default.
 */
export async function resolveDefaultBranch(
  configDefaultBranch: string,
  cwd = process.cwd(),
): Promise<string> {
  const branches = await getAvailableBranches(cwd);

  if (branches.includes(configDefaultBranch)) {
    return configDefaultBranch;
  }

  if (branches.includes('main')) return 'main';
  if (branches.includes('master')) return 'master';
  if (branches.length > 0) return branches[0];

  return configDefaultBranch;
}
