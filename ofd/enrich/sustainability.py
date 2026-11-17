"""
Sustainability enrichment (#768): verify proposed entries and keep the sources log.

Proposed entries go through the same checks as the review's ``Sustainability sources``
gate (``ofd.review.sustainability.verify_sourced``), so what enrichment writes is what
the gate would accept. Kept apart from ``verify.py`` because that module is imported
by the review side; importing back from it there would be a cycle.

``retrieved`` is set here to the day of the run. It records when the source was read,
and only the fetch in this run proves that, never the model.
"""

import re
from datetime import date
from pathlib import Path

from ofd.enrich.verify import Fetcher
from ofd.review.sustainability import SECTIONS, verify_sourced

SOURCES_LOG = Path("docs") / "sustainability-sources.md"
_LIST_SECTIONS = {"carbon_footprints", "relative_claims"}


def section_of(pointer: str) -> str | None:
    """``recycled_content`` for ``/sustainability/recycled_content``, else None."""
    parts = pointer.strip("/").split("/")
    if len(parts) == 2 and parts[0] == "sustainability" and parts[1] in SECTIONS:
        return parts[1]
    return None


def verify(
    enrichment: dict, fetcher: Fetcher, site, today: date | None = None
) -> tuple[str | None, list[str]]:
    """``(reason, warnings)``: reason is None when every entry in the value is proven.

    Sets ``retrieved`` on each entry in place.
    """
    section = section_of(enrichment["pointer"])
    value = enrichment["value"]
    if section in _LIST_SECTIONS:
        if not isinstance(value, list) or not value or not all(isinstance(e, dict) for e in value):
            return f"`{section}` must be a non-empty list of entries", []
        entries = value
    else:
        if not isinstance(value, dict):
            return f"`{section}` must be one entry object", []
        entries = [value]

    retrieved = (today or date.today()).isoformat()
    warnings: list[str] = []
    for index, entry in enumerate(entries):
        entry["retrieved"] = retrieved
        errors, entry_warnings = verify_sourced(section, entry, fetcher, site)
        where = f"entry {index + 1}: " if len(entries) > 1 else ""
        if errors:
            return where + errors[0], warnings
        warnings += [where + w for w in entry_warnings]
    return None, warnings


# --- docs/sustainability-sources.md ------------------------------------------

_ROW = re.compile(r"^\| *([a-z0-9+_]+) *\|")


def log_row(brand: str, found: str, sources: list[str], today: date | None = None) -> str:
    cells = [
        brand,
        (today or date.today()).isoformat(),
        " ".join(found.split()).replace("|", "/") or "Nothing published",
        "<br>".join(f"<{u}>" for u in sources) or "—",
    ]
    return "| " + " | ".join(cells) + " |"


def update_log(root: Path, brand: str, row: str) -> None:
    """Add or replace ``brand``'s row in the first table, keeping it sorted by id."""
    path = root / SOURCES_LOG
    lines = path.read_text(encoding="utf-8").splitlines()
    header = next(i for i, line in enumerate(lines) if line.startswith("| Brand | Checked"))
    start = header + 2  # past the |---| separator
    end = start
    while end < len(lines) and lines[end].startswith("|"):
        end += 1
    rows = {m.group(1): line for line in lines[start:end] if (m := _ROW.match(line))}
    rows[brand] = row
    lines[start:end] = [rows[k] for k in sorted(rows)]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
