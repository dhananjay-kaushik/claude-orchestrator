import { describe, expect, it } from 'vitest';
import { truncateForTerminal } from './format.js';

describe('truncateForTerminal', () => {
  it('returns short text unchanged', () => {
    expect(truncateForTerminal('a\nb\nc')).toBe('a\nb\nc');
  });

  it('truncates long text and notes how many lines were hidden', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i}`);
    const result = truncateForTerminal(lines.join('\n'), 10);
    expect(result.split('\n')).toHaveLength(11);
    expect(result).toContain('10 more lines truncated');
  });
});
