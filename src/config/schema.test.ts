import { describe, it, expect } from 'vitest';
import { configSchema, verificationCommandSchema } from './schema';

describe('configSchema', () => {
  it('validates a complete valid config', () => {
    const validConfig = {
      version: '1.0.0',
      planDir: 'plans',
      baseBranch: 'main',
      branchPrefix: 'orchestrator-',
      models: {
        planning: 'claude-3-5-sonnet-20241022',
        execution: 'claude-3-5-haiku-20241022',
      },
      claude: {
        binary: 'claude',
        permissionMode: 'auto',
        allowedTools: ['Bash', 'View', 'Edit'],
        extraSafeArgs: ['--verbose'],
      },
      taskTimeoutMs: 600000,
      verificationCommands: [
        {
          command: 'npm',
          args: ['run', 'test'],
          timeoutMs: 30000,
        },
      ],
      maxRetries: 3,
      logsDir: 'logs',
      stateDir: 'state',
      worktreeDir: 'worktrees',
      commitMessageTemplate: 'chore: complete task',
      sessionLimits: {
        showBeforeRun: true,
        pauseOnLimit: true,
      },
      security: {
        allowedCommands: ['npm', 'git'],
        deniedCommands: ['rm', 'drop'],
        protectedPaths: ['.env', 'secrets.json'],
        allowNetwork: false,
      },
    };

    const result = configSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const invalidConfig = {
      version: '1.0.0',
      // Missing all other fields
    };

    const result = configSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });
});

describe('verificationCommandSchema', () => {
  it('validates a valid command', () => {
    const result = verificationCommandSchema.safeParse({
      command: 'npm',
      args: ['test'],
      timeoutMs: 5000,
      cwd: './',
      env: { NODE_ENV: 'test' },
      allowFailure: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a command without args', () => {
    const result = verificationCommandSchema.safeParse({
      command: 'npm',
      timeoutMs: 5000,
    });
    expect(result.success).toBe(false);
  });
});
