"""
Enrich one brand: gaps -> one model pass -> independent verification -> write files.

The result is a report (JSON) and a PR body (Markdown); the workflow does the git
side, so ``ofd enrich run --brand X`` on a laptop just edits the working tree for the
developer to inspect with ``git diff``.

Sustainability entries (#768) are verified with the review gate's own checks, written
with today's ``retrieved`` date, and checked again with the validator's sourced-entry
rules after writing. A positive ``recycled_content`` also sets ``traits.recycled`` on
the filament's colours, which the validator requires. The brand's row in
``docs/sustainability-sources.md`` is added or updated whenever sustainability was
researched, found or not.
"""

import copy
import json
import sys
from pathlib import Path

from ofd.brand_claims import CLAIMS_FILE, load_claims
from ofd.enrich import sustainability
from ofd.enrich.gaps import SUSTAINABILITY_FIELDS, Gap, brand_gaps
from ofd.enrich.verify import Fetcher, verify
from ofd.review.checks import MaterialStats
from ofd.review.gitdata import TreeReader
from ofd.review.jsonlines import resolve, set_value
from ofd.review.model import DEFAULT_BUDGET_USD, DEFAULT_MODEL, ModelError, run_model
from ofd.review.suggest import SCHEMAS_DIR, indent_of, render_json, schema_errors
from ofd.review.sustainability import brand_site_names
from ofd.scripts.style_data import build_key_order_map, sort_json_keys
from ofd.validation.data_quality import _check_recycled_trait, _check_sustainability

HERE = Path(__file__).parent
GUIDELINES = HERE / "guidelines.md"
SCHEMA = HERE / "schema.json"
DEFAULT_LIMIT = 30


def log(message: str) -> None:
    print(message, file=sys.stderr)


def claimed_by(root: Path, brand: str) -> list[str]:
    """The brand's representatives, if its manufacturer has claimed it (#808)."""
    try:
        return load_claims(root / CLAIMS_FILE).get(brand, [])
    except (OSError, ValueError):
        return []


def entity_prefix(pointer: str) -> str:
    """The gap pointer a field pointer belongs to: ``/2/gtin`` -> ``/2``,
    ``/sustainability/recycled_content`` -> ``""``."""
    if pointer.startswith("/sustainability/"):
        return ""
    return pointer.rsplit("/", 1)[0]


def field_name(pointer: str) -> str:
    if pointer.startswith("/sustainability/"):
        return "sustainability." + pointer.split("/")[2]
    return pointer.rsplit("/", 1)[-1]


def build_context(brand: str, root: Path, gaps: list[Gap]) -> str:
    brand_data = json.loads((root / "data" / brand / "brand.json").read_text(encoding="utf-8"))
    lines = [
        f"# Brand: {brand_data.get('name', brand)}",
        "",
        f"Website: {brand_data.get('website', 'unknown')}",
        f"Folder: `data/{brand}/`. Stores are in `stores/`.",
        "",
    ]
    if any(f in g.missing for g in gaps for f in SUSTAINABILITY_FIELDS):
        lines += [
            "Sustainability sections are in the gap list: research what this brand "
            "publishes and return `sustainability_log`, even if it is nothing.",
            "",
        ]
    else:
        lines += ["No sustainability research this run: return `sustainability_log: null`.", ""]
    lines += ["## Gaps", ""]
    for gap in gaps:
        current = {k: v for k, v in gap.current.items() if v not in (None, "", [])}
        lines.append(f"### {gap.label}")
        lines.append(f"- path: `{gap.path}`, entity pointer: `{gap.prefix or '(root)'}`")
        if gap.missing:
            lines.append(f"- missing: {', '.join(gap.missing)}")
        if gap.recheck:
            lines.append(f"- recheck (template values): {', '.join(gap.recheck)}")
        if current:
            lines.append(f"- current: `{json.dumps(current, ensure_ascii=False)}`")
        lines.append("")
    return "\n".join(lines)


