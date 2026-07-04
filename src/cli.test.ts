import { describe, it, expect } from 'vitest';
import { execa } from 'execa';
import { program } from './cli.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('CLI Help & Entry point', () => {
  it('CLI help can render', () => {
    expect(program.helpInformation()).toContain('Usage: claude-orchestrator');
  });

  it('the package entry point resolves after build', async () => {
    if (!fs.existsSync(path.resolve(process.cwd(), 'dist/cli.js'))) {
      await execa('pnpm', ['run', 'build']);
    }
    const { stdout } = await execa('node', ['./bin/claude-orchestrator.js', '--help'], {
      env: { VITEST: '', NODE_ENV: 'development' },
    });
    expect(stdout).toContain('Usage: claude-orchestrator');
  });
});

describe('CLI Option Rules', () => {
  it('defines global options for config and verbosity', () => {
    const options = program.options.map(o => o.long);
    expect(options).toContain('--config');
    expect(options).toContain('--verbose');
  });

  it('defines allowed options for the run command', () => {
    const runCmd = program.commands.find(c => c.name() === 'run');
    expect(runCmd).toBeDefined();
    const options = runCmd!.options.map(o => o.long);
    expect(options).toContain('--plan');
    expect(options).toContain('--task');
    expect(options).toContain('--loop');
    expect(options).toContain('--dry-run');
    // Ensure dangerous override flags are NOT present
    expect(options).not.toContain('--dangerously-skip-permissions');
    expect(options).not.toContain('--no-validation');
  });

  it('does not include dangerous override flags globally', () => {
    const options = program.options.map(o => o.long);
    expect(options).not.toContain('--dangerously-skip-permissions');
  });
});
