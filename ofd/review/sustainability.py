"""
The sustainability gate: every sustainability figure a PR touches is checked against
its source before the PR can merge.

Sustainability figures feed CO2 calculations and consumer-facing material, so they
follow stricter rules than the rest of the data (docs/manual.md, "Sustainability
data"). ``ofd validate`` checks what can be checked offline: sources are present and
the number is in the quote. It can't tell whether the quote is really on the cited
page, so this module fetches every source the PR adds or changes and checks:

* the page loads, and the quote is on it, in one piece around the number;
* every number is in the quote, and named standards, verifiers, tools, EPD numbers
  and relative-claim baselines are on the page, never invented;
* nothing in the entry is offset or "carbon neutral" marketing, which the schema has
  no place for and the EU Empowering Consumers Directive bans;
* the qualifiers (``pct_qualifier``, ``source_type``, ``declared_unit``, evidence
  and method) don't contradict the source.

The result is the ``Sustainability sources`` commit status, which fails closed:
anything that couldn't be verified, a missing or failed AI pass, removed
sustainability data and changes to the sustainability rules themselves all fail it.
Only a maintainer's ``sustainability-verified`` label overrides it, and the review
workflow drops that label again on every push that touches sustainability data.
"""

import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import PurePosixPath
from urllib.parse import urlsplit

from ofd.enrich.verify import Fetcher, Page, normalize, number_in, site_name
from ofd.review.gitdata import ChangedFile, TreeReader

STATUS_CONTEXT = "Sustainability sources"
OVERRIDE_LABEL = "sustainability-verified"

# Value fields per sourced section, as in ofd/validation/data_quality.py.
SECTIONS = {
    "recycled_content": ("pct",),
    "bio_based_content": ("pct",),
    "carbon_footprints": ("value_kg_co2e",),
    "relative_claims": ("reduction_pct",),
}
CONTAINER_VALUES = ("recycled_pct",)

# Traits that make an environmental claim about the product.
TRAITS = {
    "recycled",
    "recyclable",
    "biodegradable",
    "home_compostable",
    "industrially_compostable",
    "bio_based",
}

# Changing these changes what the gate or the validator enforces, so a maintainer has
# to look at it.
RULE_PATHS = (
    "schemas/sustainability_schema.json",
    "schemas/material_defaults_schema.json",
    "reference/",
    "ofd/review/sustainability.py",
    "ofd/validation/data_quality.py",
    ".github/workflows/ai_review.yaml",
)

# Claims the manual says never to store (rule 4).
BANNED = re.compile(
    r"\boffset(?:s|ting)?\b|carbon[\s-]?neutral|climate[\s-]?neutral|co2[\s-]?neutral"
    r"|net[\s-]?zero|eco[\s-]?friendly|most sustainable|tree[\s-]?planting|plant(?:ing|s)? (?:a )?trees?"
)

# A fragment around a number must carry enough words to show what the number is.
MIN_CONTEXT = 15
MIN_FRAGMENT = 8


@dataclass
class Entry:
    path: str
    pointer: str
    section: str
    data: dict
    status: str = "new"  # "new", "changed" or "removed"
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def key(self) -> tuple[str, str]:
        return self.path, self.pointer

    def to_dict(self) -> dict:
        return asdict(self)


def entries_in(doc, kind: str) -> list[tuple[str, str, dict]]:
    """``(pointer, section, entry)`` for every sourced entry in one document."""
    found: list[tuple[str, str, dict]] = []
    if kind in ("filament", "variant") and isinstance(doc, dict):
        block = doc.get("sustainability")
        if isinstance(block, dict):
            for section in SECTIONS:
                value = block.get(section)
                if isinstance(value, dict):
                    found.append((f"/sustainability/{section}", section, value))
                elif isinstance(value, list):
                    found += [
                        (f"/sustainability/{section}/{i}", section, item)
                        for i, item in enumerate(value)
                        if isinstance(item, dict)
                    ]
    elif kind == "sizes" and isinstance(doc, list):
        found += [
            (f"/{i}/container_details", "container_details", size["container_details"])
            for i, size in enumerate(doc)
            if isinstance(size, dict) and isinstance(size.get("container_details"), dict)
        ]
    return found


def _traits(doc) -> dict:
    traits = doc.get("traits") if isinstance(doc, dict) else None
    return {k: v for k, v in (traits or {}).items() if k in TRAITS}


