import { execa } from 'execa';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadConfig } from '../config/loader.js';
import { isGitRepository } from '../git/repo.js';

export interface DoctorCommandOptions {
  config?: string;
}

export async function runDoctorCommand(options: DoctorCommandOptions): Promise<void> {
  p.intro(pc.bgBlue(pc.white(' Claude Orchestrator: Doctor ')));

  let ok = true;

  const isGit = await isGitRepository();
  if (isGit) {
    p.log.success(pc.green('Git repository detected.'));
  } else {
    ok = false;
    p.log.error(pc.red('Not a Git repository. Run "git init" or "claude-orchestrator run" to initialize one.'));
  }

  let config;
  try {
    config = await loadConfig(options.config);
    p.log.success(pc.green('Config loaded and valid.'));
  } catch (error) {
    ok = false;
    p.log.error(pc.red(`Config invalid: ${error instanceof Error ? error.message : String(error)}`));
  }

  if (config) {
    try {
      await execa(config.claude.binary, ['--version'], { timeout: 5000 });
      p.log.success(pc.green(`Claude binary "${config.claude.binary}" is executable.`));
    } catch (error) {
      ok = false;
      p.log.error(
        pc.red(`Claude binary "${config.claude.binary}" is not runnable: ${error instanceof Error ? error.message : String(error)}`),
      );
    }
  }

  if (ok) {
    p.outro(pc.green('All checks passed.'));
  } else {
    p.outro(pc.red('One or more checks failed.'));
    process.exit(1);
  }
}
