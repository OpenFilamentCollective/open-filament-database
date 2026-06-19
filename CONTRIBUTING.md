# Contributing (Developer Setup)

This guide is for developers working on the OFD codebase. For adding filament data, see the [main README](README.md).

## Prerequisites

- **uv** — `curl -LsSf https://astral.sh/uv/install.sh | sh` or see [docs.astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/)
- **Task** — `brew install go-task` or see [taskfile.dev/installation](https://taskfile.dev/installation/)

## Bootstrap

```sh
task setup   # installs Python deps via uv
```

## Common tasks

```sh
task test    # pytest
task lint    # ruff
task check   # lint + test (CI equivalent)
```

Run `task --list` for the full list.

## Pre-commit hooks (optional)

We recommend [prek](https://github.com/j178/prek) — a fast Rust-based drop-in replacement for `pre-commit` that uses the same `.pre-commit-config.yaml` format. Notable adopters: Home Assistant, CPython, Apache Airflow, FastAPI, Ruff, vLLM (Apache Airflow reported 10x speedup over pre-commit).

```sh
uv run prek install
uv run prek install --hook-type commit-msg
```

### Hooks included

| Hook | Stage | What it does |
|------|-------|--------------|
| `end-of-file-fixer` | commit | Ensures files end with a newline |
| `trailing-whitespace` | commit | Removes trailing whitespace |
| `check-merge-conflict` | commit | Catches leftover conflict markers |
| `ruff-check` | commit | Lints Python, auto-fixes where possible |
| `ruff-format` | commit | Formats Python code |
| `committed` | commit-msg | Enforces [Conventional Commits](https://www.conventionalcommits.org) format |