@dataclass
class Touch:
    """What a PR does to sustainability data."""

    entries: list[Entry] = field(default_factory=list)  # new and changed
    removed: list[Entry] = field(default_factory=list)
    traits: list[str] = field(default_factory=list)  # "path: trait old -> new"
    rule_paths: list[str] = field(default_factory=list)
    log_changed: bool = False  # docs/sustainability-sources.md

    @property
    def any(self) -> bool:
        return bool(
            self.entries or self.removed or self.traits or self.rule_paths or self.log_changed
        )


def find_touches(changes: list[ChangedFile], all_paths: list[str]) -> Touch:
    touch = Touch()
    for change in changes:
        kind = change.kind
        before = entries_in(change.before, kind)
        after = entries_in(change.after, kind)
        before_data = [data for _, _, data in before]
        after_data = [data for _, _, data in after]
        before_pointers = {pointer for pointer, _, _ in before}

        for pointer, section, data in after:
            if data not in before_data:
                status = "changed" if pointer in before_pointers else "new"
                touch.entries.append(Entry(change.path, pointer, section, data, status))
        for pointer, section, data in before:
            if data not in after_data and not any(
                e.path == change.path and e.pointer == pointer for e in touch.entries
            ):
                touch.removed.append(Entry(change.path, pointer, section, data, "removed"))

        if kind == "variant":
            old, new = _traits(change.before), _traits(change.after)
            for trait in sorted(old.keys() | new.keys()):
                if old.get(trait) != new.get(trait):
                    touch.traits.append(
                        f"`{change.path}`: `{trait}` {old.get(trait)} → {new.get(trait)}"
                    )

    touch.rule_paths = sorted(
        p
        for p in all_paths
        if any(p == r or (r.endswith("/") and p.startswith(r)) for r in RULE_PATHS)
    )
    touch.log_changed = "docs/sustainability-sources.md" in all_paths
    return touch


# --- verification of one entry -------------------------------------------------


def _strings(entry: dict) -> list[tuple[str, str]]:
    return [(k, v) for k, v in entry.items() if isinstance(v, str)] + [
        (k, x) for k, v in entry.items() if isinstance(v, list) for x in v if isinstance(x, str)
    ]


def _fragments(quote: str) -> list[str]:
    return [f.strip() for f in re.split(r"…|\.\.\.|\[\.\.\.\]", normalize(quote)) if f.strip()]


def check_quote(quote: str, values: list, page: Page) -> list[str]:
    """Errors for a quote that isn't on ``page`` the way the entry uses it."""
    fragments = _fragments(quote)
    if not fragments:
        return ["source_quote is empty"]
    errors: list[str] = []
    position = 0
    for fragment in fragments:
        if len(fragment) < MIN_FRAGMENT:
            errors.append(f"quote fragment {fragment!r} is too short to locate on the page")
            continue
        found = page.text.find(fragment, position)
        if found == -1:
            errors.append(f"quote text not found on the source page: “{fragment[:120]}”")
            continue
        position = found + len(fragment)
    for value in values:
        holders = [f for f in fragments if number_in(value, f)]
        if not holders:
            errors.append(f"{value} is not in source_quote")
        elif all(len(f) < MIN_CONTEXT for f in holders):
            errors.append(
                f"the quote around {value} is too short to show what the number refers to"
            )
    return errors


def _on_page(text: str, page: Page) -> bool:
    return normalize(text) in page.text


