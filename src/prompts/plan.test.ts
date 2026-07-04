import { describe, it, expect } from 'vitest';
import { buildPlanPrompt } from './plan.js';

describe('buildPlanPrompt', () => {
  it('should include the configured plan directory', () => {
    const prompt = buildPlanPrompt('docs/plans');
    expect(prompt).toContain('docs/plans');
  });

  it('should include the 5-state checkbox system', () => {
    const prompt = buildPlanPrompt('docs/plans');
    expect(prompt).toContain('NOT_DONE');
    expect(prompt).toContain('IN_PROGRESS');
    expect(prompt).toContain('DONE');
    expect(prompt).toContain('FAILED');
    expect(prompt).toContain('BLOCKED');
  });

  it('should explain the execution contract', () => {
    const prompt = buildPlanPrompt('docs/plans');
    expect(prompt).toContain('exactly ONE task and then stop');
  });

  it('should instruct Claude not to commit', () => {
    const prompt = buildPlanPrompt('docs/plans');
    expect(prompt).toContain('Do NOT commit');
  });

  it('should require machine-parseable plans', () => {
    const prompt = buildPlanPrompt('docs/plans');
    expect(prompt).toContain('machine-parseable');
  });
});
