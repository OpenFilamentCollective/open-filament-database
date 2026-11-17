"""
The one model pass: Claude Code in print mode, read-only, schema-enforced output.

``--restricted`` drops every tool that runs code and ignores settings files, and
``--tools`` narrows what is left to reading the checkout and the web. The answer is
validated against ``schema.json`` again here; the CLI's own enforcement is not the
only gate between the model and a PR comment.
"""

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import jsonschema

HERE = Path(__file__).parent
GUIDELINES = HERE / "guidelines.md"
SCHEMA = HERE / "schema.json"

DEFAULT_MODEL = os.environ.get("OFD_REVIEW_MODEL", "claude-haiku-5-5")
DEFAULT_BUDGET_USD = float(os.environ.get("OFD_REVIEW_BUDGET_USD", "2"))
TOOLS = "Read,Glob,Grep,WebSearch,WebFetch"
TIMEOUT_SECONDS = 20 * 60


class ModelError(RuntimeError):
    pass


@dataclass
class ModelResult:
    review: dict
    cost_usd: float
    model: str


def available() -> bool:
    """The CLI is installed. Credentials are its business (env key or a local login)."""
    return shutil.which("claude") is not None


def run_model(
    context: str,
    cwd: Path,
    model: str = DEFAULT_MODEL,
    budget_usd: float = DEFAULT_BUDGET_USD,
    guidelines: Path = GUIDELINES,
    schema_file: Path = SCHEMA,
) -> ModelResult:
    """One print-mode run; ``guidelines``/``schema_file`` let ``ofd enrich`` reuse it."""
    schema = json.loads(schema_file.read_text())
    cmd = [
        "claude",
        "-p",
        "--restricted",
        "--strict-mcp-config",
        "--tools",
        TOOLS,
        "--allowedTools",
        TOOLS,
        "--system-prompt-file",
        str(guidelines),
        "--json-schema",
        json.dumps(schema),
        "--max-budget-usd",
        str(budget_usd),
        "--model",
        model,
        "--output-format",
        "json",
    ]
    try:
        proc = subprocess.run(
            cmd, cwd=cwd, input=context, capture_output=True, text=True, timeout=TIMEOUT_SECONDS
        )
    except subprocess.TimeoutExpired as exc:
        raise ModelError(f"model pass timed out after {TIMEOUT_SECONDS}s") from exc

    try:
        out = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise ModelError(f"claude exited {proc.returncode}: {proc.stderr.strip()[:500]}") from exc

    cost = float(out.get("total_cost_usd") or 0)
    if out.get("is_error") or out.get("subtype") != "success":
        raise ModelError(
            f"model pass failed ({out.get('subtype')}, ${cost:.2f}): {out.get('result')}"
        )

    review = out.get("structured_output")
    if review is None:
        try:
            review = json.loads(out.get("result") or "")
        except json.JSONDecodeError as exc:
            raise ModelError("model returned no structured output") from exc
    try:
        jsonschema.validate(review, schema)
    except jsonschema.ValidationError as exc:
        raise ModelError(f"model output does not match {schema_file.name}: {exc.message}") from exc
    return ModelResult(review=review, cost_usd=cost, model=model)
