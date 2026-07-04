import { execa } from 'execa';
import { resolve, isAbsolute } from 'path';
import * as fs from 'fs/promises';
import { Config, VerificationResult } from '../types/index.js';
import { validateVerificationCommand } from './policy.js';

export async function runVerification(
  config: Config,
  taskWorktreePath: string,
  logDir: string
): Promise<VerificationResult | null> {
  if (!config.verificationCommands || config.verificationCommands.length === 0) {
    return null;
  }

  try {
    await fs.mkdir(logDir, { recursive: true });
  } catch {
    // ignore
  }

  let totalDurationMs = 0;
  let lastStdoutPath = '';
  let lastStderrPath = '';

  for (let i = 0; i < config.verificationCommands.length; i++) {
    const cmd = config.verificationCommands[i];
    validateVerificationCommand(config, cmd);

    let cwd = taskWorktreePath;
    if (cmd.cwd) {
      cwd = isAbsolute(cmd.cwd) ? cmd.cwd : resolve(taskWorktreePath, cmd.cwd);
      if (!cwd.startsWith(resolve(taskWorktreePath))) {
        return {
          success: false,
          durationMs: 0,
          errorOutput: `Command cwd ${cwd} escapes task worktree ${taskWorktreePath}`,
          exitCode: 1,
          stdoutPath: '',
          stderrPath: '',
        };
      }
    }

    const stdoutPath = resolve(logDir, `verification_${i}_stdout.log`);
    const stderrPath = resolve(logDir, `verification_${i}_stderr.log`);
    lastStdoutPath = stdoutPath;
    lastStderrPath = stderrPath;

    const timestamp = new Date().toISOString();
    const header = `\n\n--- Verification Command: ${cmd.command} ${cmd.args.join(' ')} at ${timestamp} ---\n`;
    await fs.appendFile(stdoutPath, header);
    await fs.appendFile(stderrPath, header);

    const startTime = Date.now();
    let exitCode: number | null = null;
    let success = false;
    let errorOutput = '';

    try {
      const subprocess = execa(cmd.command, cmd.args, {
        cwd,
        env: { ...process.env, ...cmd.env },
        shell: false,
        timeout: cmd.timeoutMs,
      });

      subprocess.stdout?.on('data', (chunk) => {
        const text = redactSecrets(chunk.toString());
        fs.appendFile(stdoutPath, text).catch(() => {});
      });

      subprocess.stderr?.on('data', (chunk) => {
        const text = redactSecrets(chunk.toString());
        fs.appendFile(stderrPath, text).catch(() => {});
      });

      const result = await subprocess;
      exitCode = result.exitCode ?? null;
      success = true;
    } catch (error: any) {
      exitCode = error.exitCode ?? null;
      success = !!cmd.allowFailure;
      errorOutput = redactSecrets(error.stderr || error.message || String(error));
    }
    const durationMs = Date.now() - startTime;
    const footer = `\n--- Exit Code: ${exitCode}, Duration: ${durationMs}ms ---\n`;
    await fs.appendFile(stdoutPath, footer).catch(() => {});
    await fs.appendFile(stderrPath, footer).catch(() => {});

    totalDurationMs += durationMs;

    if (!success) {
      return {
        success: false,
        durationMs: totalDurationMs,
        errorOutput,
        exitCode,
        stdoutPath,
        stderrPath,
        command: `${cmd.command} ${cmd.args.join(' ')}`.trim(),
      };
    }
  }

  return {
    success: true,
    durationMs: totalDurationMs,
    stdoutPath: lastStdoutPath,
    stderrPath: lastStderrPath,
  };
}

export function redactSecrets(text: string): string {
  // Redact potential secrets.
  let redacted = text;
  redacted = redacted.replace(/((?:password|secret|token|key|api_key|auth)[=:]\s*['"]?)[^\s'"]+(['"]?)/gi, '$1***$2');
  redacted = redacted.replace(/((?:bearer)\s+)[^\s"']+/gi, '$1***');
  return redacted;
}
