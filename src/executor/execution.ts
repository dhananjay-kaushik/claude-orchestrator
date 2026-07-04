import { execa } from 'execa';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config, ClaudeJSONResponse } from '../types/index.js';
import { buildClaudeCommand } from './command.js';

export interface ExecutionOutcome {
  success: boolean;
  response?: ClaudeJSONResponse;
  error?: string;
  exitCode?: number | null;
}

export async function executeClaudeHeadless(
  config: Config,
  prompt: string,
  logDir: string,
  taskId: string
): Promise<ExecutionOutcome> {
  const { command, args } = buildClaudeCommand(config, prompt);

  await fs.mkdir(logDir, { recursive: true });
  const rawLogPath = path.join(logDir, `${taskId}-claude-response.json`);

  try {
    const result = await execa(command, args, {
      shell: false,
      timeout: config.taskTimeoutMs,
      stdio: 'pipe',
    });

    await fs.writeFile(rawLogPath, result.stdout, 'utf-8');

    let parsed: ClaudeJSONResponse;
    try {
      parsed = JSON.parse(result.stdout);
    } catch (e) {
      return {
        success: false,
        error: 'Malformed JSON response from Claude',
        exitCode: result.exitCode,
      };
    }

    if (parsed.is_error) {
      return {
        success: false,
        response: parsed,
        error: 'Claude execution returned is_error: true',
        exitCode: result.exitCode,
      };
    }

    if (!parsed.result) {
      return {
        success: false,
        response: parsed,
        error: 'Claude execution missing required result field',
        exitCode: result.exitCode,
      };
    }

    return {
      success: true,
      response: parsed,
      exitCode: result.exitCode,
    };
  } catch (error: any) {
    if (error.stdout) {
      await fs.writeFile(rawLogPath, String(error.stdout), 'utf-8');
    }

    let parsed: ClaudeJSONResponse | undefined;
    if (error.stdout) {
      try {
        parsed = JSON.parse(String(error.stdout));
      } catch (e) {
        // ignore
      }
    }

    return {
      success: false,
      response: parsed,
      error: error.message || 'Claude execution failed',
      exitCode: error.exitCode ?? null,
    };
  }
}
