import { describe, it, expect } from 'vitest';
import { parsePlan, ValidationError, determineNextTask, updateTaskStatus } from './parser.js';

describe('Plan Parser', () => {
  it('should parse valid tasks', () => {
    const plan = `
# Plan
- [ ] Task 1
* [-] Task 2
- [x] Task 3
- [X] Task 4
* [f] Task 5
- [F] Task 6
- [b] Task 7
* [B] Task 8
`;
    const result = parsePlan(plan, 'plan1');
    expect(result.tasks).toHaveLength(8);
    expect(result.tasks[0].status).toBe('NOT_DONE');
    expect(result.tasks[1].status).toBe('IN_PROGRESS');
    expect(result.tasks[2].status).toBe('DONE');
    expect(result.tasks[3].status).toBe('DONE');
    expect(result.tasks[4].status).toBe('FAILED');
    expect(result.tasks[5].status).toBe('FAILED');
    expect(result.tasks[6].status).toBe('BLOCKED');
    expect(result.tasks[7].status).toBe('BLOCKED');
  });

  it('should throw if no recognized task checkboxes exist', () => {
    const plan = `# Just a heading\nNo tasks here.`;
    expect(() => parsePlan(plan, 'plan1')).toThrowError(ValidationError);
    expect(() => parsePlan(plan, 'plan1')).toThrowError(
      'No recognized task checkboxes found in plan.',
    );
  });

  it('should reject ambiguous checkbox markers', () => {
    const plan = `
# Plan
- [?] Ambiguous task
`;
    expect(() => parsePlan(plan, 'plan1')).toThrowError(ValidationError);
    expect(() => parsePlan(plan, 'plan1')).toThrowError(
      'Malformed task on line 3: Ambiguous checkbox marker "- [?]"',
    );
  });

  it('should reject duplicate task identities', () => {
    const plan = `
# Plan
- [ ] Same task
- [x] Same task
`;
    expect(() => parsePlan(plan, 'plan1')).toThrowError(ValidationError);
    expect(() => parsePlan(plan, 'plan1')).toThrowError('Duplicate task identity found: Same task');
  });

  it('should ignore regular links or non-checkbox lists', () => {
    const plan = `
# Plan
- [ ] Valid task
- [Link](https://example.com)
* Just a bullet
`;
    const result = parsePlan(plan, 'plan1');
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].status).toBe('NOT_DONE');
  });

  describe('determineNextTask', () => {
    it('should prefer IN_PROGRESS tasks', () => {
      const plan = `
# Plan
- [ ] Task 1
- [-] Task 2
`;
      const result = parsePlan(plan, 'plan1');
      const next = determineNextTask(result.tasks, 3, {});
      expect(next?.originalText).toContain('Task 2');
    });

    it('should pick first NOT_DONE if no IN_PROGRESS', () => {
      const plan = `
# Plan
- [x] Task 1
- [ ] Task 2
- [ ] Task 3
`;
      const result = parsePlan(plan, 'plan1');
      const next = determineNextTask(result.tasks, 3, {});
      expect(next?.originalText).toContain('Task 2');
    });

    it('should consider FAILED if retries remain', () => {
      const plan = `
# Plan
- [x] Task 1
- [f] Task 2
`;
      const result = parsePlan(plan, 'plan1');
      const next = determineNextTask(result.tasks, 3, { [result.tasks[1].id]: 1 });
      expect(next?.originalText).toContain('Task 2');
    });

    it('should halt if FAILED out of retries', () => {
      const plan = `
# Plan
- [f] Task 1
- [ ] Task 2
`;
      const result = parsePlan(plan, 'plan1');
      const next = determineNextTask(result.tasks, 3, { [result.tasks[0].id]: 3 });
      expect(next).toBeUndefined();
    });

    it('should halt if BLOCKED', () => {
      const plan = `
# Plan
- [b] Task 1
- [ ] Task 2
`;
      const result = parsePlan(plan, 'plan1');
      const next = determineNextTask(result.tasks, 3, {});
      expect(next).toBeUndefined();
    });
  });

  describe('updateTaskStatus', () => {
    it('should replace only the selected task', () => {
      const plan = `
# Plan
  - [ ] Task 1
- [ ] Task 2
`;
      const result = parsePlan(plan, 'plan1');
      const updated = updateTaskStatus(plan, result.tasks[0], 'IN_PROGRESS');
      expect(updated).toContain('  - [-] Task 1');
      expect(updated).toContain('- [ ] Task 2');
    });

    it('should keep the Status Tracker counts in sync as checkboxes change', () => {
      const plan = `
# Plan

## Status Tracker
- **Total**: 2
- **NOT_DONE**: 2
- **IN_PROGRESS**: 0
- **DONE**: 0
- **FAILED**: 0
- **BLOCKED**: 0

- [ ] Task 1
- [ ] Task 2
`;
      const result = parsePlan(plan, 'plan1');
      const inProgress = updateTaskStatus(plan, result.tasks[0], 'IN_PROGRESS');
      expect(inProgress).toContain('**Total**: 2');
      expect(inProgress).toContain('**NOT_DONE**: 1');
      expect(inProgress).toContain('**IN_PROGRESS**: 1');

      const reparsed = parsePlan(inProgress, 'plan1');
      const done = updateTaskStatus(inProgress, reparsed.tasks[0], 'DONE');
      expect(done).toContain('**NOT_DONE**: 1');
      expect(done).toContain('**IN_PROGRESS**: 0');
      expect(done).toContain('**DONE**: 1');
    });
  });
});
