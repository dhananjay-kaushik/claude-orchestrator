import * as readline from 'readline';
import pc from 'picocolors';

const TOGGLE_KEY = 'l';
const CATCHUP_LINES = 5;

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
        const text = block.text.trim().replace(/\s+/g, ' ').slice(0, 200);
        return `${pc.cyan('assistant')} ${text}`;
      }
      if (block.type === 'tool_use') {
        return `${pc.yellow('tool')}      ${pc.bold(block.name)}`;
      }
    }
    return null;
  }
  if (evt.type === 'result') {
    return evt.is_error ? pc.red('✗ done (error)') : pc.green('✓ done');
  }
  return null;
}

// Appends lines to stdout rather than redrawing a fixed pane in place: clack's
// own log lines (spinners, ●/◆ markers) write to stdout independently, and
// cursor-based erase/redraw desyncs against writes it doesn't control.
export function createLiveLogController(): LiveLogController {
  const buffer: string[] = [];
  let open = false;
  let keypressHandler: ((str: string, key: readline.Key) => void) | null = null;

  function printLine(line: string) {
    process.stdout.write(`${pc.dim('│')} ${line}\n`);
  }

  function openPane() {
    process.stdout.write(pc.dim(`┌─ live log (press ${TOGGLE_KEY} to hide) ──\n`));
    for (const line of buffer.slice(-CATCHUP_LINES)) printLine(line);
  }

  function closePane() {
    process.stdout.write(pc.dim(`└─ live log hidden (press ${TOGGLE_KEY} to view) ──\n`));
  }

  return {
    handleLine(raw: string) {
      const line = formatEvent(raw);
      if (!line) return;
      buffer.push(line);
      if (open) printLine(line);
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
          if (open) openPane();
          else closePane();
        }
      };
      process.stdin.on('keypress', keypressHandler);
      process.stdin.resume();
    },

    stop() {
      if (!process.stdin.isTTY) return;
      if (keypressHandler) process.stdin.off('keypress', keypressHandler);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    },
  };
}
