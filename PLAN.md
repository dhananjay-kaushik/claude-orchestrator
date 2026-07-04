# Implementation Plan: Claude Code Orchestrator

This plan defines the phase-by-phase implementation of an interactive Node.js and TypeScript CLI that orchestrates Claude Code across small, verifiable tasks.

The main architectural rule is: **Claude implements one task; the orchestrator owns lifecycle state.** Claude Code sessions may edit project files and provide a handoff summary, but the orchestrator is responsible for selecting tasks, changing task status, enforcing retry limits, running verification gates, writing logs, and committing successful work.

This project must be built with a test-driven development approach. For every parser, config loader, state transition, Git helper, verification runner, and executor branch, write the failing test first, implement the smallest useful behavior, then refactor with the test suite green. A phase is not complete until its relevant unit or integration tests exist and pass.

## Task Status Tracker

- **Total**: 56
- **NOT_DONE**: 50
- **IN_PROGRESS**: 0
- **DONE**: 6
- **FAILED**: 0
- **BLOCKED**: 0

## MVP Architecture Decisions

- [ ] Use two distinct Claude invocation modes.
  - Planning mode is interactive and may use normal terminal stdio.
  - Execution mode is headless and must use `claude -p "<prompt>" --output-format json`.
  - Execution code must parse the structured JSON response, not scrape free-form terminal text.
  - Expected execution response fields include `result`, `total_cost_usd`, `usage`, `session_id`, and `is_error`.
  - Treat missing or malformed JSON as an executor failure with a clear log path and no commit.

- [ ] Require a structured task result sentinel inside Claude's JSON `result`.
  - The execution prompt must require a machine-readable sentinel such as `ORCHESTRATOR_RESULT: SUCCESS`, `ORCHESTRATOR_RESULT: BLOCKED`, or `ORCHESTRATOR_RESULT: NEEDS_RETRY_CONTEXT`.
  - `BLOCKED` detection must come from the required sentinel, not vague prose.
  - `DONE` is never taken from Claude output; it is still granted only by orchestrator verification.
  - Store the raw JSON response and parsed sentinel in the per-task state file.

- [ ] Treat Claude permissions as an actual boundary, not just prompt text.
  - Execution must pass explicit Claude permission controls such as `--permission-mode` and/or `--allowedTools` where supported.
  - Do not use `--dangerously-skip-permissions` for normal execution.
  - Run each task in an isolated Git worktree or equivalent sandbox rooted under orchestrator-controlled state.
  - Protected-file safety must be enforced by the worktree/sandbox, command policy, and post-run diff checks; prompt text is only an additional instruction.
  - If a safety rule cannot be technically enforced in the MVP, document it as advisory instead of claiming it as guaranteed.

## TDD & Safety Principles

- [ ] Follow red-green-refactor for all core behavior.
  - Start each implementation task by writing tests for the expected behavior and edge cases.
  - Keep tests close to the module they protect.
  - Prefer small pure functions for parsing, selection, config validation, status transitions, branch naming, and command policy checks.
  - Add integration tests only after unit boundaries are stable.

- [ ] Treat autonomous execution as security-sensitive.
  - Default to least privilege.
  - Never run destructive Git commands such as `git reset --hard`, `git clean`, force push, branch deletion, or history rewrite.
  - Never touch files that look like secrets, credentials, private keys, `.env` files, or ignored local config unless the user explicitly opted in.
  - Never print secret-looking values to logs.
  - Require explicit validation of plan files and config before execution.
  - Keep retry behavior bounded by config and enforce a hard maximum.
  - Bound every Claude execution with a per-task wall-clock timeout.

## Phase 1: Setup, Scaffolding & Project Foundations

- [x] Initialize the Node.js project.
  - Create `package.json` with ESM support unless a clear reason emerges to use CommonJS.
  - Define package metadata, executable binary mapping, scripts, and publish-safe defaults.
  - Add a `.gitignore` covering `node_modules`, build output, logs, generated orchestration state, and local environment files.
  - Initialize Git for this repository before any branch orchestration work begins.

