# Project Skills & Prompts (SKILLS.md)

This file catalogs the technical skills required for this project and the prompt contracts that the orchestrator injects into Claude Code sessions.

## Technical Skills Stack

Agents working on this repository should use:

- **Language**: TypeScript on Node.js.
- **CLI Framework**: `commander`.
- **Interactive Prompts**: `@clack/prompts`.
- **Process Management**: `execa`.
- **Testing**: `vitest`, with a test-driven development workflow.
- **Runtime Validation**: Prefer `zod` or an equivalent schema validator for config, state, Claude JSON responses, and plan validation.
- **Terminal Styling**: `picocolors`.
- **Notifications**: post-MVP only.

## Development Discipline

This project must be implemented with TDD.

- Write failing tests before implementing core behavior.
- Cover parser, config, state machine, executor, verification, logging, Git, worktree, Claude JSON parsing, timeout, and command-policy helpers.
- Use integration tests for temporary Git repositories and CLI command flows after pure units are stable.
- Do not mark a PLAN task complete unless the relevant tests exist and pass.
- Keep TypeScript strict and avoid `any` unless unavoidable.

## Execution Contract

Planning and execution are different modes.

- `claude-orchestrator plan` may use an interactive Claude Code session.
- `claude-orchestrator run` must use headless Claude JSON mode: `claude -p "<prompt>" --output-format json`.
- Execution must parse structured JSON fields such as `result`, `total_cost_usd`, `usage`, `session_id`, and `is_error`.
- Token/cost data should come from JSON fields, not regex over terminal text.
- Raw Claude JSON must be saved to task logs.

## Security & Permission Guardrails

Autonomous, commit-capable agents need narrow permissions by default.

- The orchestrator owns task status, verification, retry policy, logs, worktrees, and commits.
- Claude task sessions implement only the selected task.
- Claude task sessions must not commit, amend, push, force-push, reset, clean, rebase, delete branches, or rewrite history.
- The orchestrator itself must never run destructive Git operations.
- Do not touch secret-like files such as `.env*`, credentials, private keys, tokens, or ignored local configuration unless the user explicitly opts in.
- Do not print secret-looking values to terminal output or logs.
- Validate plan files before execution.
- Validate `.claude-orchestrator.json` before execution.
- Verification commands must be structured command objects, never shell strings.
- Commands must run with `shell: false`.
- Validate verification commands against the configured allowlist and built-in denylist before running them.
- Keep retry behavior bounded by `maxRetries` and a hard-coded upper safety limit.
- Enforce per-task wall-clock timeout.
- Use isolated per-task worktrees or an equivalent sandbox.
- Prompt text is advisory; safety claims must be backed by config validation, command policy, worktree isolation, permission args, and post-run checks.

## Core Injected Prompts

These prompts should be stored as constants in `src/prompts/index.ts`. Tests should snapshot or otherwise validate safety-critical clauses so future edits do not weaken the contract.

### 1. Plan Generation Prompt

**Intent:** Used by `claude-orchestrator plan`.

**Prompt Draft:**

```text
You are operating in PLAN MODE.
Work with the user to understand their requirements.
Generate a detailed, machine-parseable Markdown plan file.
The plan file MUST be created inside the configured plan directory, which defaults to `workflow_generated_plans`.

The tracker must use this strict 5-state Markdown checkbox system:
- [ ] : NOT_DONE
- [-] : IN_PROGRESS
- [x] : DONE
- [f] : FAILED
- [b] : BLOCKED

Use clear task titles and stable task wording.
Avoid ambiguous checkbox markers.

Include an execution contract in the plan:
- The orchestrator selects exactly one task at a time.
- Future execution uses headless Claude JSON mode.
- A future Claude execution session implements only the selected task.
- The orchestrator, not Claude, owns status transitions to DONE.
- The orchestrator runs verification gates before marking a task DONE.
- The orchestrator creates commits only after verification passes.
- The orchestrator stores handoff notes and Claude session metadata in state/log files.
- Claude must not commit changes, force-push, reset, clean, rebase, delete branches, rewrite Git history, or touch secret files.
- If a task needs human input, credentials, permissions, or missing external context, it must be treated as BLOCKED.
- If work pauses because a Claude session limit is reached, the task remains resumable and the user is told when to continue if reset timing is known.
- When all tasks are DONE, the orchestrator closes the run and shows a concise completion overview.
```

### 2. Task Execution Prompt

**Intent:** Used by `claude-orchestrator run` inside `claude -p "<prompt>" --output-format json`.

**Prompt Draft:**

```text
You are operating in EXECUTION MODE.
You are being given exactly one selected task from the plan.

Plan file: PLAN_FILE_PATH
Task ID: TASK_ID
Selected task: SELECTED_TASK_TEXT
Worktree: TASK_WORKTREE_PATH

Implement only the selected task.
Do not continue to later tasks.
Do not mark the selected task DONE.
Do not commit changes.
Do not amend commits.
Do not push or force-push.
Do not run destructive Git commands such as reset, clean, rebase, branch deletion, or history rewrite.
Do not edit secret-like files such as .env files, credentials, private keys, tokens, or ignored local configuration unless the user explicitly requested it.

Follow the repository's TDD expectations:
- Add or update tests for the selected behavior first where practical.
- Implement the smallest useful change.
- Run relevant local checks when available.
- Leave code ready for the orchestrator's verification gates.

Your response will be returned inside Claude Code's JSON `result` field.
End the result with exactly one sentinel:
- ORCHESTRATOR_RESULT: SUCCESS
- ORCHESTRATOR_RESULT: BLOCKED
- ORCHESTRATOR_RESULT: NEEDS_RETRY_CONTEXT

If implementation is complete, include a concise handoff note before the SUCCESS sentinel.

If you cannot proceed because you need user input, credentials, permissions, or missing external context, include:
BLOCKED_REASON: <short reason>
Then end with:
ORCHESTRATOR_RESULT: BLOCKED

If prior failure context is insufficient to make progress, end with:
ORCHESTRATOR_RESULT: NEEDS_RETRY_CONTEXT

Exit after this task. The orchestrator will parse the JSON, inspect the sentinel, run verification gates, update task status, handle retries, and commit only if verification passes.
```

### 3. Verification & Commit Ownership

The orchestrator must enforce lifecycle rules regardless of Claude output.

- Claude output is not proof of completion.
- Passing verification gates are required before `DONE`.
- A commit is created only after verification passes.
- Failed verification increments retry state and may requeue the task until the bounded retry cap is reached.
- Retry prompts must include concise, redacted prior failure context.
- Blocked execution halts the run and waits for the user.
- Claude session-limit exhaustion is classified separately from task failure and does not consume normal retry budget.
- When a session limit is detected, the orchestrator saves reset time if known, shows the resume command, and continues cleanly after the user reruns or a post-MVP automation exists.
- If no executable tasks remain because all tasks are `DONE`, the orchestrator exits cleanly and shows a completion overview.
- Terminal output should stay concise; in-depth logs should be saved to files and referenced by path.
