export const defaultConfig = {
  version: '0.1.0',
  planDir: 'workflow_generated_plans',
  baseBranch: 'main',
  branchPrefix: 'claude-',
  models: {
    planning: 'claude-3-5-sonnet-20241022',
  },
  claude: {
    binary: 'claude',
    // ponytail: acceptEdits lets headless tasks actually write files; without it
    // Claude's default permission mode blocks Write/Edit waiting for interactive
    // approval that never comes, and the task gets marked BLOCKED.
    permissionMode: 'acceptEdits',
    // ponytail: acceptEdits only covers Write/Edit, not Bash — without these,
    // the commit step (git add/commit) hits the same never-answered approval
    // gate and the task gets marked BLOCKED.
    allowedTools: ['Bash(git add:*)', 'Bash(git commit:*)'],
  },
  taskTimeoutMs: 300000,
  verificationCommands: [],
  maxRetries: 3,
  logsDir: '.claude-orchestrator/logs',
  stateDir: '.claude-orchestrator/state',
  worktreeDir: '.claude-orchestrator/worktrees',
  commitMessageTemplate: 'chore: complete task from plan',
  sessionLimits: {
    showBeforeRun: true,
    pauseOnLimit: true,
  },
  security: {
    deniedCommands: ['rm', 'git reset', 'git clean', 'git push', 'git branch -D'],
    protectedPaths: ['.env', '.env.local', 'secrets', 'credentials', '.git'],
    allowNetwork: false,
  },
};
