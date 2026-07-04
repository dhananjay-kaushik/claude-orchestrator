import * as fs from 'fs/promises';
import * as path from 'path';
import * as p from '@clack/prompts';
import pc from 'picocolors';

export interface PlanDiscoveryOptions {
  planDir: string;
}

export async function discoverPlan(options: PlanDiscoveryOptions): Promise<string | null> {
  const resolvedPlanDir = path.resolve(process.cwd(), options.planDir);

  let files: string[];
  try {
    const dirEntries = await fs.readdir(resolvedPlanDir, { withFileTypes: true });
    files = dirEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => entry.name);
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'ENOENT'
    ) {
      p.log.warn(`Plan directory ${resolvedPlanDir} does not exist.`);
      p.log.info(`Run ${pc.cyan('claude-orchestrator plan')} to create a plan.`);
      return null;
    }
    throw new Error(
      `Failed to read plan directory: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  if (files.length === 0) {
    p.log.warn(`No Markdown plans found in ${resolvedPlanDir}.`);
    p.log.info(`Run ${pc.cyan('claude-orchestrator plan')} to create a plan.`);
    return null;
  }

  // Get file stats for metadata
  const fileChoices = await Promise.all(
    files.map(async (file) => {
      const fullPath = path.join(resolvedPlanDir, file);
      const stats = await fs.stat(fullPath);
      return {
        value: fullPath,
        label: file,
        hint: `Last modified: ${stats.mtime.toLocaleString()}`,
      };
    }),
  );

  // Sort by modification time, newest first
  fileChoices.sort((a, b) => {
    return (
      new Date(b.hint.replace('Last modified: ', '')).getTime() -
      new Date(a.hint.replace('Last modified: ', '')).getTime()
    );
  });

  const selectedPlan = await p.select({
    message: 'Select a plan to execute:',
    options: fileChoices,
  });

  if (p.isCancel(selectedPlan)) {
    p.cancel('Plan selection cancelled.');
    return null;
  }

  return selectedPlan as string;
}
