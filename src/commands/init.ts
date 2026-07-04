import * as fs from 'fs/promises';
import * as path from 'path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { defaultConfig } from '../config/defaults.js';

export interface InitCommandOptions {
  config?: string;
}

export async function runInitCommand(options: InitCommandOptions): Promise<void> {
  p.intro(pc.bgBlue(pc.white(' Claude Orchestrator: Init ')));

  const configPath = path.resolve(process.cwd(), options.config || '.claude-orchestrator.json');

  const configExists = await fs
    .access(configPath)
    .then(() => true)
    .catch(() => false);

  if (configExists) {
    p.log.warn(`Config already exists at ${pc.cyan(configPath)}. Leaving it untouched.`);
  } else {
    const planDirResult = await p.text({
      message: 'Where should plan files be stored?',
      initialValue: defaultConfig.planDir,
    });

    if (p.isCancel(planDirResult)) {
      p.cancel('Init cancelled.');
      process.exit(0);
    }

    const config = { ...defaultConfig, planDir: planDirResult as string };
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    p.log.success(`Created config at ${pc.cyan(configPath)}.`);
  }

  const config = configExists
    ? JSON.parse(await fs.readFile(configPath, 'utf8'))
    : { planDir: defaultConfig.planDir };
  const resolvedPlanDir = path.resolve(process.cwd(), config.planDir || defaultConfig.planDir);
  await fs.mkdir(resolvedPlanDir, { recursive: true });
  p.log.success(`Plan directory ready at ${pc.cyan(resolvedPlanDir)}.`);

  p.outro(pc.green(`Run ${pc.cyan('claude-orchestrator plan')} to create your first plan.`));
}