- [x] Add strict TypeScript configuration.
  - Create `tsconfig.json` with strict mode enabled.
  - Prefer explicit interfaces and discriminated unions for config, CLI args, plan parsing results, task states, verification results, and execution summaries.
  - Avoid `any`; use `unknown` plus validation when external data is parsed.
  - Resolve runtime paths from `process.cwd()` for user project files, never from the installed package directory.

- [x] Add linting, formatting, and tests before feature work.
  - Configure ESLint for TypeScript.
  - Configure Prettier.
  - Add `vitest` for unit tests.
  - Add scripts such as `build`, `typecheck`, `lint`, `format`, and `test`.
  - Ensure CI-style commands can run non-interactively.
  - Add an initial smoke test so the test harness is proven before feature implementation.

- [x] Install core runtime dependencies.
  - Use `commander` for CLI command routing.
  - Use `@clack/prompts` for interactive prompts.
  - Use `execa` for Claude Code, Git, and verification subprocesses.
  - Use `picocolors` for terminal styling.
  - Consider `zod` or a similar validator for `.claude-orchestrator.json` parsing.
  - Do not install `node-notifier` in MVP; notifications are post-MVP.
  - Do not add broad shell helper dependencies that encourage unvalidated command execution.

- [x] Define the source tree.
  - `src/cli.ts` for top-level command registration.
  - `src/commands/plan.ts` and `src/commands/run.ts`.
  - `src/config/` for config loading, defaults, and validation.
  - `src/plans/` for scanning, parsing, task selection, and safe Markdown updates.
  - `src/executor/` for Claude session execution, verification, retries, and commits.
  - `src/git/` for branch and commit helpers.
  - `src/worktrees/` for isolated per-task worktree lifecycle.
  - `src/prompts/` for injected prompt constants.
  - `src/logging/` for per-task logs, token extraction, and run summaries.
  - `src/types/` for shared TypeScript interfaces.

- [x] Create the executable entry point.
  - Add a small `bin/claude-orchestrator.js` shim that loads the compiled CLI.
  - Ensure package `bin` points to the executable.
  - Verify the built CLI can be invoked locally.

- [ ] Add Phase 1 tests before marking scaffold complete.
  - Test CLI help can render.
  - Test config defaults can be imported.
  - Test the package entry point resolves after build.

## Phase 2: Configuration Schema, CLI Commands & Runtime Defaults

- [ ] Freeze the MVP `.claude-orchestrator.json` contract before implementation.
  - `version`: required config schema version.
  - `planDir`: project-relative directory containing generated plans.
  - `baseBranch`: default branch to branch or worktree from.
  - `branchPrefix`: prefix for orchestrator-created branches.
  - `models.planning`: model used by the interactive `plan` command.
  - `models.execution`: model used by headless task execution if Claude CLI supports model selection.
  - `claude.binary`: command name or absolute path, default `claude`.
  - `claude.permissionMode`: explicit permission mode for headless execution when supported.
  - `claude.allowedTools`: explicit Claude tool allowlist for task execution.
  - `claude.extraSafeArgs`: optional vetted args that do not override the fixed execution contract.
  - `taskTimeoutMs`: per-task Claude execution wall-clock timeout.
  - `verificationCommands`: ordered structured verification commands.
  - `maxRetries`: retry cap for task/verification failures.
  - `logsDir`: project-relative log root.
  - `stateDir`: project-relative state root.
  - `worktreeDir`: project-relative per-task worktree root.
  - `commitMessageTemplate`: template for verified task commits.
  - `sessionLimits.showBeforeRun`: display known Claude limit info before task execution.
  - `sessionLimits.pauseOnLimit`: pause cleanly on detected limit exhaustion.
  - `security.allowedCommands`: optional allowlist for structured verification command executables.
  - `security.deniedCommands`: built-in denylist extension; cannot weaken the built-in denylist.
  - `security.protectedPaths`: project-relative protected path patterns.
  - `security.allowNetwork`: reserved for future network-aware command policy.
  - `notifications`: post-MVP only; rejected or ignored by MVP execution logic.

