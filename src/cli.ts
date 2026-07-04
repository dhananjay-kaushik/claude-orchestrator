import { Command } from 'commander';

export const program = new Command();

program
  .name('claude-orchestrator')
  .description('Stateful Workflow Engine on top of Claude Code')
  .version('0.1.0')
  .option('-c, --config <path>', 'path to config file')
  .option('-v, --verbose', 'enable verbose logging');

import { runInitCommand } from './commands/init.js';

program
  .command('init')
  .description('create or update .claude-orchestrator.json interactively')
  .action(async () => {
    const parentOpts = program.opts();
    await runInitCommand({ config: parentOpts.config });
  });

import { runDoctorCommand } from './commands/doctor.js';
import { runValidateCommand } from './commands/validate.js';

program
  .command('doctor')
  .description('check environment, config, Git, and Claude binary')
  .action(async () => {
    const parentOpts = program.opts();
    await runDoctorCommand({ config: parentOpts.config });
  });

program
  .command('validate')
  .description('validate config and plan files without executing Claude')
  .option('--plan <path>', 'path to a specific plan file')
  .action(async (options) => {
    const parentOpts = program.opts();
    await runValidateCommand({ ...options, config: parentOpts.config });
  });

import { runPlanCommand } from './commands/plan.js';
import { runCommand } from './commands/run.js';

program
  .command('plan')
  .description('run interactive planning')
  .option('--plan <path>', 'path to a specific plan file')
  .action(async (options) => {
    const parentOpts = program.opts();
    await runPlanCommand({ ...options, config: parentOpts.config });
  });

program
  .command('run')
  .description('execute one selected task by default')
  .option('--plan <path>', 'path to a specific plan file')
  .option('--task <id>', 'stable ID of a specific task to run')
  .option('--loop', 'optional explicit loop mode; never implicit')
  .option('--yes', 'auto-confirm prompts (e.g. commit with no verification configured) for unattended runs')
  .option('--dry-run', 'show intended execution without mutating state')
  .action(async (options) => {
    const parentOpts = program.opts();
    await runCommand({ ...options, config: parentOpts.config });
  });

import { runStatusCommand } from './commands/status.js';
import { runLogsCommand } from './commands/logs.js';

program
  .command('status')
  .description('show selected plan state, active task, and resume command')
  .option('--plan <path>', 'path to a specific plan file')
  .option('--task <id>', 'stable ID of a specific task')
  .action(async (options) => {
    const parentOpts = program.opts();
    await runStatusCommand({ ...options, config: parentOpts.config });
  });

program
  .command('logs')
  .description('show paths to relevant logs')
  .option('--plan <path>', 'path to a specific plan file')
  .option('--task <id>', 'stable ID of a specific task')
  .action(async (options) => {
    const parentOpts = program.opts();
    await runLogsCommand({ ...options, config: parentOpts.config });
  });

const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST;

if (!isTest) {
  program.parse(process.argv);
}
