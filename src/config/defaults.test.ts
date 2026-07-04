import { describe, it, expect } from 'vitest';
import { defaultConfig } from './defaults.js';

describe('Config Defaults', () => {
  it('config defaults can be imported', () => {
    expect(defaultConfig).toBeDefined();
    expect(defaultConfig.maxRetries).toBe(3);
    expect(defaultConfig.logsDir).toBe('.claude-orchestrator/logs');
  });
});
