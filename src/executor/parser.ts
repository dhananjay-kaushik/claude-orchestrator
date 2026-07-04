import { ClaudeJSONResponse, OrchestratorResult } from '../types/index.js';

export function parseClaudeJSON(output: string): ClaudeJSONResponse {
  try {
    const parsed = JSON.parse(output);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Claude JSON output must be an object');
    }

    // We expect some basic fields, mainly `result`.
    if (typeof parsed.result !== 'string') {
      throw new Error('Claude JSON output must contain a string "result" field');
    }

    return parsed as ClaudeJSONResponse;
  } catch (error: any) {
    throw new Error(`Failed to parse Claude JSON response: ${error.message}`);
  }
}

export function extractOrchestratorResult(resultString: string): OrchestratorResult | null {
  const match = resultString.match(/ORCHESTRATOR_RESULT:\s*(SUCCESS|BLOCKED|NEEDS_RETRY_CONTEXT)/);
  if (!match) {
    return null;
  }

  const type = match[1] as 'SUCCESS' | 'BLOCKED' | 'NEEDS_RETRY_CONTEXT';
  const handoffNotes = resultString.substring(0, match.index).trim() || undefined;

  if (type === 'BLOCKED') {
    const reasonMatch = resultString.match(/BLOCKED_REASON:\s*(.+)$/m);
    return {
      type: 'BLOCKED',
      reason: reasonMatch ? reasonMatch[1].trim() : 'Unknown block reason',
      handoffNotes,
    };
  }

  return { type, handoffNotes };
}