- [ ] Freeze the structured command shape.
  - Verification commands must be objects, never shell strings.
  - Required fields: `command`, `args`, and `timeoutMs`.
  - Optional fields: `name`, `cwd`, `env`, and `allowFailure`.
  - `command` must be a single executable name or absolute path.
  - `args` must be an array of literal strings.
  - `cwd`, when present, is project-relative in config and must resolve inside the task worktree at execution time.
  - `env`, when present, must be explicit key/value strings and must not reference host shell expansion.
  - `allowFailure` defaults to false and is for advisory commands only; required verification gates must fail the task on non-zero exit.
  - Commands must run with `shell: false`.

- [ ] Define MVP hard limits and defaults.
  - `maxRetries` default should be small and must have a hard maximum.
  - `taskTimeoutMs` default must be finite and must have a hard maximum.
  - Verification command timeouts must be finite and bounded.
  - `worktreeDir`, `logsDir`, and `stateDir` default under `.claude-orchestrator/`.
  - `sessionLimits.resumeAfterReset` is post-MVP and must not silently schedule work in MVP.
  - Notifications and webhooks are post-MVP and must not affect MVP control flow.

- [ ] Define the fixed Claude execution command contract.
  - The orchestrator assembles `claude -p <prompt> --output-format json`.
  - User config must not replace `-p` or `--output-format json`.
  - User config must not enable `--dangerously-skip-permissions` for normal execution.
  - Permission args must be assembled from validated config fields.
  - The prompt must be passed as an argument through `execa`, not interpolated through a shell string.

- [ ] Implement config loading.
  - Resolve config path from `process.cwd()`.
  - Merge user config with safe defaults.
  - Validate config and show friendly errors with actionable fixes.
  - Prefer prompts for missing optional decisions rather than hard failures.
  - Fail early only for invalid values that would make execution unsafe.
  - Enforce hard upper bounds for `maxRetries`, `taskTimeoutMs`, and verification command timeouts.
  - Reject protected paths that escape `process.cwd()` unless explicitly supported and safely validated.
  - Reject verification commands expressed as raw shell strings.
  - Reject user config that tries to override the fixed Claude execution command contract.

- [ ] Implement command and permission policy validation.
  - Validate verification commands before execution.
  - Block destructive Git commands regardless of config.
  - Execute commands with `execa(command, args, { shell: false })`.
  - Block shell fragments, inline command chains, redirection, command substitution, and environment interpolation.
  - Require explicit user confirmation for any command outside the allowlist.
  - Record policy decisions in logs without recording secrets.
  - Validate Claude permission mode and allowed tools before execution.
  - Validate that `--dangerously-skip-permissions` is not present for normal execution.

- [ ] Freeze the MVP CLI command surface.
  - `claude-orchestrator init`: create or update `.claude-orchestrator.json` interactively.
  - `claude-orchestrator doctor`: check Claude binary, auth, Git repo, config validity, command policy, and writable state/log/worktree dirs.
  - `claude-orchestrator validate`: validate config and plan files without executing Claude.
  - `claude-orchestrator plan`: run interactive planning.
  - `claude-orchestrator run`: execute one selected task by default.
  - `claude-orchestrator run --loop`: optional explicit loop mode; never implicit.
  - `claude-orchestrator run --dry-run`: show selected task, worktree, Claude command shape, verification commands, and log paths without mutation.
  - `claude-orchestrator status`: show selected/current plan state, active task, dirty worktree state, last run result, and resume command.
  - `claude-orchestrator logs`: print or open paths to relevant logs without dumping full logs by default.
  - `claude-orchestrator resume`: continue an `IN_PROGRESS`, `BLOCKED: SESSION_LIMIT`, or interrupted task after validating worktree state.

