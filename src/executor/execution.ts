import { execa } from 'execa';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Config, ClaudeJSONResponse, OrchestratorResult } from '../types/index.js';
import { buildClaudeCommand } from './command.js';
import { extractOrchestratorResult } from './parser.js';
import { redactSecrets } from '../logging/redact.js';

export interface ExecutionOutcome {
  success: boolean;
  response?: ClaudeJSONResponse;
  error?: string;
  exitCode?: number | null;
  sentinel?: OrchestratorResult | null;
  sessionLimitReached?: boolean;
  limitResetTime?: string;
  interrupted?: boolean;
}

export interface SessionLimitInfo {
  limitReached: boolean;
  usage?: unknown;
  resetTime?: string;
  message?: string;
}

export async function checkClaudeSessionLimits(config: Config): Promise<SessionLimitInfo> {
  // Attempt to read from Claude status.
  // Claude Code does not yet provide a structured 'status' CLI command,
  // so this is a best-effort preflight that fails gracefully.
  try {
    const result = await execa(config.claude.binary, ['-p', 'status', '--output-format', 'json'], {
      shell: false,
      timeout: 5000,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });

    try {
      const parsed = JSON.parse(result.stdout);

      let limitReached = false;
      let resetTime: string | undefined;
      const msg = parsed.result || '';

      if (msg.match(/limit reached|usage limit/i)) {
        limitReached = true;
        const resetMatch = msg.match(/resets? in ([a-zA-Z0-9 ]+)/i);
        if (resetMatch) {
          resetTime = resetMatch[1].trim();
        }
      }

      return {
        limitReached,
        usage: parsed.usage,
        resetTime,
        message: limitReached ? msg : undefined,
      };
    } catch {
      return { limitReached: false };
    }
  } catch (error: any) {
    let limitReached = false;
    let resetTime: string | undefined;

    const errorMsg = [
      error?.message,
      String(error?.stdout || ''),
      String(error?.stderr || ''),
    ].join(' ');
    if (errorMsg.match(/limit reached|usage limit/i)) {
      limitReached = true;
      const resetMatch = errorMsg.match(/resets? in ([a-zA-Z0-9 ]+)/i);
      if (resetMatch) {
        resetTime = resetMatch[1].trim();
      }
    }

    return {
      limitReached,
      resetTime,
      message: limitReached ? errorMsg : undefined,
    };
  }
}

// stream-json emits one JSON object per line; the object of interest (matching
// the shape of --output-format json) is always the last non-empty line.
function parseFinalJsonLine(stdout: string): ClaudeJSONResponse {
  const lines = stdout.split('\n').filter((l) => l.trim().length > 0);
  return JSON.parse(lines[lines.length - 1] ?? stdout);
}

export async function executeClaudeHeadless(
  config: Config,
  prompt: string,
  logDir: string,
  taskId: string,
  signal?: AbortSignal,
  onStreamLine?: (raw: string) => void,
): Promise<ExecutionOutcome> {
  const { command, args, stdin } = buildClaudeCommand(config, prompt, { stream: !!onStreamLine });

  await fs.mkdir(logDir, { recursive: true });
  const rawLogPath = path.join(logDir, `${taskId}-claude-response.json`);

  try {
    const subprocess = execa(command, args, {
      shell: false,
      timeout: config.taskTimeoutMs,
      input: stdin,
      stdout: 'pipe',
      stderr: 'pipe',
      cancelSignal: signal,
    });

    if (onStreamLine && subprocess.stdout) {
      let pending = '';
      subprocess.stdout.on('data', (chunk: Buffer) => {
        pending += chunk.toString('utf-8');
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) onStreamLine(line);
        }
      });
    }

    const result = await subprocess;

    const timestamp = new Date().toISOString();
    const header = `\n\n--- Claude Execution at ${timestamp} ---\n`;
    const stdoutRedacted = redactSecrets(result.stdout);
    await fs.appendFile(rawLogPath, header + stdoutRedacted + '\n', 'utf-8');
    if (result.stderr) {
      const stderrLogPath = path.join(logDir, `${taskId}-claude-stderr.log`);
      await fs.appendFile(stderrLogPath, header + redactSecrets(result.stderr) + '\n', 'utf-8');
    }

    let parsed: ClaudeJSONResponse;
    try {
      parsed = parseFinalJsonLine(result.stdout);
    } catch (e) {
      return {
        success: false,
        error: 'Malformed JSON response from Claude',
        exitCode: result.exitCode,
      };
    }

    if (parsed.is_error) {
      let sessionLimitReached = false;
      let limitResetTime: string | undefined;
      const errorMsg = parsed.result || '';

      if (errorMsg.match(/limit reached|usage limit/i)) {
        sessionLimitReached = true;
        const resetMatch = errorMsg.match(/resets? in ([a-zA-Z0-9 ]+)/i);
        if (resetMatch) {
          limitResetTime = resetMatch[1].trim();
        }
      }

      return {
        success: false,
        response: parsed,
        error: 'Claude execution returned is_error: true',
        exitCode: result.exitCode,
        sessionLimitReached,
        limitResetTime,
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

    const sentinel = extractOrchestratorResult(parsed.result);
    if (!sentinel) {
      return {
        success: false,
        response: parsed,
        error: 'Missing required ORCHESTRATOR_RESULT sentinel',
        exitCode: result.exitCode,
        sentinel: null,
      };
    }

    return {
      success: true,
      response: parsed,
      exitCode: result.exitCode,
      sentinel,
    };
  } catch (error: any) {
    const timestamp = new Date().toISOString();
    const header = `\n\n--- Claude Execution at ${timestamp} ---\n`;
    if (error.stdout) {
      await fs.appendFile(rawLogPath, header + redactSecrets(String(error.stdout)) + '\n', 'utf-8');
    }
    if (error.stderr) {
      const stderrLogPath = path.join(logDir, `${taskId}-claude-stderr.log`);
      await fs.appendFile(stderrLogPath, header + redactSecrets(String(error.stderr)) + '\n', 'utf-8');
    }

    if (error.isCanceled || error.signal === 'SIGINT') {
      return {
        success: false,
        error: 'Execution interrupted by user',
        exitCode: error.exitCode ?? null,
        interrupted: true,
      };
    }

    let parsed: ClaudeJSONResponse | undefined;
    if (error.stdout) {
      try {
        parsed = parseFinalJsonLine(String(error.stdout));
      } catch (e) {
        // ignore
      }
    }

    let sessionLimitReached = false;
    let limitResetTime: string | undefined;

    const errorMsg = [
      error?.message,
      String(error?.stdout || ''),
      String(error?.stderr || ''),
    ].join(' ');
    if (errorMsg.match(/limit reached|usage limit/i)) {
      sessionLimitReached = true;
      const resetMatch = errorMsg.match(/resets? in ([a-zA-Z0-9 ]+)/i);
      if (resetMatch) {
        limitResetTime = resetMatch[1].trim();
      }
    }

    return {
      success: false,
      response: parsed,
      error: error.message || 'Claude execution failed',
      exitCode: error.exitCode ?? null,
      sessionLimitReached,
      limitResetTime,
    };
  }
}
