export function buildExecutionPrompt(
  planPath: string,
  taskText: string,
  taskId: string,
  worktreePath: string,
  retryContext?: { lastError?: string; lastVerificationError?: string },
): string {
  let prompt = `You are Claude Code Orchestrator's headless execution agent.
You have ONE task. You must implement ONLY the following task:

Task ID: ${taskId}
Task: ${taskText}

Plan File: ${planPath}
Worktree: ${worktreePath}
`;

  if (retryContext && (retryContext.lastError || retryContext.lastVerificationError)) {
    prompt += `
=== PREVIOUS ATTEMPT FAILED. RETRY CONTEXT ===
`;
    if (retryContext.lastError) {
      prompt += `Claude Execution Error Summary:\n${retryContext.lastError}\n\n`;
    }
    if (retryContext.lastVerificationError) {
      prompt += `Verification Error Output Excerpt:\n${retryContext.lastVerificationError}\n\n`;
    }
    prompt += `Please analyze why the previous attempt failed and fix the issue.
==============================================
`;
  }

  prompt += `
RULES:
1. Do not continue to later tasks.
2. Do not commit any changes.
3. Do not mark the task as DONE in the plan file.
4. Include a concise handoff note in the JSON \`result\` field.
5. You MUST end your JSON \`result\` field with exactly one of the following sentinels:
   - \`ORCHESTRATOR_RESULT: SUCCESS\` (if you completed the task)
   - \`ORCHESTRATOR_RESULT: BLOCKED\` (if you are blocked by user input, credentials, permissions, or missing context)
   - \`ORCHESTRATOR_RESULT: NEEDS_RETRY_CONTEXT\` (if you need the orchestrator to retry you with different context)
6. If you use \`BLOCKED\`, you MUST include a \`BLOCKED_REASON: <reason>\` line in your result immediately after the sentinel.
7. Do not edit secret or credential files.
8. Do not run destructive Git operations.

Your response MUST be in JSON format matching the orchestrator's expectations.`;
  return prompt;
}
