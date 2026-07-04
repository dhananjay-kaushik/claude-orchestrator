import * as fs from 'fs';
import * as path from 'path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadConfig } from '../config/loader.js';
import { discoverPlan } from '../plans/discovery.js';

export interface LogsCommandOptions {
  config?: string;
  plan?: string;
  task?: string;
}

export async function runLogsCommand(options: LogsCommandOptions): Promise<void> {
  p.intro(pc.bgBlue(pc.white(' Claude Orchestrator: Logs ')));

  const config = await loadConfig(options.config);

  let planPath = options.plan;
  if (!planPath) {
    const defaultPlanDir = config.planDir || '.claude-orchestrator/plans';
    planPath = (await discoverPlan({ planDir: defaultPlanDir })) || undefined;
    if (!planPath) {
      process.exit(0);
    }
  }

  const planId = path.basename(planPath, path.extname(planPath));
  const logsDir = config.logsDir || '.claude-orchestrator/logs';
  const stateDir = config.stateDir || '.claude-orchestrator/state';
  const planLogDir = path.join(logsDir, planId);
  const stateFile = path.join(stateDir, `${planId}.json`);

  p.log.info(pc.blue('--- Log Locations ---'));
  p.log.info(`State File:      ${stateFile}${fs.existsSync(stateFile) ? '' : pc.yellow(' (not found)')}`);

  if (options.task) {
    const taskLogDir = path.join(planLogDir, options.task);
    p.log.info(`Task Log Dir:    ${taskLogDir}${fs.existsSync(taskLogDir) ? '' : pc.yellow(' (not found)')}`);
    if (fs.existsSync(taskLogDir)) {
      for (const file of fs.readdirSync(taskLogDir)) {
        p.log.info(`  - ${path.join(taskLogDir, file)}`);
      }
    }
  } else {
    p.log.info(`Plan Log Dir:    ${planLogDir}${fs.existsSync(planLogDir) ? '' : pc.yellow(' (not found)')}`);
    if (fs.existsSync(planLogDir)) {
      for (const taskId of fs.readdirSync(planLogDir)) {
        p.log.info(`  - ${path.join(planLogDir, taskId)}`);
      }
    }
  }

  p.outro(pc.green('Done.'));
}
