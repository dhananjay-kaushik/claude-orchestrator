export function buildExecutionPrompt(
  planPath: string,
  taskText: string,
  taskId: string,
  worktreePath: string,
  retryContext?: { lastError?: string; lastVerificationError?: string },
  commitMessage?: string,
): string {
  let prompt = `You are Claude Code Orchestrator's headless execution agent.
You have ONE task. You must implement ONLY the following task:

Task ID: ${taskId}
Task: ${taskText}

Plan File: ${planPath}
Worktree: ${worktreePath}

The task line above may have additional context, sub-details, or acceptance
criteria in the Plan File (e.g. nested bullets under this task, or the section
heading it belongs to). Before implementing, open the Plan File and read the
context around this exact task line. Use it, but still implement ONLY this task.
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
2. Once your changes are complete and verified, stage and commit them yourself:
   \`git add -A && git commit -m "${commitMessage || 'chore: complete task from plan'}"\`
   If the commit fails (e.g. a pre-commit hook reports lint/format errors), read the hook output, fix the
   reported issues, re-stage, and retry the commit yourself before giving up. Only report \`SUCCESS\` once the
   commit has actually succeeded. Do not amend or rewrite prior commits, and do not push.
3. Do not mark the task as DONE in the plan file.
4. Include a concise handoff note in the JSON \`result\` field, before the sentinel line. It is shown to the user in the run summary, so cover: what you changed (files/areas touched), how you verified it, and anything the next task or a human reviewer should know (deviations from the plan, follow-ups, open questions).
5. You MUST end your JSON \`result\` field with exactly one of the following sentinels:
   - \`ORCHESTRATOR_RESULT: SUCCESS\` (if you completed the task and committed it)
   - \`ORCHESTRATOR_RESULT: BLOCKED\` (if you are blocked by user input, credentials, permissions, or missing context)
   - \`ORCHESTRATOR_RESULT: NEEDS_RETRY_CONTEXT\` (if you need the orchestrator to retry you with different context)
6. If you use \`BLOCKED\`, you MUST include a \`BLOCKED_REASON: <reason>\` line in your result immediately after the sentinel.
7. Do not edit secret or credential files.
8. Do not run destructive Git operations.

Your response MUST be in JSON format matching the orchestrator's expectations.`;
  return prompt;
}
