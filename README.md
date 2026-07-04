# Claude Code Orchestrator

Claude Code Orchestrator is a TypeScript CLI for running Claude Code through a test-driven, task-by-task workflow with verification, logs, resumability, and safe Git commits.

The core rule is:

**Claude implements one selected task. The orchestrator owns lifecycle state.**

Claude task sessions do not mark tasks `DONE`, do not commit, and do not decide whether work is complete. The orchestrator validates the plan, runs Claude headlessly, checks structured results, runs verification commands, updates task state, and commits only after verification passes.

## Status

This repository is currently in the planning/scaffolding stage. The implementation contract is documented in [PLAN.md](/Users/iambesttt/Developer/Projects/claude-orchestrator/PLAN.md), [SKILLS.md](/Users/iambesttt/Developer/Projects/claude-orchestrator/SKILLS.md), and [AGENTS.md](/Users/iambesttt/Developer/Projects/claude-orchestrator/AGENTS.md).

## Workflow

The intended workflow is:

1. Create or validate config.
2. Generate a Markdown implementation plan.
3. Validate the plan.
4. Select one task.
5. Create or reuse an isolated per-task Git worktree.
6. Run Claude Code headlessly for that task.
7. Parse Claude's structured JSON result.
8. Run verification commands.
9. Mark the task `DONE` only if verification passes.
10. Commit verified changes.
11. Stop, resume later, or explicitly continue in loop mode.

## Plan Format

Plans live in `planDir`, defaulting to `workflow_generated_plans`.

Tasks use a strict 5-state Markdown checkbox format:

- `- [ ]` or `* [ ]`: `NOT_DONE`
- `- [-]` or `* [-]`: `IN_PROGRESS`
- `- [x]`, `- [X]`, `* [x]`, or `* [X]`: `DONE`
- `- [f]`, `- [F]`, `* [f]`, or `* [F]`: `FAILED`
- `- [b]`, `- [B]`, `* [b]`, or `* [B]`: `BLOCKED`

Task identity is based on a stable slug/hash of normalized task text and heading context. Line numbers are not used as persistent task IDs because plan files can change as handoff notes or content are added.

## Claude Execution Contract

Planning and execution use different Claude modes:

- `plan` is interactive.
- `run` is headless.

Execution must use Claude Code's non-interactive JSON mode:

```text
claude -p "<prompt>" --output-format json
```

The orchestrator expects structured JSON fields such as:

- `result`
- `total_cost_usd`
- `usage`
- `session_id`
- `is_error`

The orchestrator stores the raw JSON response in the task log directory. Token usage and cost are read from structured JSON fields, not scraped from terminal text.

The `result` field must include an orchestrator sentinel:

- `ORCHESTRATOR_RESULT: SUCCESS`
- `ORCHESTRATOR_RESULT: BLOCKED`
- `ORCHESTRATOR_RESULT: NEEDS_RETRY_CONTEXT`

`DONE` is never inferred from Claude output. `DONE` requires successful verification.

## Commands

### `claude-orchestrator init`

Create or update `.claude-orchestrator.json` interactively.

Expected behavior:

- Prompt for plan directory, base branch, verification commands, timeouts, and Claude permission settings.
- Write a validated config file.
- Avoid adding post-MVP features such as notifications unless explicitly supported later.

### `claude-orchestrator doctor`

Check whether the current project can safely run orchestration.

Checks include:

- Claude binary exists.
- Claude authentication can be verified if Claude exposes a stable check.
- Current directory is a Git repository.
- Config is valid.
- Plan directory is readable.
- State, log, and worktree directories are writable.
- Verification commands satisfy command policy.
- Claude permission settings are safe.

No task state is mutated by `doctor`.

### `claude-orchestrator validate`

Validate config and plan files without executing Claude.

Checks include:

- `.claude-orchestrator.json` schema and defaults.
- Structured verification commands.
- Protected paths.
- Plan checkbox states.
- Duplicate or unstable task identity.
- Unsupported or ambiguous task markers.

### `claude-orchestrator plan`

Start an interactive planning session with Claude Code.

Expected behavior:

- Prompt for planning model if needed.
- Ensure the plan directory exists.
- Inject the planning prompt.
- Ask Claude to create a machine-parseable Markdown plan using the 5-state checkbox system.

### `claude-orchestrator run`

Execute one selected task from a plan.

Default behavior:

- Validate config and plan.
- Run Claude binary/auth preflight.
- Select the next executable task.
- Create or reuse a per-task worktree.
- Run Claude headlessly in JSON mode.
- Enforce `taskTimeoutMs`.
- Parse the sentinel from Claude's JSON `result`.
- Run verification commands only after a `SUCCESS` sentinel.
- Mark `DONE` and commit only after verification passes.
- Stop after one task.

### `claude-orchestrator run --loop`

Run multiple tasks in sequence.

Loop mode must be explicit. It should still stop on:

- verification failure after retry cap
- `BLOCKED`
- session-limit pause
- timeout
- dirty worktree requiring user choice
- invalid plan/config