- [ ] Define CLI option rules.
  - Options may select config path, plan path, task ID, dry-run, loop mode, and verbosity.
  - Options must not bypass config validation, plan validation, command policy, timeouts, worktree isolation, or verification gates.
  - Dangerous override flags are out of scope for MVP.

- [ ] Add config and command tests.
  - Test default config.
  - Test partial user config merging.
  - Test invalid config reports.
  - Test path resolution from a simulated project root.
  - Test retry caps are bounded.
  - Test protected paths are rejected.
  - Test denied commands cannot be allowed by user config.
  - Test allowed verification commands pass validation.
  - Test raw shell-string verification commands are rejected.
  - Test command arguments are passed without `shell: true`.
  - Test unsafe Claude permission args are rejected.
  - Test task timeout defaults and hard maximum.
  - Test verification command timeout defaults and hard maximum.
  - Test session-limit defaults.
  - Test invalid reset/resume settings are rejected.
  - Test every MVP CLI command can render help.
  - Test `doctor` fails before task mutation when Claude is missing or unauthenticated.

## Phase 3: Plan Generation Command (`plan`)

- [ ] Implement the `plan` command.
  - Prompt for model selection using `@clack/prompts`.
  - Prompt for or confirm the plan directory if config does not define one.
  - Ensure the plan directory exists relative to `process.cwd()`.
  - Spawn Claude Code interactively with the plan generation prompt.

- [ ] Use the correct process IO mode for planning.
  - `plan` is intentionally interactive, so `stdio: 'inherit'` is acceptable.
  - The command should still catch process exits and restore terminal state cleanly.
  - Non-zero exits should produce a friendly summary and should not leave the CLI in a broken state.

- [ ] Store the plan generation prompt as a source constant.
  - The prompt should instruct Claude to collaborate with the user.
  - It should require a Markdown plan in the configured plan directory.
  - It should require the 5-state checkbox system.
  - It should include a short "execution contract" explaining that future runner sessions implement exactly one task and then stop.
  - It must not tell Claude to commit changes during task execution.
  - It should tell Claude generated plans must be machine-parseable by the orchestrator before execution.

- [ ] Add command tests for `plan` behavior.
  - Test prompt construction with configured plan directory.
  - Test model selection is passed through.
  - Test non-zero Claude exits are handled.
  - Mock subprocess execution rather than invoking Claude in unit tests.

## Phase 4: Plan Parser, State Model & Safe Markdown Updates

- [ ] Implement `run` command plan discovery.
  - Scan the configured `planDir` for `.md` files.
  - Present an interactive selector.
  - Show useful metadata where available, such as last modified time and remaining task count.
  - Handle empty plan directories with a prompt to run `claude-orchestrator plan`.

- [ ] Validate plan files before execution.
  - Require at least one recognized task checkbox.
  - Reject ambiguous checkbox markers outside the supported 5-state system.
  - Reject duplicate task identities only if they would make state tracking unsafe.
  - Report malformed task lines with line numbers.
  - Do not spawn Claude until the plan validates.

- [ ] Define strict task status types.
  - `NOT_DONE`: `- [ ]` or `* [ ]`.
  - `IN_PROGRESS`: `- [-]` or `* [-]`.
  - `DONE`: `- [x]`, `- [X]`, `* [x]`, or `* [X]`.
  - `FAILED`: `- [f]`, `- [F]`, `* [f]`, or `* [F]`.
  - `BLOCKED`: `- [b]`, `- [B]`, `* [b]`, or `* [B]`.

- [ ] Build the Markdown parser utility.
  - Parse task lines while preserving original text, bullet marker, indentation, and surrounding Markdown.
  - Capture stable task identity using a deterministic slug/hash of normalized task text and heading context.
  - Do not include line number in the persisted task identity because handoff notes and Markdown edits can shift lines.
  - Keep line number only as transient display/debug metadata for the current parse.
  - Capture heading context so logs and commits can reference the section.
  - Determine the first executable task:
    - Prefer `IN_PROGRESS` when resuming an interrupted run.
    - Otherwise pick the first `NOT_DONE`.
    - Consider `FAILED` only when retry count is below `maxRetries`.
    - Do not proceed past a `BLOCKED` task unless the user explicitly chooses to skip or unblock it.