def verify_entry(entry: Entry, fetcher: Fetcher, brand_site: str | None) -> None:
    """Fill ``entry.errors`` and ``entry.warnings``."""
    data = entry.data
    url = data.get("source_url") or ""
    quote = data.get("source_quote") or ""
    value_fields = (
        CONTAINER_VALUES if entry.section == "container_details" else SECTIONS[entry.section]
    )
    values = [
        data[f]
        for f in value_fields
        if isinstance(data.get(f), (int, float)) and not isinstance(data.get(f), bool)
    ]

    # Rule 4: never store offsets or generic green claims. A quote may mention them
    # (the figure can still be real), but notes and baselines are our own words.
    for key, text in _strings(data):
        hit = BANNED.search(normalize(text))
        if not hit:
            continue
        if key == "source_quote":
            entry.warnings.append(
                f"the quote mentions “{hit.group(0)}”: make sure the figure is not offset-"
                "adjusted or a neutrality claim"
            )
        elif key not in ("source_url",):
            entry.errors.append(f"`{key}` contains “{hit.group(0)}”, which must never be stored")

    if not url.startswith("https://"):
        entry.errors.append("source_url must be an https URL")
        return
    if not quote.strip():
        entry.errors.append("source_quote is missing")
        return

    page = fetcher.get(url)
    if not page.ok:
        entry.errors.append(
            f"could not verify: the source did not load ({page.error}). Check it by hand "
            f"and add the `{OVERRIDE_LABEL}` label if it is right"
        )
        return
    entry.errors += check_quote(quote, values, page)
    q = normalize(quote)

    # Details that, when given, must come from the source (rule 1: never invent).
    for key in (
        "standard",
        "verifier",
        "tool",
        "practitioner",
        "epd_registration_number",
        "baseline",
    ):
        value = data.get(key)
        if isinstance(value, str) and value.strip() and not _on_page(value, page):
            entry.errors.append(f"`{key}` {value!r} is not on the source page")

    evidence = data.get("evidence")
    required_tokens = {
        ("evidence", "iso_14021"): ("14021",),
        ("method", "iso_14067"): ("14067",),
        ("method", "astm_d6866"): ("6866",),
        ("method", "en_16785"): ("16785",),
        ("method", "epd"): ("epd", "environmental product declaration"),
    }
    for (key, value), tokens in required_tokens.items():
        if data.get(key) == value and not any(t in page.text for t in tokens):
            entry.errors.append(
                f"`{key}: {value}` but the source never mentions {tokens[0].upper()}"
            )
    if evidence == "third_party_certified" and not re.search(
        r"\b(grs|rcs|scs|certif|global recycled standard|recycled claim standard)", page.text
    ):
        entry.warnings.append(
            "`evidence: third_party_certified` but the source names no certification"
        )
    if data.get("verification") == "epd_registered" and not data.get("epd_registration_number"):
        entry.warnings.append("`verification: epd_registered` without an `epd_registration_number`")
    if data.get("verification") in ("third_party", "peer_review") and not re.search(
        r"review|verif|certif|audit", page.text
    ):
        entry.warnings.append(
            f"`verification: {data['verification']}` but the source mentions no review"
        )

    qualifier = data.get("pct_qualifier", "exact")
    qualified = re.search(r"\bup to\b|at least|more than|over \d|min(?:imum)?\.? \d|≥|≤", q)
    if values and qualified and qualifier == "exact":
        message = (
            f"the quote qualifies the number (“{qualified.group(0)}”) but the entry stores "
            "it as exact"
        )
        if entry.section in ("recycled_content", "bio_based_content", "container_details"):
            entry.errors.append(message + "; set `pct_qualifier`")
        else:
            entry.warnings.append(message + "; say so in `notes`")
    if qualifier == "up_to" and "up to" not in q:
        entry.warnings.append("`pct_qualifier: up_to` but the quote doesn't say “up to”")

    kind = data.get("type")
    if kind in ("post_industrial", "post_consumer"):
        other = "consumer" if kind == "post_industrial" else "industrial"
        if re.search(rf"post[\s-]?{other}", q):
            entry.errors.append(f"`type: {kind}` but the quote says post-{other}")

    if data.get("declared_unit") == "per_kg_filament" and not re.search(
        r"(?:per|/|each|with|of) ?1? ?(?:kg|kilo)", q
    ):
        entry.warnings.append(
            "`declared_unit: per_kg_filament` but the quote doesn't say “per kg”; use "
            "`unknown` if the source doesn't"
        )

    host_site = site_name((urlsplit(url).hostname or "").lower())
    if brand_site:
        if data.get("source_type") == "primary" and host_site != brand_site:
            entry.warnings.append(
                f"`source_type: primary` but the source is not on the brand's own site ({brand_site})"
            )
        if data.get("source_type") == "secondary" and host_site == brand_site:
            entry.warnings.append("`source_type: secondary` but the source is the brand's own site")


def verify_sourced(
    section: str, data: dict, fetcher: Fetcher, site: str | None
) -> tuple[list[str], list[str]]:
    """``(errors, warnings)`` for one sourced entry, outside a PR.

    ``section`` is a key of ``SECTIONS`` or ``"container_details"``; ``site`` is the
    brand's ``site_name`` (see ``brand_site_name``). Used by ``ofd enrich``.
    """
    entry = Entry("", "", section, data)
    verify_entry(entry, fetcher, site)
    return entry.errors, entry.warnings


MARKETPLACES = {
    "amazon",
    "aliexpress",
    "bestbuy",
    "ebay",
    "facebook",
    "hobbylobby",
    "instagram",
    "jaycar",
    "microcenter",
    "walmart",
}


def brand_site_name(website: str | None) -> str | None:
    if not isinstance(website, str) or not website.strip():
        return None
    website = website.strip()
    # Some brand.json files say "bambulab.com"; without a scheme urlsplit finds no host.
    if "://" not in website:
        website = "https://" + website
    host = (urlsplit(website).hostname or "").lower()
    # A marketplace search or a social page is not the brand's own site.
    if not host or site_name(host) in MARKETPLACES:
        return None
    return site_name(host)