### `claude-orchestrator run --dry-run`

Preview the next execution without mutating files.

Shows:

- selected plan
- selected task
- stable task ID
- intended worktree
- Claude command shape
- verification commands
- timeout settings
- log and state paths

Does not:

- spawn Claude
- edit Markdown
- create commits
- create branches
- run verification commands

### `claude-orchestrator status`

Show current orchestration state.

Expected output:

- selected/current plan
- task counts by status
- active or next task
- current worktree state
- last Claude `session_id`
- last result
- retry count
- session-limit pause details if present
- resume command

### `claude-orchestrator logs`

Show paths to relevant logs without dumping full verbose output by default.

Logs include:

- raw Claude JSON response
- Claude stderr
- verification stdout/stderr
- task state snapshots
- command policy decisions
- summary reports

### `claude-orchestrator resume`

Continue an interrupted, `IN_PROGRESS`, or `BLOCKED: SESSION_LIMIT` task.

Expected behavior:

- Validate config and plan again.
- Detect dirty task worktree state.
- Prompt whether to continue in the existing worktree, retry from clean base, or halt.
- Preserve previous logs and retry context.
- Continue without consuming retry budget for session-limit pauses.

## Configuration

Configuration lives in `.claude-orchestrator.json` at the project root.

Top-level config areas:

- `version`: config schema version.
- `planDir`: project-relative plan directory.
- `baseBranch`: base branch for task worktrees.
- `branchPrefix`: branch name prefix for orchestrator work.
- `models`: planning/execution model defaults.
- `claude`: Claude binary, permission mode, allowed tools, and safe extra args.
- `taskTimeoutMs`: per-task Claude wall-clock timeout.
- `verificationCommands`: ordered structured verification commands.
- `maxRetries`: bounded retry cap.
- `logsDir`: log directory.
- `stateDir`: state directory.
- `worktreeDir`: per-task worktree directory.
- `commitMessageTemplate`: verified task commit template.
- `sessionLimits`: Claude usage-limit behavior.
- `security`: command allowlist, denylist, protected paths, and network policy.

### Verification Commands

Verification commands must be structured objects, not shell strings.

Required fields:

- `command`: executable name or absolute path.
- `args`: literal argument array.
- `timeoutMs`: finite timeout.

Optional fields:

- `name`: display name.
- `cwd`: project-relative working directory that must resolve inside the task worktree at execution time.
- `env`: explicit environment key/value overrides.
- `allowFailure`: advisory command flag, default false.

Commands run with `shell: false`. Shell chains, redirection, command substitution, and interpolated environment expressions are not part of the MVP command model.

## Safety Model

The MVP safety model relies on real execution boundaries, not only prompt instructions.

- Each task runs in an isolated Git worktree or equivalent sandbox.
- Claude execution uses validated permission settings.
- `--dangerously-skip-permissions` is not allowed for normal execution.
- Protected path patterns are checked before and after execution.
- Destructive Git operations are blocked.
- Claude task sessions do not commit, amend, push, force-push, reset, clean, rebase, delete branches, or rewrite history.
- The orchestrator does not auto-push in the MVP.
- Verification commands are structured and policy-checked.
- Secret-looking values are redacted from logs.

Prompt instructions still tell Claude not to touch secrets or run destructive Git, but prompt text is treated as advisory unless backed by a technical boundary.

## Timeouts, Retries & Resume

Every Claude task execution has a finite wall-clock timeout. Timeout behavior:

- Kill the Claude child process.
- Preserve logs.
- Preserve the task worktree for inspection.
- Mark or report the task according to tested executor rules.
- Do not commit.

Retry behavior:

- Verification or implementation failures increment retry count.
- Retry prompts include concise, redacted prior failure context.
- Session-limit pauses do not consume retry budget.
- Retries stop at the configured cap and hard maximum.

Resume behavior:

- Interrupted work remains inspectable in its task worktree.
- On resume, dirty worktree state is detected.
- The user chooses whether to continue, retry cleanly, or halt.

## Session Limits

The orchestrator should show Claude session-limit information when Claude exposes it through stable output/status.

If remaining usage or reset time is available, it appears in pre-run and summary output. If unavailable, the CLI says `unknown` rather than guessing.

If Claude stops because of a session limit:

- the task is paused as resumable work
- normal retry count is not incremented
- reset time is saved when known
- the terminal shows the resume command
- no commit is created

Automatic resume after reset is post-MVP unless an explicit automation feature is added later.

## Logs & Completion Overview

Terminal output should stay concise. Full details go to files under `logsDir`.

On task completion, the terminal should show:

- task result
- verification result
- retry count
- commit hash when created
- log path
- next action

When all tasks are `DONE`, the orchestrator should close cleanly and show:

- plan path
- final status
- completed, failed, and blocked counts
- commits created
- verification status
- retry summary
- estimated cost/usage from Claude JSON when available
- detailed log directory

## Post-MVP

These features are explicitly post-MVP:

- desktop notifications
- webhooks
- automatic resume after session reset
- network-aware verification policy
- dangerous override modes
