import * as readline from 'readline';
import pc from 'picocolors';

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

// Appends lines to stdout while open rather than redrawing every event: clack's
// own log lines (spinners, ●/◆ markers) write to stdout independently, and a
// continuously-redrawn pane desyncs against writes it doesn't control.
// On close, the whole block is erased in one shot instead — safe because
// nothing else writes to stdout between open() and close() for a given toggle.
export function createLiveLogController(): LiveLogController {
  let open = false;
  let linesSinceOpen = 0;
  let keypressHandler: ((str: string, key: readline.Key) => void) | null = null;

  function printLine(line: string) {
    process.stdout.write(`${pc.dim('│')} ${line}\n`);
    linesSinceOpen++;
  }

  function openPane() {
    process.stdout.write(pc.dim(`┌─ live log (press ${TOGGLE_KEY} to hide) ──\n`));
    linesSinceOpen = 1;
  }

  function closePane() {
    // ponytail: can only erase what's still on-screen; anything beyond the
    // terminal's visible height already scrolled into unreachable scrollback.
    const rows = process.stdout.rows || 24;
    const eraseCount = Math.min(linesSinceOpen, rows - 1);
    if (eraseCount > 0) {
      readline.moveCursor(process.stdout, 0, -eraseCount);
      readline.cursorTo(process.stdout, 0);
      readline.clearScreenDown(process.stdout);
    }
    linesSinceOpen = 0;
  }

  return {
    handleLine(raw: string) {
      if (!open) return;
      const line = formatEvent(raw);
      if (!line) return;
      printLine(line);
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
