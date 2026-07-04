import fs from 'node:fs/promises';
import path from 'node:path';
import { Config, PlanState, ExecutionTaskState } from '../types/index.js';

export async function loadPlanState(planId: string, config: Config): Promise<PlanState> {
  const stateDir = path.resolve(process.cwd(), config.stateDir);
  const stateFile = path.join(stateDir, `${planId}.json`);

  try {
    const existing = await fs.readFile(stateFile, 'utf-8');
    return JSON.parse(existing) as PlanState;
  } catch (e: any) {
    if (e.code !== 'ENOENT') {
      console.warn(`Warning: Failed to parse state file for plan ${planId}: ${e.message}`);
    }
    return { planId, tasks: {} };
  }
}

export async function savePlanState(state: PlanState, config: Config): Promise<void> {
  const stateDir = path.resolve(process.cwd(), config.stateDir);
  await fs.mkdir(stateDir, { recursive: true });

  const stateFile = path.join(stateDir, `${state.planId}.json`);
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2), 'utf-8');
}

export function getTaskState(state: PlanState, taskId: string): ExecutionTaskState {
  if (!state.tasks[taskId]) {
    state.tasks[taskId] = {
      id: taskId,
      attempts: 0,
      lastStatus: 'NOT_DONE',
      logFilePaths: [],
      claudeExitCodes: [],
      jsonResponsePaths: [],
      verificationResults: [],
    };
  }
  return state.tasks[taskId];
}
