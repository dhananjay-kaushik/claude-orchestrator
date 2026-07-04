import { describe, it, expect } from 'vitest';
import { buildExecutionPrompt } from './execution.js';

describe('buildExecutionPrompt', () => {
  it('should include required task context and sentinels', () => {
    const prompt = buildExecutionPrompt('PLAN.md', '- [ ] Do something', 'task-123', '/tmp/worktree');
    
    expect(prompt).toContain('Task ID: task-123');
    expect(prompt).toContain('Do something');
    expect(prompt).toContain('PLAN.md');
    expect(prompt).toContain('/tmp/worktree');
    expect(prompt).toContain('ORCHESTRATOR_RESULT: SUCCESS');
    expect(prompt).toContain('ORCHESTRATOR_RESULT: BLOCKED');
    expect(prompt).toContain('BLOCKED_REASON:');
  });
});
