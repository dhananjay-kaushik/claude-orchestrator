# Local Install & Test

## Option A: `npm link` (fastest, live-reloads on rebuild)

```bash
npm install
npm run build
npm link              # registers `claude-orchestrator` globally, symlinked to this repo

claude-orchestrator --help
```

Rebuild after changes with `npm run build`; the link picks it up automatically.

Unlink when done:

```bash
npm unlink -g claude-orchestrator
```

## Option B: packed tarball (matches what npm publish would ship)

```bash
npm install
npm run build
npm pack                                  # creates claude-orchestrator-<version>.tgz

mkdir -p /tmp/co-test && cd /tmp/co-test
npm init -y
npm install /path/to/claude-orchestrator/claude-orchestrator-<version>.tgz

npx claude-orchestrator --help
```

This installs exactly what `files` in `package.json` ships (`dist`, `bin`,
`README.md`, `LICENSE`) — use it to catch packaging bugs `npm link` won't
(missing files, wrong `main`/`bin` paths, etc).

## Running the test suite

```bash
npm test          # vitest run
npm run typecheck # tsc --noEmit
```