- [ ] Implement safe Markdown status updates.
  - Change only the checkbox marker for a selected task.
  - Preserve indentation, list marker style, spacing, task text, comments, and nearby custom formatting.
  - Do not rewrite the full Markdown file with a formatter.
  - For MVP, use tightly scoped regex replacement against the exact parsed line.
  - If regex preservation becomes fragile, switch to a Markdown AST approach, but only if formatting can still be preserved.

- [ ] Add plan parser and updater tests immediately.
  - Test all supported checkbox statuses and both `-` and `*` bullets.
  - Test uppercase and lowercase status markers.
  - Test nested tasks and indented checkboxes.
  - Test custom Markdown around tasks.
  - Test replacing only one selected task.
  - Test `IN_PROGRESS` resume behavior.
  - Test failed retry selection.
  - Test blocked task halt behavior.
  - Test malformed plan validation.
  - Test duplicate or unstable task identity handling.
  - Test task IDs remain stable when handoff notes or unrelated lines are inserted above later tasks.
  - Test line numbers are never used as persistent state keys.

- [ ] Define execution state storage.
  - Store retry counts outside the Markdown file so custom formatting is not polluted.
  - Use `stateDir` for per-plan state keyed by a stable plan identifier.
  - Use stable task slug/hash IDs for per-task state.
  - Track task attempts, last status, log file paths, Claude exit codes, Claude `session_id`, structured JSON response paths, verification results, worktree path, and commit hashes.
  - Treat Markdown as human-readable task state and state files as machine metadata.
  - Validate state files on load and recover gracefully from corrupt state with a user-visible warning.
  - Store handoff notes in state files by default, not inside the plan Markdown.
  - If later versions support writing handoff notes into the plan, tests must prove task identity remains stable.

## Phase 5: Executor Engine, Claude Sessions & Lifecycle Boundaries

- [ ] Implement headless Claude execution.
  - Execution mode must invoke Claude as `claude -p "<prompt>" --output-format json` using `execa` args, not shell interpolation.
  - Include configured safe permission arguments such as `--permission-mode` and `--allowedTools` where supported.
  - Parse the JSON response into a strict TypeScript interface.
  - Persist the raw JSON response to the task log directory.
  - Use `total_cost_usd`, `usage`, and `session_id` directly from JSON.
  - Treat malformed JSON, missing required fields, and `is_error: true` as executor outcomes, not parser guesses.
  - Never scrape token usage with regex when structured JSON fields are available.

- [ ] Define the required Claude result sentinel.
  - Require Claude to end its `result` text with a machine-readable sentinel.
  - Supported sentinels for MVP:
    - `ORCHESTRATOR_RESULT: SUCCESS`
    - `ORCHESTRATOR_RESULT: BLOCKED`
    - `ORCHESTRATOR_RESULT: NEEDS_RETRY_CONTEXT`
  - Parse the sentinel from `result`.
  - If the sentinel is missing, treat the run as `FAILED` or `NEEDS_RETRY_CONTEXT` according to tests, and do not verify/commit blindly.
  - For `BLOCKED`, require a `BLOCKED_REASON:` line in the result and store it in state.

- [ ] Implement Claude session-limit awareness.
  - Before spawning Claude, attempt to read available usage/session-limit information if Claude Code exposes it through command output, status output, logs, or another stable interface.
  - Treat usage visibility as best-effort: if remaining usage or reset time cannot be determined, show `unknown` rather than guessing.
  - When available, show remaining Claude session usage and reset time in the pre-run terminal summary.
  - Capture raw usage/status evidence in logs so parsing can be audited.
  - Parse Claude limit errors from subprocess exit output and classify them separately from implementation failures and verification failures.
  - If a limit is reached before implementation starts, leave the task `NOT_DONE` and halt with a resumable message.
  - If a limit is reached after the task was marked `IN_PROGRESS`, keep the task resumable and mark it `BLOCKED` with reason `SESSION_LIMIT` unless a safer state transition is defined by tests.
  - Store detected reset time, limit message, and affected task in execution state.
  - Print the exact resume command and, when known, when the Claude limit resets.
  - Do not increment the normal task retry counter for session-limit blocks; quota exhaustion is not an implementation failure.
  - If the app later supports automations, optionally schedule a resume after reset only with explicit user opt-in.