def _write(file: Path, text: str, doc, kind: str, key_order) -> None:
    """Write ``doc`` over ``file`` (whose current contents are ``text``) in repo style."""
    original = json.loads(text)
    info = key_order.get(kind)
    if info is not None:
        unsorted = json.dumps(original, ensure_ascii=False)
        if json.dumps(sort_json_keys(original, info, set()), ensure_ascii=False) == unsorted:
            doc = sort_json_keys(doc, info, set())
    file.write_text(render_json(doc, indent_of(text), text.endswith("\n")), encoding="utf-8")


def _recycled_pct(filament: dict) -> float | None:
    content = (filament.get("sustainability") or {}).get("recycled_content")
    pct = content.get("pct") if isinstance(content, dict) else None
    return pct if isinstance(pct, (int, float)) and not isinstance(pct, bool) else None


def _set_recycled_traits(root: Path, filament_file: Path, filament: dict, report, key_order):
    """Rule 6: positive recycled content needs ``traits.recycled`` on the colours that
    inherit it. Colours that override ``recycled_content`` themselves are left alone."""
    if not (_recycled_pct(filament) or 0) > 0:
        return
    for variant_file in sorted(filament_file.parent.glob("*/variant.json")):
        text = variant_file.read_text(encoding="utf-8")
        variant = json.loads(text)
        if "recycled_content" in (variant.get("sustainability") or {}):
            continue
        traits = variant.get("traits") if isinstance(variant.get("traits"), dict) else {}
        if traits.get("recycled") is True:
            continue
        variant["traits"] = {**traits, "recycled": True}
        _write(variant_file, text, variant, "variant", key_order)
        report["derived"].append(
            {"path": str(variant_file.relative_to(root)), "pointer": "/traits/recycled"}
        )


def _validator_errors(root: Path, file: Path, doc) -> list[str]:
    """The validator's sustainability errors for a written filament and its colours."""
    found = []
    if file.name == "filament.json":
        found += _check_sustainability(doc, file, root)
        for variant_file in sorted(file.parent.glob("*/variant.json")):
            variant = json.loads(variant_file.read_text(encoding="utf-8"))
            found += _check_recycled_trait(doc, variant, variant_file, root)
    return [e.message for e in found if e.level.value == "ERROR"]


def apply(root: Path, enrichments: list[dict], gaps: list[Gap], report: dict) -> None:
    """Write verified values into the tree, in the repo's JSON style."""
    allowed: dict[str, set[str]] = {}
    for gap in gaps:
        allowed.setdefault(gap.path, set()).update(gap.pointers())
    key_order = build_key_order_map(SCHEMAS_DIR)

    by_path: dict[str, list[dict]] = {}
    for e in enrichments:
        by_path.setdefault(e["path"], []).append(e)

    for path, items in by_path.items():
        file = root / path
        text = file.read_text(encoding="utf-8")
        original = json.loads(text)
        doc = copy.deepcopy(original)
        kind = file.stem
        baseline = schema_errors(doc, kind)
        written: set[str] = set()
        changed = False
        for e in items:
            pointer = e["pointer"]
            if pointer not in allowed.get(path, set()) or pointer in written:
                report["rejected"].append({**e, "reason": "not one of the gaps for this run"})
                continue
            try:
                old = resolve(doc, pointer)
            except (KeyError, IndexError, TypeError):
                old = None
            if old == e["value"]:
                report["confirmed"].append(e)
                written.add(pointer)
                continue
            candidate = copy.deepcopy(doc)
            if pointer.startswith("/sustainability/") and not isinstance(
                candidate.get("sustainability"), dict
            ):
                candidate["sustainability"] = {}
            set_value(candidate, pointer, e["value"])
            new_errors = schema_errors(candidate, kind) - baseline
            if new_errors:
                report["rejected"].append({**e, "reason": f"fails the schema: {min(new_errors)}"})
                continue
            doc = candidate
            written.add(pointer)
            changed = True
            report["applied"].append({**e, "old": old})

        if not changed:
            continue
        _write(file, text, doc, kind, key_order)
        if kind == "filament":
            _set_recycled_traits(root, file, doc, report, key_order)
            # The gate's checks passed; the validator must agree, or nothing is kept.
            problems = _validator_errors(root, file, doc)
            if problems:
                file.write_text(text, encoding="utf-8")
                derived = [
                    d for d in report["derived"] if d["path"].startswith(str(Path(path).parent))
                ]
                for d in derived:
                    report["derived"].remove(d)
                    _unset_recycled(root / d["path"])
                for e in [a for a in report["applied"] if a["path"] == path]:
                    report["applied"].remove(e)
                    report["rejected"].append({**e, "reason": f"validator: {problems[0]}"})


