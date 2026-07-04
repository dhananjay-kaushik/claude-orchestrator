import { execa } from 'execa';
import { isCancel, text, select, confirm } from '@clack/prompts';

/**
 * Sanitizes a string to be a valid git branch name.
 * Replaces invalid characters with hyphens and removes consecutive hyphens.
 */
export function sanitizeBranchName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9/]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Checks if the current git repository has uncommitted changes.
 */
export async function hasUncommittedChanges(cwd = process.cwd()): Promise<boolean> {
  try {
    const { stdout } = await execa('git', ['status', '--porcelain'], { cwd });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Prompts the user for a branch name with a default derived from the plan name.
 */
export async function promptForBranchName(defaultName: string): Promise<string> {
  const sanitizedDefault = sanitizeBranchName(defaultName);
  const branchName = await text({
    message: 'What should we name the branch for this plan?',
    initialValue: sanitizedDefault,
    validate: (value) => {
      if (!value) return 'Branch name is required';
      const sanitized = sanitizeBranchName(value);
      if (value !== sanitized) return `Invalid characters. Try: ${sanitized}`;
    }
  });

  if (isCancel(branchName)) {
    throw new Error('Operation cancelled');
  }

  return branchName as string;
}

export type DirtyWorktreeAction = 'continue' | 'branch' | 'halt';

/**
 * Prompts the user on how to handle a dirty working tree.
 */
export async function promptForDirtyWorktree(): Promise<DirtyWorktreeAction> {
  const action = await select({
    message: 'The working tree has uncommitted changes. How would you like to proceed?',
    options: [
      { value: 'continue', label: 'Continue on current branch (keep changes)' },
      { value: 'branch', label: 'Create a new branch with these changes' },
      { value: 'halt', label: 'Halt execution' },
    ]
  });

  if (isCancel(action)) {
    return 'halt';
  }

  return action as DirtyWorktreeAction;
}

/**
 * Prompts to confirm the base branch.
 */
export async function confirmBaseBranch(baseBranch: string): Promise<boolean> {
  const isConfirmed = await confirm({
    message: `Use '${baseBranch}' as the base branch?`,
    initialValue: true,
  });

  if (isCancel(isConfirmed)) {
    throw new Error('Operation cancelled');
  }

  return isConfirmed as boolean;
}

/**
 * Creates and checks out a new branch.
 */
export async function createAndCheckoutBranch(branchName: string, cwd = process.cwd()): Promise<void> {
  await execa('git', ['checkout', '-b', branchName], { cwd });
}
