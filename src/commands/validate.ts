import * as fs from 'fs/promises';
import * as path from 'path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadConfig } from '../config/loader.js';
import { parsePlan, ValidationError } from '../plans/parser.js';

export interface ValidateCommandOptions {
  config?: string;
  plan?: string;
}

export async function runValidateCommand(options: ValidateCommandOptions): Promise<void> {
  p.intro(pc.bgBlue(pc.white(' Claude Orchestrator: Validate ')));

  let config;
  try {
    config = await loadConfig(options.config);
    p.log.success(pc.green('Config is valid.'));
  } catch (error) {
    p.log.error(pc.red(`Config invalid: ${error instanceof Error ? error.message : String(error)}`));
    p.outro(pc.red('Validation failed.'));
    process.exit(1);
  }

  let planPaths: string[];
  if (options.plan) {
    planPaths = [options.plan];
  } else {
    const planDir = path.resolve(process.cwd(), config.planDir);
    try {
      const entries = await fs.readdir(planDir, { withFileTypes: true });
      planPaths = entries
        .filter((e) => e.isFile() && e.name.endsWith('.md'))
        .map((e) => path.join(planDir, e.name));
    } catch {
      p.log.warn(pc.yellow(`No plan directory found at ${planDir}.`));
      p.outro(pc.green('Config valid. No plans to check.'));
      return;
    }
  }

  let ok = true;
  for (const planPath of planPaths) {
    try {
      const content = await fs.readFile(planPath, 'utf8');
      const planId = path.basename(planPath, path.extname(planPath));
      const parsed = parsePlan(content, planId);
      p.log.success(pc.green(`${planPath}: valid (${parsed.tasks.length} tasks).`));
    } catch (error) {
      ok = false;
      const message = error instanceof ValidationError ? error.message : error instanceof Error ? error.message : String(error);
      p.log.error(pc.red(`${planPath}: ${message}`));
    }
  }

  if (ok) {
    p.outro(pc.green('All plans valid.'));
  } else {
    p.outro(pc.red('One or more plans failed validation.'));
    process.exit(1);
  }
}
