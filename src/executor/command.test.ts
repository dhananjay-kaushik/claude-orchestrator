import { describe, it, expect } from 'vitest';
import { buildClaudeCommand } from './command.js';
import { Config } from '../types/index.js';

describe('buildClaudeCommand', () => {
  const baseConfig = {
    version: '1',
    planDir: 'plans',
    baseBranch: 'main',
    branchPrefix: 'orchestrator/',
    models: { planning: 'claude-3-5-sonnet' },
    claude: {
      binary: 'claude'
    },
    taskTimeoutMs: 1000,
    verificationCommands: [],
    maxRetries: 3,
    logsDir: 'logs',
    stateDir: 'states',
    worktreeDir: 'worktrees',
    commitMessageTemplate: 'test',
    sessionLimits: { showBeforeRun: true, pauseOnLimit: true },
    security: { deniedCommands: [], protectedPaths: [], allowNetwork: false }
  } as Config;

  it('assembles the basic headless command', () => {
    const prompt = 'Test task prompt';
    const { command, args } = buildClaudeCommand(baseConfig, prompt);

    expect(command).toBe('claude');
    expect(args).toEqual([
      '-p',
      'Test task prompt',
      '--output-format',
      'json'
    ]);
  });

  it('applies permission mode when configured', () => {
    const config = {
      ...baseConfig,
      claude: { ...baseConfig.claude, permissionMode: 'strict' }
    };
    const { args } = buildClaudeCommand(config, 'prompt');
    expect(args).toContain('--permission-mode');
    expect(args).toContain('strict');
  });

  it('applies allowed tools when configured', () => {
    const config = {
      ...baseConfig,
      claude: { ...baseConfig.claude, allowedTools: ['Bash', 'View'] }
    };
    const { args } = buildClaudeCommand(config, 'prompt');
    expect(args).toContain('--allowedTools');
    expect(args).toContain('Bash,View');
  });

  it('includes extraSafeArgs but filters dangerously-skip-permissions', () => {
    const config = {
      ...baseConfig,
      claude: {
        ...baseConfig.claude,
        extraSafeArgs: ['--verbose', '--dangerously-skip-permissions', '--debug']
      }
    };
    const { args } = buildClaudeCommand(config, 'prompt');
    expect(args).toContain('--verbose');
    expect(args).toContain('--debug');
    expect(args).not.toContain('--dangerously-skip-permissions');
  });

  it('custom binary name from config is respected', () => {
    const config = {
      ...baseConfig,
      claude: { ...baseConfig.claude, binary: '/usr/local/bin/claude' }
    };
    const { command } = buildClaudeCommand(config, 'prompt');
    expect(command).toBe('/usr/local/bin/claude');
  });
});
