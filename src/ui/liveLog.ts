import * as readline from 'readline';
import pc from 'picocolors';

const MAX_LINES = 15;
const TOGGLE_KEY = 'l';

export interface LiveLogController {
  /** Feed one raw NDJSON line from the Claude stream. */
  handleLine(raw: string): void;
  /** Attach the keypress listener (no-op if stdin isn't a TTY). */
  start(): void;
  /** Detach the listener and restore the terminal. */
  stop(): void;
}

function formatEvent(raw: string): string | null {
  let evt: any;
  try {
    evt = JSON.parse(raw);
  } catch {
    return null;
  }

  if (evt.type === 'assistant') {
    for (const block of evt.message?.content ?? []) {
      if (block.type === 'text' && block.text?.trim()) {
        return `assistant: ${block.text.trim().replace(/\s+/g, ' ').slice(0, 200)}`;
      }
      if (block.type === 'tool_use') {
        return `tool: ${block.name}`;
      }
    }
    return null;
  }
  if (evt.type === 'result') {
    return evt.is_error ? pc.red('done: error') : pc.green('done: success');
  }
  return null;
}

export function createLiveLogController(): LiveLogController {
  const buffer: string[] = [];
  let open = false;
  let rendered = 0;
  let keypressHandler: ((str: string, key: readline.Key) => void) | null = null;

  function clearPane() {
    if (rendered > 0) {
      readline.moveCursor(process.stdout, 0, -rendered);
      readline.cursorTo(process.stdout, 0);
      readline.clearScreenDown(process.stdout);
    }
    rendered = 0;
  }

  function redraw() {
    clearPane();
    const lines = buffer.slice(-MAX_LINES);
    const out = [
      pc.dim(`── live log (press ${TOGGLE_KEY} to hide) ──`),
      ...(lines.length ? lines : [pc.dim('(waiting for output...)')]),
      pc.dim('──'),
    ];
    process.stdout.write(out.join('\n') + '\n');
    rendered = out.length;
  }

  return {
    handleLine(raw: string) {
      const line = formatEvent(raw);
      if (line) buffer.push(line);
      if (open) redraw();
    },

    start() {
      if (!process.stdin.isTTY) return;
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
      keypressHandler = (str, key) => {
        if (key?.ctrl && key.name === 'c') {
          process.emit('SIGINT');
          return;
        }
        if (str === TOGGLE_KEY) {
          open = !open;
          if (open) redraw();
          else clearPane();
        }
      };
      process.stdin.on('keypress', keypressHandler);
      process.stdin.resume();
    },

    stop() {
      if (!process.stdin.isTTY) return;
      clearPane();
      if (keypressHandler) process.stdin.off('keypress', keypressHandler);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    },
  };
}
