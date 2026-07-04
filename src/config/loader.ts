import * as fs from 'fs/promises';
import * as path from 'path';
import { configSchema, ConfigSchemaType } from './schema';
import { defaultConfig } from './defaults';
import { ZodError } from 'zod';

function deepMerge(target: any, source: any): any {
  const output = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] instanceof Object && key in target && !Array.isArray(source[key])) {
      output[key] = deepMerge(target[key], source[key]);
    } else {
      output[key] = source[key];
    }
  }
  return output;
}

export async function loadConfig(configPath: string = '.claude-orchestrator.json'): Promise<ConfigSchemaType> {
  const resolvedPath = path.resolve(process.cwd(), configPath);
  let userConfig = {};

  try {
    const fileContent = await fs.readFile(resolvedPath, 'utf8');
    userConfig = JSON.parse(fileContent);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Failed to read config file at ${resolvedPath}: ${error.message}`);
    }
    // Return defaults if no user config exists
  }

  const mergedConfig = deepMerge(defaultConfig, userConfig);

  try {
    const validatedConfig = configSchema.parse(mergedConfig);

    // Reject protected paths that escape process.cwd()
    for (const protectedPath of validatedConfig.security.protectedPaths) {
      if (protectedPath.startsWith('../') || protectedPath.startsWith('..\\') || path.isAbsolute(protectedPath)) {
        throw new Error(`Protected path "${protectedPath}" escapes process.cwd(). Absolute paths or parent directory traversals are not allowed for security reasons.`);
      }
    }

    return validatedConfig;
  } catch (error: any) {
    if (error instanceof ZodError) {
      const messages = error.issues.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
      throw new Error(`Config validation failed: ${messages}`);
    }
    throw error;
  }
}