- [ ] Implement the execution loop.
  - Load config and selected plan.
  - Run Claude binary/auth preflight before task selection or plan mutation.
  - Parse tasks and identify the next executable task.
  - If all tasks are already `DONE`, skip Claude execution and show a plan completion overview.
  - Show known Claude session-limit information before spawning Claude, or clearly state when it is unavailable.
  - Create or reuse an isolated per-task Git worktree before spawning Claude.
  - Mark the selected task `IN_PROGRESS` before spawning Claude.
  - Spawn exactly one headless Claude Code execution for that task.
  - Enforce the configured per-task wall-clock timeout.
  - After Claude exits, inspect exit code, structured JSON, sentinel, worktree diff, logs, and workspace changes.
  - Run verification gates only if Claude returns valid JSON with the `SUCCESS` sentinel and no orchestrator-level failure.
  - Mark `DONE` only after verification succeeds.
  - Mark `FAILED` when verification fails or Claude exits unsuccessfully without a block signal.
  - Mark `BLOCKED` when Claude returns the `BLOCKED` sentinel with a reason.
  - Mark `FAILED` on timeout, kill the child process, preserve logs, and leave the worktree for inspection or retry according to config.
  - Mark or preserve the task as resumable when Claude stops because of a session limit.
  - Stop after one task by default unless the command explicitly supports loop mode.
  - Refuse to run if plan validation, config validation, or command policy validation fails.
  - When the final task becomes `DONE`, close the run with a completion overview instead of trying to select another task.

- [ ] Keep lifecycle ownership in the orchestrator.
  - Claude should not mark tasks `DONE`.
  - Claude should not commit changes.
  - Claude should provide handoff notes in its JSON `result`; the orchestrator stores them in state/logs.
  - The orchestrator should be the only component that decides whether a task is complete.
  - Verification must happen before status becomes `DONE` and before a commit is created.

- [ ] Use the correct process IO mode for execution.
  - Use headless JSON mode for execution instead of interactive inherited stdio.
  - Use `stdio: 'pipe'` to capture JSON stdout and stderr.
  - Do not stream raw JSON continuously as terminal progress; show concise lifecycle status while saving raw output to files.
  - Capture stdout/stderr to per-task log files.
  - Capture exit codes and signals without crashing the parent CLI.
  - Redact secret-looking values before writing logs.

- [ ] Design the Claude execution prompt carefully.
  - Include the selected plan path and selected task text.
  - Include stable task ID, worktree path, and expected sentinel format.
  - Tell Claude to implement only the selected task.
  - Tell Claude not to continue to later tasks.
  - Tell Claude not to commit.
  - Tell Claude not to mark the task `DONE`.
  - Tell Claude to include a concise handoff note in the JSON `result` if implementation finishes.
  - Tell Claude to return `ORCHESTRATOR_RESULT: BLOCKED` plus `BLOCKED_REASON:` only if user input, credentials, permissions, or missing external context prevent progress.
  - Tell Claude not to edit secret files or credential files.
  - Tell Claude not to run destructive Git operations.

- [ ] Implement retry behavior.
  - Increment retry count when Claude fails or verification fails.
  - Include previous verification stderr/stdout excerpts and previous Claude failure summary in the retry prompt.
  - Keep retry context concise and redacted.
  - If retry count remains below `maxRetries`, leave the task eligible for retry.
  - If retry cap is reached, mark `FAILED` and halt with a clear summary.
  - Avoid infinite loops by making retry decisions explicit and visible.
  - Store retry metadata in state files, not in the Markdown task line.
  - Enforce both configured retry cap and hard maximum retry cap.
  - Stop immediately when the same failure repeats enough times to hit the cap.
  - Exclude session-limit pauses from retry counts.

