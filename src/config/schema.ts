import { z } from 'zod';

export const verificationCommandSchema = z.object({
  command: z.string().min(1, 'Command must be a non-empty string'),
  args: z.array(z.string()),
  timeoutMs: z.number().int().positive('Timeout must be a positive integer'),
  name: z.string().optional(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  allowFailure: z.boolean().optional()
});

export const configSchema = z.object({
  version: z.string(),
  planDir: z.string(),
  baseBranch: z.string(),
  branchPrefix: z.string(),
  models: z.object({
    planning: z.string(),
    execution: z.string().optional()
  }),
  claude: z.object({
    binary: z.string(),
    permissionMode: z.string().optional(),
    allowedTools: z.array(z.string()).optional(),
    extraSafeArgs: z.array(z.string()).optional()
  }),
  taskTimeoutMs: z.number().int().positive(),
  verificationCommands: z.array(verificationCommandSchema),
  maxRetries: z.number().int().min(0),
  logsDir: z.string(),
  stateDir: z.string(),
  worktreeDir: z.string(),
  commitMessageTemplate: z.string(),
  sessionLimits: z.object({
    showBeforeRun: z.boolean(),
    pauseOnLimit: z.boolean()
  }),
  security: z.object({
    allowedCommands: z.array(z.string()).optional(),
    deniedCommands: z.array(z.string()),
    protectedPaths: z.array(z.string()),
    allowNetwork: z.boolean()
  }),
  notifications: z.unknown().optional()
});

export type ConfigSchemaType = z.infer<typeof configSchema>;
export type VerificationCommandSchemaType = z.infer<typeof verificationCommandSchema>;
