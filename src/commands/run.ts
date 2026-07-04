import { loadConfig } from '../config/loader.js';
import { discoverPlan } from '../plans/discovery.js';
import { parsePlan, ValidationError } from '../plans/parser.js';
import fs from 'fs';
import * as p from '@clack/prompts';
import pc from 'picocolors';

export interface RunCommandOptions {
  plan?: string;
  config?: string;
  task?: string;
  loop?: boolean;
  dryRun?: boolean;
}

export async function runCommand(options: RunCommandOptions): Promise<void> {
  p.intro(pc.bgBlue(pc.white(' Claude Orchestrator: Execution Phase ')));

  const config = await loadConfig(options.config);

  let planPath = options.plan;
  if (!planPath) {
    const defaultPlanDir = config.planDir || '.claude-orchestrator/plans';
    const discoveredPlan = await discoverPlan({ planDir: defaultPlanDir });
    
    if (!discoveredPlan) {
      process.exit(0);
    }
    planPath = discoveredPlan;
  }

  p.log.info(`Selected plan: ${pc.cyan(planPath)}`);

  let parsedPlan;
  try {
    const planContent = fs.readFileSync(planPath, 'utf8');
    parsedPlan = parsePlan(planContent, planPath);
    p.log.success(pc.green(`Plan validated successfully: ${parsedPlan.tasks.length} tasks found.`));
  } catch (error) {
    if (error instanceof ValidationError) {
      p.log.error(pc.red(`Plan Validation Failed: ${error.message}`));
      process.exit(1);
    }
    throw error;
  }

  // Rest of execution phase...
  p.outro(pc.yellow('Execution engine not fully implemented yet.'));
}