- [ ] Implement graceful interruption.
  - On `SIGINT`, stop spawning new work.
  - Forward termination to the Claude child process if it is running.
  - Preserve logs captured so far.
  - Preserve the per-task worktree with partial changes for inspection.
  - On resume, detect an existing dirty task worktree and prompt to continue in it, retry from clean base, or halt.
  - Leave the current task as `IN_PROGRESS` or transition it to `FAILED` only if the failure is certain.
  - Print the exact command the user can run to resume.

- [ ] Add executor tests before wiring real Claude execution.
  - Test status transitions for success, failure, block, retry, and interrupt.
  - Test headless JSON response parsing.
  - Test malformed JSON handling.
  - Test `is_error` handling.
  - Test `session_id`, `usage`, and `total_cost_usd` are persisted from JSON.
  - Test sentinel parsing for success, blocked, retry-context, and missing sentinel.
  - Test per-task timeout kills Claude and marks the task failed without commit.
  - Test retry prompt includes prior verification stderr.
  - Test existing dirty worktree resume choices.
  - Test session-limit preflight display when usage and reset time are available.
  - Test session-limit preflight display when usage is unavailable.
  - Test Claude limit errors are classified as `SESSION_LIMIT`, not verification failure.
  - Test session-limit pauses do not increment retry counts.
  - Test resume messaging includes reset time when known.
  - Test all-done plans produce a completion overview without spawning Claude.
  - Test the final task completion path prints an overview and exits cleanly.
  - Test Claude subprocess failures do not crash the CLI.
  - Test verification is required before `DONE`.
  - Test commits are not attempted when verification fails.
  - Test blocked tasks halt execution.
  - Test secret redaction in captured logs.

## Phase 6: Git Branching, Commits & Workspace Safety

- [ ] Implement Git repository detection.
  - Detect when the current project is not a Git repository.
  - Prompt to initialize Git or halt before branch orchestration.
  - Never assume `main` exists; detect available branches and use config defaults.

- [ ] Build branch management utilities.
  - Prompt for branch name with a default derived from the plan name.
  - Sanitize branch names.
  - Confirm base branch.
  - Check for uncommitted changes before switching branches.
  - Do not discard user changes.
  - If the working tree is dirty, ask whether to continue on the current branch, create a branch with existing changes, or halt.
  - Forbid force push, reset hard, clean, rebase, and history rewrite operations.
  - Keep all Git operations non-destructive and auditable.

- [ ] Build per-task worktree utilities.
  - Create one isolated worktree per task attempt or reusable task ID according to config.
  - Derive worktree branch names from plan ID and stable task ID.
  - Detect existing dirty worktrees before execution or resume.
  - Support user choices for dirty resume: continue existing worktree, retry from clean base, or halt.
  - Never delete a dirty worktree automatically.
  - Record worktree path and branch in task state.

- [ ] Create commits only after verification passes.
  - Stage all changes with `git add -A` on the dedicated per-task branch/worktree; do not attempt to scope staging by relevance.
  - Include plan file updates and orchestrator state/log references as appropriate.
  - Use a deterministic commit message template.
  - Record commit hash in the execution state file.
  - If no file changes exist after a successful task, do not create an empty commit unless explicitly configured.
  - Never push automatically in the MVP.
  - Never amend previous commits automatically.

- [ ] Add Git helper tests where possible.
  - Test branch name sanitization.
  - Test dirty tree detection parsing.
  - Test commit message rendering.
  - Test forbidden Git commands are blocked.
  - Test per-task worktree creation.
  - Test dirty worktree detection and resume choices.
  - Keep actual Git integration tests isolated in temporary repositories.

## Phase 7: Verification Gates & Dry Run

