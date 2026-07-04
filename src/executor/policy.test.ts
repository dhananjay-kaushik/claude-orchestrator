import { describe, it, expect } from 'vitest';
import { validateVerificationCommand, validateClaudePermissions, PolicyViolationError } from './policy.js';
import { Config, VerificationCommand } from '../types/index.js';

describe('policy validation', () => {
  const baseConfig = {
    version: '1',
    planDir: 'plans',
    baseBranch: 'main',
    branchPrefix: 'orchestrator/',
    models: { planning: 'claude-3-5-sonnet' },
    claude: {
      binary: 'claude',
    },
    taskTimeoutMs: 1000,
    verificationCommands: [],
    maxRetries: 3,
    logsDir: 'logs',
    stateDir: 'states',
    worktreeDir: 'worktrees',
    commitMessageTemplate: 'test',
    sessionLimits: { showBeforeRun: true, pauseOnLimit: true },
    security: { deniedCommands: [], protectedPaths: [], allowNetwork: false },
  } as Config;

  describe('validateVerificationCommand', () => {
    it('passes a safe command', () => {
      const cmd: VerificationCommand = { command: 'npm', args: ['test'], timeoutMs: 1000 };
      expect(() => validateVerificationCommand(baseConfig, cmd)).not.toThrow();
    });

    it('blocks built-in denied commands', () => {
      const cmd: VerificationCommand = { command: 'rm', args: ['-rf', '/'], timeoutMs: 1000 };
      expect(() => validateVerificationCommand(baseConfig, cmd)).toThrowError(PolicyViolationError);
    });

    it('blocks custom denied commands', () => {
      const config = { ...baseConfig, security: { ...baseConfig.security, deniedCommands: ['dangerous-tool'] } };
      const cmd: VerificationCommand = { command: 'dangerous-tool', args: [], timeoutMs: 1000 };
      expect(() => validateVerificationCommand(config, cmd)).toThrowError(PolicyViolationError);
    });

    it('blocks destructive git commands', () => {
      const cmd: VerificationCommand = { command: 'git', args: ['reset', '--hard'], timeoutMs: 1000 };
      expect(() => validateVerificationCommand(baseConfig, cmd)).toThrowError(PolicyViolationError);
    });

    it('blocks shell fragments in command', () => {
      const cmd: VerificationCommand = { command: 'npm;', args: ['test'], timeoutMs: 1000 };
      expect(() => validateVerificationCommand(baseConfig, cmd)).toThrowError(PolicyViolationError);
    });

    it('blocks shell fragments in args', () => {
      const cmd: VerificationCommand = { command: 'npm', args: ['run', 'test', '&&', 'echo', 'hacked'], timeoutMs: 1000 };
      expect(() => validateVerificationCommand(baseConfig, cmd)).toThrowError(PolicyViolationError);
    });

    it('blocks commands not in allowedCommands if allowedCommands is set', () => {
      const config = { ...baseConfig, security: { ...baseConfig.security, allowedCommands: ['npm'] } };
      const cmd1: VerificationCommand = { command: 'npm', args: ['test'], timeoutMs: 1000 };
      const cmd2: VerificationCommand = { command: 'yarn', args: ['test'], timeoutMs: 1000 };
      
      expect(() => validateVerificationCommand(config, cmd1)).not.toThrow();
      expect(() => validateVerificationCommand(config, cmd2)).toThrowError(PolicyViolationError);
    });
  });

  describe('validateClaudePermissions', () => {
    it('passes normal config', () => {
      expect(() => validateClaudePermissions(baseConfig)).not.toThrow();
    });

    it('blocks dangerously-skip-permissions', () => {
      const config = {
        ...baseConfig,
        claude: {
          ...baseConfig.claude,
          extraSafeArgs: ['--verbose', '--dangerously-skip-permissions']
        }
      };
      expect(() => validateClaudePermissions(config)).toThrowError(PolicyViolationError);
    });
  });
});
