import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execa } from 'execa';
import {
  stageAllChanges,
  hasStagedChanges,
  createCommit,
  getLatestCommitHash,
  formatCommitMessage,
} from './commit.js';

vi.mock('execa');

describe('git commit helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('stageAllChanges', () => {
    it('stages all changes using git add -A', async () => {
      await stageAllChanges('/test/cwd');
      expect(execa).toHaveBeenCalledWith('git', ['add', '-A'], { cwd: '/test/cwd' });
    });
  });

  describe('hasStagedChanges', () => {
    it('returns true if git diff --cached exits with 1', async () => {
      vi.mocked(execa).mockResolvedValueOnce({ exitCode: 1 } as any);
      const result = await hasStagedChanges('/test/cwd');
      expect(result).toBe(true);
      expect(execa).toHaveBeenCalledWith('git', ['diff', '--cached', '--quiet'], { cwd: '/test/cwd', reject: false });
    });

    it('returns false if git diff --cached exits with 0', async () => {
      vi.mocked(execa).mockResolvedValueOnce({ exitCode: 0 } as any);
      const result = await hasStagedChanges('/test/cwd');
      expect(result).toBe(false);
    });

    it('returns false if git diff --cached throws', async () => {
      vi.mocked(execa).mockRejectedValueOnce(new Error('git error'));
      const result = await hasStagedChanges('/test/cwd');
      expect(result).toBe(false);
    });
  });

  describe('getLatestCommitHash', () => {
    it('returns the trimmed commit hash', async () => {
      vi.mocked(execa).mockResolvedValueOnce({ stdout: ' abc123def \n' } as any);
      const result = await getLatestCommitHash('/test/cwd');
      expect(result).toBe('abc123def');
      expect(execa).toHaveBeenCalledWith('git', ['rev-parse', 'HEAD'], { cwd: '/test/cwd' });
    });
  });

  describe('createCommit', () => {
    it('creates a commit and returns the hash', async () => {
      vi.mocked(execa)
        .mockResolvedValueOnce({} as any) // git commit
        .mockResolvedValueOnce({ stdout: 'newhash123' } as any); // git rev-parse HEAD

      const result = await createCommit('test message', '/test/cwd');
      expect(execa).toHaveBeenNthCalledWith(1, 'git', ['commit', '-m', 'test message'], { cwd: '/test/cwd' });
      expect(execa).toHaveBeenNthCalledWith(2, 'git', ['rev-parse', 'HEAD'], { cwd: '/test/cwd' });
      expect(result).toBe('newhash123');
    });
  });

  describe('formatCommitMessage', () => {
    it('returns template if no vars are provided', () => {
      expect(formatCommitMessage('test msg')).toBe('test msg');
    });

    it('replaces variables in the template', () => {
      const template = 'chore({planName}): complete {taskId} - {taskText}';
      const msg = formatCommitMessage(template, {
        planName: 'setup',
        taskId: '123',
        taskText: 'do things',
      });
      expect(msg).toBe('chore(setup): complete 123 - do things');
    });
  });
});
