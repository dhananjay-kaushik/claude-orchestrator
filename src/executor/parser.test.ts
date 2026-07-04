import { describe, it, expect } from 'vitest';
import { parseClaudeJSON, extractOrchestratorResult } from './parser.js';

describe('parseClaudeJSON', () => {
  it('should parse valid JSON with result field', () => {
    const json = JSON.stringify({
      result: 'test result',
      total_cost_usd: 0.05,
      usage: { tokens: 100 },
      session_id: 'sess-123',
      is_error: false,
    });
    const parsed = parseClaudeJSON(json);
    expect(parsed.result).toBe('test result');
    expect(parsed.total_cost_usd).toBe(0.05);
    expect(parsed.session_id).toBe('sess-123');
    expect(parsed.is_error).toBe(false);
  });

  it('should throw if JSON is malformed', () => {
    expect(() => parseClaudeJSON('{ bad json')).toThrow(/Failed to parse/);
  });

  it('should throw if result field is missing', () => {
    const json = JSON.stringify({ some_other_field: 'hello' });
    expect(() => parseClaudeJSON(json)).toThrow(/must contain a string "result" field/);
  });
});

describe('extractOrchestratorResult', () => {
  it('should extract SUCCESS sentinel and handoffNotes', () => {
    const result = extractOrchestratorResult(
      'some handoff notes\nORCHESTRATOR_RESULT: SUCCESS\nmore output',
    );
    expect(result).toEqual({ type: 'SUCCESS', handoffNotes: 'some handoff notes' });
  });

  it('should extract BLOCKED sentinel with reason', () => {
    const result = extractOrchestratorResult(
      'output\nORCHESTRATOR_RESULT: BLOCKED\nBLOCKED_REASON: missing API key\nend',
    );
    expect(result).toEqual({ type: 'BLOCKED', reason: 'missing API key', handoffNotes: 'output' });
  });

  it('should extract BLOCKED sentinel without reason as unknown', () => {
    const result = extractOrchestratorResult('output\nORCHESTRATOR_RESULT: BLOCKED\nend');
    expect(result).toEqual({ type: 'BLOCKED', reason: 'Unknown block reason', handoffNotes: 'output' });
  });

  it('should extract NEEDS_RETRY_CONTEXT sentinel', () => {
    const result = extractOrchestratorResult('ORCHESTRATOR_RESULT: NEEDS_RETRY_CONTEXT');
    expect(result).toEqual({ type: 'NEEDS_RETRY_CONTEXT' });
  });

  it('should return null if no sentinel is found', () => {
    const result = extractOrchestratorResult('just some regular output');
    expect(result).toBeNull();
  });
});
