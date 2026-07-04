# Local Install & Test

## Option A: `pnpm link` (fastest, live-reloads on rebuild)

```bash
pnpm install
pnpm run build
pnpm link              # registers `claude-orchestrator` globally, symlinked to this repo

claude-orchestrator --help
```

Rebuild after changes with `pnpm run build`; the link picks it up automatically.

Unlink when done:

```bash
pnpm unlink -g claude-orchestrator
```

## Option B: packed tarball (matches what pnpm publish would ship)

```bash
pnpm install
pnpm run build
pnpm pack                                  # creates claude-orchestrator-<version>.tgz

mkdir -p /tmp/co-test && cd /tmp/co-test
pnpm init -y
pnpm install /path/to/claude-orchestrator/claude-orchestrator-<version>.tgz

npx claude-orchestrator --help
```

This installs exactly what `files` in `package.json` ships (`dist`, `bin`,
`README.md`, `LICENSE`) — use it to catch packaging bugs `pnpm link` won't
(missing files, wrong `main`/`bin` paths, etc).

## Running the test suite

```bash
pnpm test          # vitest run
pnpm run typecheck # tsc --noEmit
```
