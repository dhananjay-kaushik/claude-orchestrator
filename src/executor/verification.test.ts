import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runVerification, redactSecrets } from './verification.js';
import { execa } from 'execa';
import * as fs from 'fs/promises';
import { Config, VerificationCommand } from '../types/index.js';
import { resolve } from 'path';

vi.mock('execa');
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  appendFile: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

describe('verification', () => {
  const mockConfig: Config = {
    verificationCommands: [],
    security: {
      deniedCommands: ['rm'],
      protectedPaths: [],
      allowNetwork: false,
      allowedCommands: ['npm', 'jest']
    }
  } as unknown as Config;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runVerification', () => {
    it('returns null if no commands are configured', async () => {
      const result = await runVerification(mockConfig, '/worktree', '/logs');
      expect(result).toBeNull();
    });

    it('runs passing commands successfully', async () => {
      const config = {
        ...mockConfig,
        verificationCommands: [
          { command: 'npm', args: ['run', 'test'], timeoutMs: 1000 }
        ]
      } as Config;

      // Mock execa to resolve successfully with streams
      vi.mocked(execa).mockImplementation(() => {
        return {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          then: (resolve: (v: any) => void) => resolve({ exitCode: 0 }),
          catch: () => {}
        } as any;
      });

      const result = await runVerification(config, '/worktree', '/logs');
      
      expect(result?.success).toBe(true);
      expect(execa).toHaveBeenCalledWith('npm', ['run', 'test'], expect.objectContaining({
        cwd: '/worktree',
        shell: false
      }));
      expect(fs.appendFile).toHaveBeenCalledWith(resolve('/logs', 'verification_0_stdout.log'), expect.any(String));
    });

    it('returns failure on first failing command', async () => {
      const config = {
        ...mockConfig,
        verificationCommands: [
          { command: 'npm', args: ['run', 'test'], timeoutMs: 1000 }
        ]
      } as Config;

      vi.mocked(execa).mockImplementation(() => {
        return {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          then: (resolve: (v: any) => void, reject: (e: any) => void) => reject({ exitCode: 1, message: 'Command failed' }),
          catch: (reject: (e: any) => void) => reject({ exitCode: 1, message: 'Command failed' })
        } as any;
      });

      const result = await runVerification(config, '/worktree', '/logs');
      
      expect(result?.success).toBe(false);
      if (result && !result.success) {
        expect(result.exitCode).toBe(1);
        expect(result.errorOutput).toBe('Command failed');
      }
    });

    it('respects cwd only if it resolves inside task worktree', async () => {
      const config = {
        ...mockConfig,
        verificationCommands: [
          { command: 'npm', args: ['run', 'test'], timeoutMs: 1000, cwd: '../outside' }
        ]
      } as Config;

      const result = await runVerification(config, '/worktree/task', '/logs');
      
      expect(result?.success).toBe(false);
      if (result && !result.success) {
        expect(result.errorOutput).toContain('escapes task worktree');
      }
      expect(execa).not.toHaveBeenCalled();
    });

    it('blocks denied commands from running', async () => {
      const config = {
        ...mockConfig,
        verificationCommands: [
          { command: 'rm', args: ['-rf', '/'], timeoutMs: 1000 }
        ]
      } as Config;

      await expect(runVerification(config, '/worktree', '/logs'))
        .rejects
        .toThrow("Command 'rm' is in the denylist.");
      expect(execa).not.toHaveBeenCalled();
    });
    
    it('allows failure if configured', async () => {
      const config = {
        ...mockConfig,
        verificationCommands: [
          { command: 'npm', args: ['run', 'test'], timeoutMs: 1000, allowFailure: true }
        ]
      } as Config;

      vi.mocked(execa).mockImplementation(() => {
        return {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          then: (resolve: (v: any) => void, reject: (e: any) => void) => reject({ exitCode: 1, message: 'Command failed' }),
          catch: (reject: (e: any) => void) => reject({ exitCode: 1, message: 'Command failed' })
        } as any;
      });

      const result = await runVerification(config, '/worktree', '/logs');
      
      expect(result?.success).toBe(true);
    });
  });

  describe('redactSecrets', () => {
    it('redacts tokens and passwords', () => {
      expect(redactSecrets('password="super_secret_password"')).toBe('password="***"');
      expect(redactSecrets('token=abcxyz123')).toBe('token=***');
      expect(redactSecrets('api_key: "123456"')).toBe('api_key: "***"');
      expect(redactSecrets('Authorization: Bearer mytoken123')).toBe('Authorization: Bearer ***');
    });

    it('redacts multiple secrets in one string', () => {
      expect(redactSecrets('token=abc password="123"')).toBe('token=*** password="***"');
    });
  });
});
