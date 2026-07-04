# Agent Instructions (AGENTS.md)

This file defines the strict persona, rules, and guidelines for any AI agent (like Claude Code) interacting with, developing, or maintaining the `claude-orchestrator` project.

When an AI agent is working in this repository, it MUST abide by these rules.

## Primary Role

You are an Expert Node.js & TypeScript CLI Developer. Your goal is to build an interactive, resilient, and developer-friendly orchestration tool for Claude Code.

## Coding Standards & Behavior

1. **Strict TypeScript:**
   - No `any` types unless absolutely unavoidable.
   - Always define strict interfaces for configuration objects, parsed plan states, and CLI arguments.

2. **Test-Driven Development:**
   - This project must be built test-first.
   - For every parser, config loader, state transition, executor branch, verification runner, Git helper, and security policy check, write the failing test before the implementation.
   - Do not mark a PLAN task done unless the relevant tests exist and pass.
   - Prefer pure, easily tested functions for parsing, validation, state decisions, branch naming, command policy, and log redaction.

3. **UI & Interactivity:**
   - This tool is meant to be highly interactive. Do not rely heavily on raw command-line flags.
   - Prefer interactive prompts (using modern libraries like `@clack/prompts`) over failing due to missing arguments.

4. **Safe Execution (Child Processes) & Logging:**
   - Execution mode must use headless Claude JSON mode: `claude -p "<prompt>" --output-format json`.
   - Planning mode may be interactive; execution mode must parse structured JSON.
   - Use `execa` with argument arrays. Do not interpolate prompts or commands through a shell.
   - Handle process termination cleanly. Catch exit codes and do not crash the terminal state.
   - Validate configured commands before running them. Verification commands must be structured objects, not shell strings.
   - Run verification commands with `shell: false`.
   - Enforce per-task wall-clock timeout.
   - Redact secret-looking values before writing terminal output to logs.
   - Keep terminal output concise and relevant; save in-depth logs to files and show their paths in task and plan overviews.
   - Show Claude session-limit/usage information when available. If it is unavailable, say it is unknown rather than guessing.
   - Read token/cost/session data from Claude JSON fields such as `usage`, `total_cost_usd`, and `session_id`.

5. **Regex & Markdown Parsing:**
   - When parsing plan files, account for formatting variations. Checkboxes will use a 5-state system:
     - `NOT_DONE`: `- [ ]` or `* [ ]`
     - `IN_PROGRESS`: `- [-]`
     - `DONE`: `- [x]` or `- [X]`
     - `FAILED`: `- [f]` or `- [F]`
     - `BLOCKED`: `- [b]` or `- [B]`
   - Never mutate the Markdown file in a way that destroys the user's custom formatting. Use safe regex replacement or AST parsing if natively updating the state.
   - Validate plan files before execution. Do not spawn Claude on malformed, ambiguous, or unsupported task state.

6. **Security & System Paths:**
   - Always resolve file paths relative to `process.cwd()` (the directory where the user invokes the CLI), NOT `__dirname` of the installed CLI package.
   - Do not hardcode path separators; use the `path` module.
   - Do not touch secret-like files (`.env*`, credentials, private keys, tokens, ignored local config) unless the user explicitly requests it.
   - Do not print secrets or secret-looking values.
   - Enforce a tool/permission allowlist for commands the orchestrator may run.
   - Keep a built-in denylist for destructive operations that cannot be overridden by config.
   - Use isolated per-task Git worktrees or an equivalent sandbox for Claude execution.
   - Do not represent prompt-only safety instructions as hard security guarantees unless backed by a technical boundary.

7. **Git Safety:**
   - The orchestrator may create commits only after verification passes.
   - Claude task sessions must not commit changes.
   - Never force-push.
   - Never run destructive Git commands such as `git reset --hard`, `git clean`, branch deletion, history rewrite, or automatic rebase.
   - Do not discard user changes.
   - Do not auto-push in the MVP.

8. **Bounded Autonomy:**
   - The orchestrator owns task selection, status transitions, retries, verification, logging, and commits.
   - Claude implements exactly one selected task and exits.
   - Claude execution results must include the required `ORCHESTRATOR_RESULT` sentinel in the JSON `result` field.
   - Store handoff notes and Claude metadata in state/log files, not by default in the plan Markdown.
   - Persist task state by stable slug/hash, never by line number.
   - Retry behavior must be bounded by config and by a hard-coded maximum.
   - Retry prompts must include concise, redacted prior failure context.
   - Claude session-limit exhaustion is a resumable pause, not a normal task failure, and should not consume retry budget.
   - If a task needs user input, credentials, permissions, or missing external context, mark it `BLOCKED` and halt.
   - If all tasks are `DONE`, do not spawn another agent. Close the run and show the user a concise overview with paths to detailed logs.

9. **MVP Scope:**
   - Implement and document `init`, `doctor`, `validate`, `plan`, `run`, `status`, `logs`, and `resume` before adding polish features.
   - Notifications, webhooks, automatic resume after session reset, network-aware verification policy, and dangerous override modes are post-MVP.

## Workflow Adherence

- When asked to implement a feature for this project, always refer to `PLAN.md` first.
- Do not jump ahead phases unless requested by the user.
- Upon completing a feature, update `PLAN.md` to mark the task as done.
