import { describe, it, expect } from 'vitest';
import { parsePlan, ValidationError } from './parser.js';

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
    expect(() => parsePlan(plan, 'plan1')).toThrowError('No recognized task checkboxes found in plan.');
  });

  it('should reject ambiguous checkbox markers', () => {
    const plan = `
# Plan
- [?] Ambiguous task
`;
    expect(() => parsePlan(plan, 'plan1')).toThrowError(ValidationError);
    expect(() => parsePlan(plan, 'plan1')).toThrowError('Malformed task on line 3: Ambiguous checkbox marker "- [?]"');
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
});
