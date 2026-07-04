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
