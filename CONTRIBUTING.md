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

Automatically fixes ruff lint and formatting issues on every commit. We recommend [prek](https://github.com/j178/prek) — a fast Rust-based drop-in replacement for `pre-commit` that uses the same `.pre-commit-config.yaml` format.

```sh
uv run prek install
```

Notable projects that have adopted prek: Home Assistant, CPython, Apache Airflow, FastAPI, Ruff, vLLM. Apache Airflow reported a 10x speedup (18s vs 187s) over pre-commit.
