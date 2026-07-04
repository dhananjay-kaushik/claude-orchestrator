import { Config } from '../types/index.js';

export function buildClaudeCommand(config: Config, prompt: string): { command: string; args: string[] } {
  const command = config.claude?.binary || 'claude';
  const args = [
    '-p',
    prompt,
    '--output-format',
    'json'
  ];

  if (config.claude?.permissionMode) {
    args.push('--permission-mode', config.claude.permissionMode);
  }

  if (config.claude?.allowedTools && config.claude.allowedTools.length > 0) {
    args.push('--allowedTools', config.claude.allowedTools.join(','));
  }

  if (config.claude?.extraSafeArgs && config.claude.extraSafeArgs.length > 0) {
    const safeArgs = config.claude.extraSafeArgs.filter(
      (arg) => arg !== '--dangerously-skip-permissions'
    );
    args.push(...safeArgs);
  }

  return { command, args };
}