def _unset_recycled(variant_file: Path) -> None:
    text = variant_file.read_text(encoding="utf-8")
    variant = json.loads(text)
    traits = dict(variant.get("traits") or {})
    traits.pop("recycled", None)
    if traits:
        variant["traits"] = traits
    else:
        variant.pop("traits", None)
    variant_file.write_text(
        render_json(variant, indent_of(text), text.endswith("\n")), encoding="utf-8"
    )


def enrich_brand(
    root: Path,
    brand: str,
    limit: int = DEFAULT_LIMIT,
    model: str = DEFAULT_MODEL,
    budget_usd: float = DEFAULT_BUDGET_USD,
    write: bool = True,
    research_sustainability: bool = True,
) -> dict:
    brand_file = root / "data" / brand / "brand.json"
    if not brand_file.exists():
        raise ValueError(f"no brand folder data/{brand}")
    representatives = claimed_by(root, brand)
    stats = MaterialStats(TreeReader(root, "HEAD"))
    gaps = brand_gaps(
        root,
        brand,
        stats,
        limit,
        sustainability=research_sustainability,
        claimed=bool(representatives),
    )
    report: dict = {
        "brand": brand,
        "claimed_by": representatives,
        "gaps": [vars(g) | {"fields": g.fields} for g in gaps],
        "applied": [],
        "confirmed": [],
        "derived": [],
        "unverified": [],
        "rejected": [],
        "not_found": [],
        "sustainability_log": None,
        "model": None,
    }
    log(f"{brand}: {len(gaps)} gaps")
    if not gaps:
        return report

    try:
        result = run_model(
            build_context(brand, root, gaps),
            root,
            model,
            budget_usd,
            guidelines=GUIDELINES,
            schema_file=SCHEMA,
        )
    except ModelError as exc:
        report["model"] = {"error": str(exc)}
        log(f"{brand}: {exc}")
        return report

    report["model"] = {"model": result.model, "cost_usd": result.cost_usd}
    report["not_found"] = result.review.get("not_found", [])
    fetcher = Fetcher()
    site = brand_site_names(json.loads(brand_file.read_text(encoding="utf-8")).get("website"))
    verified = []
    for e in result.review.get("enrichments", []):
        if sustainability.section_of(e["pointer"]):
            reason, warnings = sustainability.verify(e, fetcher, site)
            if warnings:
                e["warnings"] = warnings
        else:
            reason = verify(e, fetcher, root / "stores")
        if reason:
            report["unverified"].append({**e, "reason": reason})
        else:
            verified.append(e)

    if write:
        apply(root, verified, gaps, report)
    else:
        report["applied"] = verified

    researched = any(f in g.missing for g in gaps for f in SUSTAINABILITY_FIELDS)
    found = result.review.get("sustainability_log")
    if researched and isinstance(found, dict):
        written = [e for e in report["applied"] if sustainability.section_of(e["pointer"])]
        summary = found.get("found", "")
        if not written:
            summary = f"Nothing verifiable. {summary}".strip()
        sources = [u for u in found.get("sources", []) if str(u).startswith("https://")]
        report["sustainability_log"] = sustainability.log_row(brand, summary, sources)
        if write:
            sustainability.update_log(root, brand, report["sustainability_log"])
    log(
        f"{brand}: ${result.cost_usd:.2f}, {len(report['applied'])} applied, "
        f"{len(report['confirmed'])} confirmed, {len(report['unverified'])} unverified, "
        f"{len(report['rejected'])} rejected"
    )
    return report


# --- PR body ------------------------------------------------------------------


def _fmt(value) -> str:
    if value is None:
        return "—"
    if isinstance(value, list) and value and isinstance(value[0], dict):
        return "<br>".join(f"{v.get('store_id')}: {v.get('url')}" for v in value)
    return f"`{json.dumps(value, ensure_ascii=False)}`"


