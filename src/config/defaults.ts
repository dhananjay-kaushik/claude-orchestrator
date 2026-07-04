export const defaultConfig = {
  version: '0.1.0',
  planDir: 'workflow_generated_plans',
  baseBranch: 'main',
  branchPrefix: 'claude-',
  taskTimeoutMs: 300000,
  maxRetries: 3,
  logsDir: '.claude-orchestrator/logs',
  stateDir: '.claude-orchestrator/state',
  worktreeDir: '.claude-orchestrator/worktrees'
};
