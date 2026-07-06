import { Config } from '../types/index.js';

export function buildClaudeCommand(
  config: Config,
  prompt: string,
  options?: { stream?: boolean },
): { command: string; args: string[]; stdin: string } {
  const command = config.claude?.binary || 'claude';
  // ponytail: prompt goes over stdin, not argv — a large retry-context prompt as a CLI
  // arg can exceed the OS ARG_MAX and crash with E2BIG. stdin has no such limit.
  const args = options?.stream
    ? ['-p', '--output-format', 'stream-json', '--verbose']
    : ['-p', '--output-format', 'json'];

  if (config.models?.execution) {
    args.push('--model', config.models.execution);
  }

  if (config.claude?.permissionMode) {
    args.push('--permission-mode', config.claude.permissionMode);
  }

  if (config.claude?.allowedTools && config.claude.allowedTools.length > 0) {
    args.push('--allowedTools', config.claude.allowedTools.join(','));
  }

  if (config.claude?.extraSafeArgs && config.claude.extraSafeArgs.length > 0) {
    const safeArgs = config.claude.extraSafeArgs.filter(
      (arg) => arg !== '--dangerously-skip-permissions',
    );
    args.push(...safeArgs);
  }

  return { command, args, stdin: prompt };
}
