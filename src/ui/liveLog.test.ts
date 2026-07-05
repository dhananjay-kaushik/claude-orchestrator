import { describe, it, expect } from 'vitest';
import { createLiveLogController } from './liveLog.js';

describe('createLiveLogController', () => {
  it('handles malformed and well-formed NDJSON lines without throwing', () => {
    const controller = createLiveLogController();
    expect(() => controller.handleLine('not json')).not.toThrow();
    expect(() =>
      controller.handleLine(
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } }),
      ),
    ).not.toThrow();
    expect(() =>
      controller.handleLine(JSON.stringify({ type: 'result', is_error: false })),
    ).not.toThrow();
  });

  it('start/stop are no-ops outside a TTY (as in CI)', () => {
    const controller = createLiveLogController();
    expect(() => controller.start()).not.toThrow();
    expect(() => controller.stop()).not.toThrow();
  });
});
