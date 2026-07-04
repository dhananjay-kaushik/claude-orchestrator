/**
 * Global application configuration
 */
export interface VerificationCommand {
  command: string;
  args: string[];
  timeoutMs: number;
  name?: string;
  cwd?: string;
  env?: Record<string, string>;
  allowFailure?: boolean;
}

export interface Config {
  version: string;
  planDir: string;
  baseBranch: string;
  branchPrefix: string;
  models: {
    planning: string;
    execution?: string;
  };
  claude: {
    binary: string;
    permissionMode?: string;
    allowedTools?: string[];
    extraSafeArgs?: string[];
  };
  taskTimeoutMs: number;
  verificationCommands: VerificationCommand[];
  maxRetries: number;
  logsDir: string;
  stateDir: string;
  worktreeDir: string;
  commitMessageTemplate: string;
  sessionLimits: {
    showBeforeRun: boolean;
    pauseOnLimit: boolean;
  };
  security: {
    allowedCommands?: string[];
    deniedCommands: string[];
    protectedPaths: string[];
    allowNetwork: boolean;
  };
  notifications?: unknown;
}

/**
 * CLI Arguments
 */
export interface CliArgs {
  config?: string;
  plan?: string;
  task?: string;
  dryRun?: boolean;
  loop?: boolean;
  verbose?: boolean;
}

/**
 * Task Status Definitions
 */
export type TaskStatus = 'NOT_DONE' | 'IN_PROGRESS' | 'DONE' | 'FAILED' | 'BLOCKED';

export const TaskStatusMarkers: Record<TaskStatus, string[]> = {
  NOT_DONE: ['- [ ]', '* [ ]'],
  IN_PROGRESS: ['- [-]', '* [-]'],
  DONE: ['- [x]', '- [X]', '* [x]', '* [X]'],
  FAILED: ['- [f]', '- [F]', '* [f]', '* [F]'],
  BLOCKED: ['- [b]', '- [B]', '* [b]', '* [B]'],
};

export interface TaskState {
  id: string; // stable slug/hash
  status: TaskStatus;
  originalText: string;
  headingContext: string;
}

/**
 * Plan Parsing Results
 */
export interface PlanParseResult {
  planId: string;
  tasks: TaskState[];
}

/**
 * Verification Results (Discriminated Union)
 */
export type VerificationResult =
  | { success: true; durationMs: number; stdoutPath: string; stderrPath: string }
  | {
      success: false;
      durationMs: number;
      errorOutput: string;
      exitCode: number | null;
      stdoutPath: string;
      stderrPath: string;
      command?: string;
    };

/**
 * Execution Summaries
 */
export interface ExecutionSummary {
  taskId: string;
  status: TaskStatus;
  durationMs: number;
  retries: number;
  totalCostUsd?: number;
  usage?: Record<string, number>;
  verificationResult?: VerificationResult;
  commitHash?: string;
  error?: string;
  blockReason?: string;
}

/**
 * Claude Execution Sentinel Results (Discriminated Union)
 */
export type OrchestratorResult =
  | { type: 'SUCCESS'; handoffNotes?: string }
  | { type: 'BLOCKED'; reason: string; handoffNotes?: string }
  | { type: 'NEEDS_RETRY_CONTEXT'; handoffNotes?: string };

export interface ClaudeJSONResponse {
  result: string;
  total_cost_usd?: number;
  usage?: Record<string, number>;
  session_id?: string;
  is_error?: boolean;
}

/**
 * Execution State Storage
 */
export interface ExecutionTaskState {
  id: string; // stable slug/hash
  attempts: number;
  lastStatus: TaskStatus;
  logFilePaths: string[];
  claudeExitCodes: (number | null)[];
  claudeSessionId?: string;
  totalCostUsd?: number;
  usage?: Record<string, number>;
  jsonResponsePaths: string[];
  verificationResults: (VerificationResult | null)[];
  worktreePath?: string;
  commitHash?: string;
  handoffNotes?: string;
  limitResetTime?: string;
  limitMessage?: string;
  lastError?: string;
  lastVerificationError?: string;
  blockReason?: string;
}

export interface PlanState {
  planId: string;
  tasks: Record<string, ExecutionTaskState>;
}
