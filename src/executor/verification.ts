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

    // Create empty log files
    await fs.writeFile(stdoutPath, '');
    await fs.writeFile(stderrPath, '');

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
        process.stdout.write(text);
        fs.appendFile(stdoutPath, text).catch(() => {});
      });

      subprocess.stderr?.on('data', (chunk) => {
        const text = redactSecrets(chunk.toString());
        process.stderr.write(text);
        fs.appendFile(stderrPath, text).catch(() => {});
      });

      const result = await subprocess;
      exitCode = result.exitCode;
      success = true;
    } catch (error: any) {
      exitCode = error.exitCode ?? null;
      success = !!cmd.allowFailure;
      errorOutput = error.shortMessage || error.message || String(error);
    }

    const durationMs = Date.now() - startTime;
    totalDurationMs += durationMs;

    if (!success) {
      return {
        success: false,
        durationMs: totalDurationMs,
        errorOutput,
        exitCode,
        stdoutPath,
        stderrPath,
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
