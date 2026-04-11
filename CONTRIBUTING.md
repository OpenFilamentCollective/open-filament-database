# Contributing (Developer Setup)

This guide is for developers working on the OFD codebase. For adding filament data, see the [main README](README.md).

## Prerequisites

- **uv** — `curl -LsSf https://astral.sh/uv/install.sh | sh` or see [docs.astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/)
- **Node.js 22+**
- **pnpm ≥ 10** — `curl -fsSL https://get.pnpm.io/install.sh | sh -` or `brew install pnpm`
- **Task** — `brew install go-task` or see [taskfile.dev/installation](https://taskfile.dev/installation/)

## Bootstrap

```sh
task setup   # installs Python deps (uv) + WebUI deps (pnpm)
```

## Common tasks

```sh
task test        # pytest + Playwright E2E
task lint        # ruff + svelte-check
task serve       # start OFD API server
```

Run `task --list` for the full list.

## Pre-commit hooks (optional)

Automatically fixes ruff lint and formatting issues on every commit:

```sh
uv tool install prek
prek install
```

## Frontend development

No need to install Task just to work on the frontend — pnpm scripts work directly:

```sh
cd webui
pnpm run dev        # dev server
pnpm run test       # Playwright E2E tests
pnpm run check      # svelte-check type checking
pnpm run build      # production build
```

The project uses **pnpm** (not npm) for its stricter dependency model and disk efficiency.
