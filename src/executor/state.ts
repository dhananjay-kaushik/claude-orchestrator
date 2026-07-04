import fs from 'node:fs/promises';
import path from 'node:path';
import { Config, OrchestratorResult } from '../types/index.js';

export async function saveTaskExecutionResult(
  config: Config,
  planId: string,
  taskId: string,
  rawJson: string,
  sentinel: OrchestratorResult | null,
): Promise<void> {
  const stateDir = path.resolve(process.cwd(), config.stateDir, planId);
  await fs.mkdir(stateDir, { recursive: true });

  const stateFile = path.join(stateDir, `${taskId}.json`);

  // Try to load existing state if it exists, to not overwrite other fields
  let state: any = {};
  try {
    const existing = await fs.readFile(stateFile, 'utf-8');
    state = JSON.parse(existing);
  } catch (e) {
    // File might not exist or be corrupt, start fresh
  }

  state.rawJson = rawJson;
  state.sentinel = sentinel;
  state.timestamp = new Date().toISOString();

  await fs.writeFile(stateFile, JSON.stringify(state, null, 2), 'utf-8');
}