def brand_site(tree: TreeReader, path: str) -> str | None:
    parts = PurePosixPath(path).parts
    if len(parts) < 2 or parts[0] != "data":
        return None
    brand = tree.json(f"data/{parts[1]}/brand.json") or {}
    return brand_site_name(brand.get("website") if isinstance(brand, dict) else None)


def verify_all(touch: Touch, head: TreeReader, fetcher: Fetcher | None = None) -> None:
    fetcher = fetcher or Fetcher()
    for entry in touch.entries:
        verify_entry(entry, fetcher, brand_site(head, entry.path))


# --- the gate -----------------------------------------------------------------


def model_problems(touch: Touch, model: dict | None) -> list[str]:
    """Why the AI pass doesn't count as having checked every touched entry."""
    if not touch.any:
        return []
    if not model:
        return ["the AI review did not run; sustainability changes always need one"]
    if model.get("error"):
        return [f"the AI review failed: {model['error']}"]
    verdict = model.get("sustainability") or {}
    checked = {
        (c.get("path"), c.get("pointer")): c
        for c in verdict.get("checked") or []
        if isinstance(c, dict)
    }
    problems: list[str] = []
    for entry in touch.entries:
        result = checked.get(entry.key)
        if result is None:
            problems.append(f"the AI review did not confirm `{entry.path}` `{entry.pointer}`")
        elif result.get("verdict") != "ok":
            problems.append(
                f"AI: `{entry.path}` `{entry.pointer}`: {result.get('note') or result.get('verdict')}"
            )
    if verdict.get("verdict") not in (None, "ok") and not problems:
        problems.append(f"AI: {verdict.get('summary') or verdict.get('verdict')}")
    for finding in model.get("findings") or []:
        pointer = finding.get("pointer") or ""
        if finding.get("severity") == "error" and (
            "sustainability" in pointer or "container_details" in pointer
        ):
            problems.append(f"AI: `{finding.get('path')}` `{pointer}`: {finding.get('message')}")
    return problems


def gate(touch: Touch, model: dict | None, override: str | None = None) -> dict:
    """``{state, description, failures}`` for the commit status."""
    failures: list[str] = []
    for entry in touch.entries:
        failures += [f"`{entry.path}` `{entry.pointer}`: {e}" for e in entry.errors]
    failures += [
        f"`{e.path}` `{e.pointer}`: sustainability data removed; a maintainer must confirm"
        for e in touch.removed
    ]
    failures += [
        f"`{p}` changes the sustainability rules; a maintainer must review it"
        for p in touch.rule_paths
    ]
    failures += model_problems(touch, model)

    if not touch.any:
        return {"state": "success", "description": "No sustainability data changed", "failures": []}
    if failures and override:
        return {
            "state": "success",
            "description": f"{len(failures)} problem(s) overridden by {override}",
            "failures": failures,
            "override": override,
        }
    if failures:
        noun = "problem" if len(failures) == 1 else "problems"
        return {
            "state": "failure",
            "description": f"{len(failures)} {noun}; see the AI review comment",
            "failures": failures,
        }
    return {
        "state": "success",
        "description": f"{len(touch.entries)} sustainability entr{'y' if len(touch.entries) == 1 else 'ies'} verified against their sources",
        "failures": [],
    }


def context_section(touch: Touch) -> str:
    """The prompt section that makes the model check every touched entry."""
    if not touch.any:
        return ""
    lines = [
        "## Sustainability data (mandatory check)",
        "",
        "This PR touches sustainability data. Follow the sustainability rules in your "
        "instructions and return a verdict for EVERY entry below in `sustainability.checked`, "
        "using exactly the path and pointer shown. Fetch each source_url yourself.",
        "",
    ]
    for entry in touch.entries:
        lines.append(f"### `{entry.path}` `{entry.pointer}` ({entry.status})")
        lines.append(f"```json\n{json.dumps(entry.data, indent=2, ensure_ascii=False)}\n```")
        if entry.errors:
            lines.append("Automatic check errors: " + "; ".join(entry.errors))
        if entry.warnings:
            lines.append("Automatic check warnings: " + "; ".join(entry.warnings))
        lines.append("")
    for entry in touch.removed:
        lines.append(f"- REMOVED: `{entry.path}` `{entry.pointer}`")
    for trait in touch.traits:
        lines.append(f"- Trait change: {trait}")
    for path in touch.rule_paths:
        lines.append(f"- Rule file changed: `{path}`")
    if touch.log_changed:
        lines.append("- `docs/sustainability-sources.md` changed: check the rows match the data")
    return "\n".join(lines) + "\n"