def _quote(e: dict) -> str:
    quote = " ".join((e.get("source_quote") or "").split())
    return f"“{quote[:140]}{'…' if len(quote) > 140 else ''}”" if quote else ""


def pr_body(report: dict) -> str:
    labels = {(g["path"], g["prefix"]): g["label"] for g in report["gaps"]}

    def label(e: dict) -> str:
        return labels.get((e["path"], entity_prefix(e["pointer"])), e["path"])

    def field(e: dict) -> str:
        return field_name(e["pointer"])

    lines = [
        f"Automated enrichment of **{report['brand']}**: {len(report['gaps'])} gaps researched.",
        "",
        "Every value below was re-checked by a script, separately from the model: for "
        "numbers, GTINs and article numbers the source was fetched, the quote is on it and "
        "the value is in the quote; datasheet and purchase links were opened and load. "
        "The script can't tell whether a source is about this exact product, so please "
        "spot-check the sources before merging.",
        "",
    ]
    if report.get("claimed_by"):
        reps = ", ".join(f"@{r}" for r in report["claimed_by"])
        lines += [
            f"> **Claimed brand.** {report['brand']} is claimed by its manufacturer, so this "
            f"PR needs a sign-off from {reps} before it can merge. Only empty fields were "
            "researched; their existing values were not re-checked.",
            "",
        ]
    if any(sustainability.section_of(e["pointer"]) for e in report["applied"]):
        lines += [
            "> **Sustainability data.** The `Sustainability sources` check re-verifies "
            "these entries; it must pass, or a maintainer must check them by hand.",
            "",
        ]
    if report["applied"]:
        lines += [
            "## Changes",
            "",
            "| Entity | Field | Was | Now | Source |",
            "|---|---|---|---|---|",
        ]
        for e in report["applied"]:
            secondary = " (secondary)" if e.get("source_type") == "secondary" else ""
            lines.append(
                f"| {label(e)} | `{field(e)}` | {_fmt(e.get('old'))} | {_fmt(e['value'])} | "
                f"[source]({e['source_url']}){secondary} {_quote(e)} |"
            )
        warned = [e for e in report["applied"] if e.get("warnings")]
        if warned:
            lines += ["", "**Check by hand:**", ""]
            lines += [f"- {label(e)} `{field(e)}`: {'; '.join(e['warnings'])}" for e in warned]
        if report.get("derived"):
            lines += [
                "",
                f"`traits.recycled` set on {len(report['derived'])} colour(s), required with "
                "recycled content.",
            ]
        lines.append("")
    if report.get("sustainability_log"):
        lines += [
            "Logged in `docs/sustainability-sources.md`:",
            "",
            "| Brand | Checked | Found | Sources |",
            "|---|---|---|---|",
            report["sustainability_log"],
            "",
        ]
    if report["confirmed"]:
        lines += ["## Confirmed by a source (unchanged)", ""]
        lines += [
            f"- {label(e)} `{field(e)}` = {_fmt(e['value'])}: [source]({e['source_url']})"
            for e in report["confirmed"]
        ]
        lines.append("")
    if report["unverified"] or report["rejected"]:
        lines += [
            "<details><summary>Proposed but not applied "
            f"({len(report['unverified']) + len(report['rejected'])})</summary>",
            "",
        ]
        for e in report["unverified"] + report["rejected"]:
            lines.append(
                f"- {label(e)} `{field(e)}` = {_fmt(e.get('value'))} "
                f"([source]({e.get('source_url')})): {e['reason']}"
            )
        lines += ["", "</details>", ""]
    if report["not_found"]:
        lines += ["<details><summary>Researched, nothing found</summary>", ""]
        lines += [
            f"- `{n['path']}` {', '.join(n['fields'])}: {n['note']}" for n in report["not_found"]
        ]
        lines += ["", "</details>", ""]
    model = report.get("model") or {}
    if model.get("error"):
        lines.append(f"The model pass failed: {model['error']}")
    elif model:
        lines.append(f"<sub>{model['model']} · ${model['cost_usd']:.2f}</sub>")
    return "\n".join(lines) + "\n"
