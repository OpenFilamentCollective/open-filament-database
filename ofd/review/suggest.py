"""
Turn the model's proposed values into GitHub ```suggestion``` blocks a maintainer can
commit with one click, after checking each one is safe to offer.

A value survives only if it targets a file the PR changes, comes with an https
source, resolves to a real place in the document and leaves the document as valid
against its schema as it was before. The file is then re-serialised the way the
repo writes JSON (``style_data`` key order, the file's own indent) and diffed against
the head, so a suggestion replaces exactly the lines that change.

GitHub only accepts inline comments on lines inside the PR's diff hunks. A value
whose lines fall outside them, or a file that isn't in canonical form to begin with,
is listed in the summary comment as a snippet instead.
"""

import copy
import difflib
import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import jsonschema
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT7

from ofd.review.gitdata import ChangedFile
from ofd.review.jsonlines import pointer_lines, resolve, set_value
from ofd.review.sustainability import TRAITS as SUSTAINABILITY_TRAITS
from ofd.scripts.style_data import build_key_order_map, sort_json_keys

SCHEMAS_DIR = Path(__file__).resolve().parents[2] / "schemas"


@dataclass
class Suggestion:
    path: str
    start_line: int  # 1-based, inclusive, head side
    end_line: int
    replacement: list[str]
    enrichments: list[dict] = field(default_factory=list)
    # The same lines in the re-serialised document, to match enrichments to hunks.
    new_range: tuple[int, int] = (0, 0)


@dataclass
class Outcome:
    suggestions: list[Suggestion] = field(default_factory=list)
    # Valid values that can't be an inline suggestion: (enrichment, why).
    manual: list[tuple[dict, str]] = field(default_factory=list)
    rejected: list[tuple[dict, str]] = field(default_factory=list)


@lru_cache(maxsize=1)
def _registry() -> tuple[dict[str, dict], Registry]:
    """Every schema, reachable by the ``$ref`` spellings the schemas use.

    ``filament_schema.json`` points at ``./sustainability_schema.json`` (#768), so a
    schema validated on its own can't resolve its references.
    """
    schemas: dict[str, dict] = {}
    resources = []
    for schema_file in sorted(SCHEMAS_DIR.glob("*_schema.json")):
        schema = json.loads(schema_file.read_text(encoding="utf-8"))
        schemas[schema_file.name] = schema
        resource = Resource.from_contents(schema, default_specification=DRAFT7)
        for uri in {schema_file.name, f"./{schema_file.name}", schema.get("$id")} - {None}:
            resources.append((uri, resource))
    return schemas, Registry().with_resources(resources)


def schema_errors(doc, kind: str) -> set[str]:
    schemas, registry = _registry()
    schema = schemas.get(f"{kind}_schema.json")
    if schema is None:
        return set()
    validator = jsonschema.validators.validator_for(schema)(schema, registry=registry)
    return {
        f"{'/'.join(map(str, e.absolute_path))}: {e.message}" for e in validator.iter_errors(doc)
    }


def indent_of(text: str) -> int:
    for line in text.splitlines()[1:]:
        stripped = line.lstrip(" ")
        if stripped and len(stripped) != len(line):
            return len(line) - len(stripped)
    return 2


def render_json(doc, indent: int, trailing_newline: bool) -> str:
    return json.dumps(doc, indent=indent, ensure_ascii=False) + ("\n" if trailing_newline else "")


