import { describe, it, expect } from 'vitest';
import { configSchema, verificationCommandSchema } from './schema.js';

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

  it('enforces task timeout hard maximum', () => {
    const config = {
      version: '1.0.0',
      planDir: 'plans',
      baseBranch: 'main',
      branchPrefix: 'orchestrator-',
      models: { planning: 'claude' },
      claude: { binary: 'claude' },
      taskTimeoutMs: 10000000, // Exceeds 2 hours
      verificationCommands: [],
      maxRetries: 3,
      logsDir: 'logs',
      stateDir: 'state',
      worktreeDir: 'worktrees',
      commitMessageTemplate: 'test',
      sessionLimits: { showBeforeRun: true, pauseOnLimit: true },
      security: { deniedCommands: [], protectedPaths: [], allowNetwork: false },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Task timeout cannot exceed 2 hours');
    }
  });

  it('rejects invalid reset/resume settings (extra properties not in schema)', () => {
    const config = {
      version: '1.0.0',
      planDir: 'plans',
      baseBranch: 'main',
      branchPrefix: 'orchestrator-',
      models: { planning: 'claude' },
      claude: { binary: 'claude' },
      taskTimeoutMs: 600000,
      verificationCommands: [],
      maxRetries: 3,
      logsDir: 'logs',
      stateDir: 'state',
      worktreeDir: 'worktrees',
      commitMessageTemplate: 'test',
      sessionLimits: {
        showBeforeRun: true,
        pauseOnLimit: true,
        resumeAfterReset: true // Invalid setting in MVP
      },
      security: { deniedCommands: [], protectedPaths: [], allowNetwork: false },
    };
    
    const result = configSchema.safeParse(config);
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

  it('rejects raw shell-string verification commands', () => {
    // schema expects an object, so parsing a string should fail
    const result = verificationCommandSchema.safeParse('npm run test');
    expect(result.success).toBe(false);
  });

  it('enforces verification command timeout hard maximum', () => {
    const result = verificationCommandSchema.safeParse({
      command: 'npm',
      args: ['test'],
      timeoutMs: 5000000, // Exceeds 1 hour
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Verification command timeout cannot exceed 1 hour');
    }
  });
});
