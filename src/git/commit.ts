import { execa } from 'execa';

/**
 * Stages all changes in the given directory using `git add -A`.
 */
export async function stageAllChanges(cwd = process.cwd()): Promise<void> {
  await execa('git', ['add', '-A'], { cwd });
}

/**
 * Checks if there are any staged changes ready to be committed.
 */
export async function hasStagedChanges(cwd = process.cwd()): Promise<boolean> {
  try {
    const { exitCode } = await execa('git', ['diff', '--cached', '--quiet'], { cwd, reject: false });
    return exitCode === 1;
  } catch {
    return false;
  }
}

/**
 * Creates a commit with the specified message.
 * Returns the commit hash.
 */
export async function createCommit(message: string, cwd = process.cwd()): Promise<string> {
  await execa('git', ['commit', '-m', message], { cwd });
  return getLatestCommitHash(cwd);
}

/**
 * Returns the hash of the latest commit.
 */
export async function getLatestCommitHash(cwd = process.cwd()): Promise<string> {
  const { stdout } = await execa('git', ['rev-parse', 'HEAD'], { cwd });
  return stdout.trim();
}

/**
 * Formats a commit message using the template and variables.
 */
export function formatCommitMessage(
  template: string,
  vars: { planName?: string; taskId?: string; taskText?: string } = {}
): string {
  let msg = template;
  if (vars.planName) msg = msg.replace(/\{planName\}/g, vars.planName);
  if (vars.taskId) msg = msg.replace(/\{taskId\}/g, vars.taskId);
  if (vars.taskText) msg = msg.replace(/\{taskText\}/g, vars.taskText);
  return msg;
}