def _apply(change: ChangedFile, enrichments: list[dict], outcome: Outcome):
    """Apply each valid enrichment in turn; returns the new doc and those applied."""
    doc = copy.deepcopy(change.after)
    baseline_errors = schema_errors(doc, change.kind)
    applied: list[dict] = []
    for enrichment in enrichments:
        if not str(enrichment.get("source_url", "")).startswith("https://"):
            outcome.rejected.append((enrichment, "no https source"))
            continue
        candidate = copy.deepcopy(doc)
        pointer = enrichment["pointer"]
        try:
            try:
                current = resolve(candidate, pointer)
            except (KeyError, IndexError):
                current = None
            if current == enrichment["value"]:
                continue
            set_value(candidate, pointer, enrichment["value"])
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            outcome.rejected.append((enrichment, f"pointer does not resolve ({exc})"))
            continue
        new_errors = schema_errors(candidate, change.kind) - baseline_errors
        if new_errors:
            outcome.rejected.append((enrichment, f"fails the schema: {sorted(new_errors)[0]}"))
            continue
        doc = candidate
        applied.append(enrichment)
    return doc, applied


def build_suggestions(enrichments: list[dict], changes: list[ChangedFile]) -> Outcome:
    outcome = Outcome()
    by_path = {c.path: c for c in changes if c.status != "D" and c.after is not None}
    grouped: dict[str, list[dict]] = {}
    for enrichment in enrichments:
        if enrichment.get("path") not in by_path:
            outcome.rejected.append((enrichment, "not a file this PR adds or changes"))
            continue
        # Sustainability figures are only ever checked here, never proposed: they need a
        # verified quote and go through `ofd enrich` and the sustainability gate.
        pointer = str(enrichment.get("pointer", ""))
        if (
            "sustainability" in pointer
            or "container_details" in pointer
            or ("/traits" in pointer and any(t in pointer for t in SUSTAINABILITY_TRAITS))
        ):
            outcome.rejected.append((enrichment, "sustainability data is never suggested"))
            continue
        # Mechanical values are copied from the data sheet with a quote, never guessed.
        if pointer == "/mechanical" or pointer.startswith("/mechanical/"):
            outcome.rejected.append((enrichment, "mechanical data is never suggested"))
            continue
        grouped.setdefault(enrichment["path"], []).append(enrichment)

    key_order = build_key_order_map(SCHEMAS_DIR)
    for path, items in grouped.items():
        change = by_path[path]
        new_doc, applied = _apply(change, items, outcome)
        if not applied:
            continue

        head_text = change.head_text or ""
        indent = indent_of(head_text)
        trailing = head_text.endswith("\n")
        if render_json(change.after, indent, trailing) != head_text:
            outcome.manual += [(e, "the file isn't in canonical JSON form") for e in applied]
            continue

        info = key_order.get(change.kind)
        if info is not None:
            unsorted = json.dumps(change.after, ensure_ascii=False)
            if (
                json.dumps(sort_json_keys(change.after, info, set()), ensure_ascii=False)
                == unsorted
            ):
                new_doc = sort_json_keys(new_doc, info, set())

        new_text = render_json(new_doc, indent, trailing)
        old_lines, new_lines = head_text.splitlines(), new_text.splitlines()
        new_pointer_lines = pointer_lines(new_text)

        hunks: list[Suggestion] = []
        matcher = difflib.SequenceMatcher(None, old_lines, new_lines, autojunk=False)
        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag == "equal":
                continue
            if i1 == i2:  # pure insertion: anchor on the line before it
                i1, j1 = i1 - 1, j1 - 1
            hunks.append(Suggestion(path, i1 + 1, i2, new_lines[j1:j2], new_range=(j1 + 1, j2)))

        for enrichment in applied:
            line = new_pointer_lines.get(enrichment["pointer"].rstrip("-").rstrip("/"))
            target = next(
                (h for h in hunks if line and h.new_range[0] <= line <= h.new_range[1]),
                hunks[0] if hunks else None,
            )
            if target is not None:
                target.enrichments.append(enrichment)

        for hunk in hunks:
            if not hunk.enrichments:
                continue
            if all(n in change.commentable for n in range(hunk.start_line, hunk.end_line + 1)):
                outcome.suggestions.append(hunk)
            else:
                outcome.manual += [
                    (e, "outside the lines this PR changed") for e in hunk.enrichments
                ]
    return outcome
