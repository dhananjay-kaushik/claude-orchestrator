import { Command } from 'commander';

export const program = new Command();

program
  .name('claude-orchestrator')
  .description('Stateful Workflow Engine on top of Claude Code')
  .version('0.1.0');

const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST;

if (!isTest) {
  program.parse(process.argv);
}