- [ ] Implement verification gates.
  - Read ordered commands from config.
  - Run commands from the task worktree by default, not the original project root.
  - Respect structured command `cwd` only when it resolves inside the task worktree.
  - Run with `execa(command, args, { shell: false })`.
  - Stream output to the terminal and capture it to logs.
  - Stop on first failing command.
  - Store command, exit code, duration, stdout path, and stderr path.
  - If no verification commands are configured, prompt the user before treating work as complete.
  - Validate commands against security policy before running them.
  - Redact secret-looking output before writing logs.

- [ ] Implement `--dry-run`.
  - Show selected plan.
  - Show selected task.
  - Show intended branch operation.
  - Show verification commands.
  - Show log/state paths.
  - Do not spawn Claude.
  - Do not edit Markdown.
  - Do not create branches or commits.

- [ ] Add tests for verification behavior.
  - Test passing commands.
  - Test failing commands.
  - Test no configured commands.
  - Test command execution from the task worktree.
  - Test command `cwd` cannot escape the task worktree.
  - Test blocked commands do not run.
  - Test output redaction.

## Phase 8: Logging, Token/Cost Tracking & Run Reports

- [ ] Implement per-task logging.
  - Store logs under `.claude-orchestrator/logs/<plan-id>/<task-id>/`.
  - Capture Claude stdout and stderr.
  - Capture verification stdout and stderr.
  - Capture timestamps, durations, exit codes, and signals.
  - Keep logs append-safe across retries.
  - Keep terminal output concise by default while preserving full details in log files.
  - Print the detailed log file path at the end of each task and at plan completion.

- [ ] Implement token, usage, cost, and session tracking.
  - Read `usage`, `total_cost_usd`, and `session_id` from Claude JSON responses.
  - Store the raw Claude JSON response as evidence.
  - Treat missing structured JSON fields as schema/compatibility issues, not regex parsing problems.
  - Aggregate per-task and per-plan totals.
  - Keep pricing configurable or clearly labeled as estimated.
  - Track known session-limit metadata separately from token/cost estimates.
  - Include reset timing only when it is explicitly available from Claude output/status, not inferred.

- [ ] Implement user-facing summaries.
  - Show task result, verification result, retry count, commit hash, and log path.
  - Show Claude session-limit remaining/reset information when available.
  - Keep terminal summaries focused on relevant lines: selected task, result, failing command if any, commit hash, retry count, and next action.
  - Save in-depth logs and verbose subprocess output to files rather than flooding the terminal.
  - On failure, show the failing command and a short pointer to the log.
  - On block, show the block reason and how to resume.
  - On session-limit block, show that work is paused rather than failed, include reset time when known, and show the resume command.
  - On plan completion, summarize completed tasks, failed tasks, blocked tasks, commits, and total cost estimate.
  - On plan completion, include the plan path, final branch, verification status, log directory, and state directory.
  - If every task is `DONE`, clearly tell the user the plan is complete and no further orchestration work remains.

- [ ] Add run report tests.
  - Test concise terminal overview content.
  - Test detailed log path is included.
  - Test all-done plan overview.
  - Test completed-after-final-task overview.
  - Test session-limit block overview.
  - Test summaries do not include secret-looking values.

## Phase 9: Packaging, Documentation & Post-MVP Boundaries

- [ ] Keep notifications out of MVP.
  - Desktop notifications are post-MVP.
  - Webhooks are post-MVP.
  - Automatic resume after session reset is post-MVP.
  - Network-aware verification policy is post-MVP.
  - Dangerous override modes are post-MVP.
  - Do not install notification dependencies until the feature is actively implemented.

- [ ] Prepare for npm publishing.
  - Add package files whitelist.
  - Add README command examples.
  - Verify executable permissions.
  - Verify the compiled package works from a temporary project.
  - Document minimum Node.js version.

- [ ] Final documentation pass.
  - Ensure README, SKILLS, AGENTS, and PLAN agree on lifecycle boundaries.
  - Ensure all docs say the orchestrator owns verification and commits.
  - Ensure no prompt tells Claude to mark tasks `DONE` or commit.
