import { Command } from 'commander';

export const program = new Command();

program
  .name('claude-orchestrator')
  .description('Stateful Workflow Engine on top of Claude Code')
  .version('0.1.0');

program
  .command('init')
  .description('create or update .claude-orchestrator.json interactively')
  .action(() => {
    // To be implemented
  });

program
  .command('doctor')
  .description('check environment, config, Git, and Claude binary')
  .action(() => {
    // To be implemented
  });

program
  .command('validate')
  .description('validate config and plan files without executing Claude')
  .action(() => {
    // To be implemented
  });

program
  .command('plan')
  .description('run interactive planning')
  .action(() => {
    // To be implemented
  });

program
  .command('run')
  .description('execute one selected task by default')
  .option('--loop', 'optional explicit loop mode; never implicit')
  .option('--dry-run', 'show intended execution without mutating state')
  .action(() => {
    // To be implemented
  });

program
  .command('status')
  .description('show selected plan state, active task, and resume command')
  .action(() => {
    // To be implemented
  });

program
  .command('logs')
  .description('show paths to relevant logs')
  .action(() => {
    // To be implemented
  });

program
  .command('resume')
  .description('continue an interrupted or paused task')
  .action(() => {
    // To be implemented
  });

const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST;

if (!isTest) {
  program.parse(process.argv);
}
