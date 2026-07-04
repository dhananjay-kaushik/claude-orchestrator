import { Config, VerificationCommand } from '../types/index.js';

export class PolicyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyViolationError';
  }
}

/**
 * Validates a verification command against the security policy.
 * Throws PolicyViolationError if the command is unsafe.
 */
export function validateVerificationCommand(config: Config, cmd: VerificationCommand): void {
  const DENIED_COMMANDS = ['rm', 'rmdir', 'chmod', 'chown', 'kill', 'pkill', 'killall'];
  const deniedList = new Set([...DENIED_COMMANDS, ...(config.security?.deniedCommands || [])]);

  // Strip potential paths to get the base executable name
  const commandParts = cmd.command.split('/');
  const baseCommand = commandParts[commandParts.length - 1];

  if (deniedList.has(baseCommand)) {
    throw new PolicyViolationError(`Command '${baseCommand}' is in the denylist.`);
  }

  // Block destructive Git commands regardless of config
  if (baseCommand === 'git') {
    const destructiveGitArgs = [
      'reset',
      'clean',
      'push',
      'rebase',
      'commit',
      'checkout',
      'branch',
      'rm',
      'amend',
    ];
    // Check if any argument is a destructive command
    // (A naive check, but sufficient for MVP safety given we don't expect git to be used as a verification command anyway)
    if (cmd.args.some((arg) => destructiveGitArgs.includes(arg))) {
      throw new PolicyViolationError(`Destructive git operations are blocked.`);
    }
  }

  // Block shell fragments, inline command chains, redirection, command substitution, and environment interpolation
  const SHELL_CHARACTERS = /[&|<>;$()`\n]/;
  if (SHELL_CHARACTERS.test(cmd.command)) {
    throw new PolicyViolationError(
      `Shell fragments and operators are not allowed in command executables.`,
    );
  }
  for (const arg of cmd.args) {
    if (SHELL_CHARACTERS.test(arg)) {
      throw new PolicyViolationError(
        `Shell fragments and operators are not allowed in command arguments.`,
      );
    }
  }

  // Require explicit user confirmation for any command outside the allowlist
  if (config.security?.allowedCommands && config.security.allowedCommands.length > 0) {
    if (!config.security.allowedCommands.includes(baseCommand)) {
      throw new PolicyViolationError(
        `Command '${baseCommand}' is not in the allowedCommands list. Explicit user confirmation is required.`,
      );
    }
  }
}

/**
 * Validates Claude permission mode and allowed tools before execution.
 * Throws PolicyViolationError if settings are unsafe.
 */
export function validateClaudePermissions(config: Config): void {
  if (config.claude?.extraSafeArgs?.includes('--dangerously-skip-permissions')) {
    throw new PolicyViolationError(
      `'--dangerously-skip-permissions' is not allowed for normal execution.`,
    );
  }
}
