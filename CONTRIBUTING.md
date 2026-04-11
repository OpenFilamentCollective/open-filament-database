# Contributing (Developer Setup)

This guide is for developers working on the OFD codebase. For adding filament data, see the [main README](README.md).

## Prerequisites

- **uv** — `curl -LsSf https://astral.sh/uv/install.sh | sh` or see [docs.astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/)
- **Node.js 22+**
- **Task** — `brew install go-task` or see [taskfile.dev/installation](https://taskfile.dev/installation/)

## Bootstrap

```sh
task setup   # installs Python deps (uv) + WebUI deps (npm)
```

## Common tasks

```sh
task test        # pytest + Playwright E2E
task lint        # ruff + svelte-check
task serve       # start OFD API server
```

Run `task --list` for the full list.

## Frontend development

No need to install Task just to work on the frontend — npm scripts work directly:

```sh
cd webui
npm run dev        # dev server
npm test           # Playwright E2E tests
npm run check      # svelte-check type checking
npm run build      # production build
```

> **Note:** The frontend currently uses npm directly. If we ever switch to a different package manager (bun, pnpm, etc.), adding a `Taskfile.yml` inside `webui/` would let all tooling and CI use `task` commands, making the package manager an implementation detail that only Taskfile needs to know about.
