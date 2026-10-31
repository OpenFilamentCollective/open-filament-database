"""
Proof that a PR's values are right: the gate auto-merge depends on.

The model proposes, for each value a PR adds or changes, a page and a verbatim quote.
Nothing here trusts that: a proof counts only when this script fetches the page
itself and finds it on the brand's own site, about this exact product, with the
quote on it and the value in the quote, at the right end of any range.

Only fields with a rule in ``RULES`` can be proven at all. Changes to anything else
in an existing file (names, ids, colours, traits, density, purchase links,
sustainability, removals, anything structural) need a maintainer, so a PR touching
them never auto-merges. That table is deliberately the only way to widen which
*changes* can merge unseen.

New data has a lower bar: a whole new file, or a spool row appended to an existing
list, is ``NEW``. It has nothing to contradict, so the validators and the AI review
judge it instead of a proof (see ``ofd.automerge.eligibility``).
"""

import re
from dataclasses import asdict, dataclass, field
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

from ofd.enrich import verify as rules
from ofd.enrich.verify import normalize, number_in, quote_on_page, site_name
from ofd.review.gitdata import ChangedFile, TreeReader
from ofd.review.jsonlines import escape
from ofd.review.sustainability import brand_site_name

# (file kind) -> {field: product anchor}. A field not listed here is never provable.
RULES: dict[str, dict[str, str]] = {
    "filament": dict.fromkeys(
        (
            "min_print_temperature",
            "max_print_temperature",
            "min_bed_temperature",
            "max_bed_temperature",
            "max_dry_temperature",
            "dry_temperature",
            "dry_time",
            "max_volumetric_speed",
            "min_fan_speed",
            "max_fan_speed",
            "enclosure",
            "data_sheet_url",
            "safety_sheet_url",
        ),
        "filament",
    ),
    "variant": {"transmission_distance": "variant"},
    "sizes": {"gtin": "variant", "article_number": "variant"},
}

SHEETS = {"data_sheet_url", "safety_sheet_url"}

# Brand-domain pages written by users, not the brand.
UGC_SUBDOMAIN = re.compile(r"^(?:forum|forums|community|wiki|reviews?|answers|support-community)\.")
# Wikis the brand itself writes (Polymaker's TD and hex tables live on its wiki).
OFFICIAL_WIKIS = {"wiki.polymaker.com", "wiki.bambulab.com"}

MAX_QUOTE_GAP = 300

_RANGE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:-|–|—|~|to)\s*(\d+(?:[.,]\d+)?)")

PROVABLE, HUMAN, NEW = "provable", "human", "new"


@dataclass
class Leaf:
    path: str
    pointer: str  # "" for a whole-file change
    op: str  # "add", "modify", "remove" or "structural"
    before: object = None
    after: object = None
    kind: str = ""  # file stem: filament, variant, sizes, brand...
    file_status: str = "M"

    @property
    def key(self) -> str:
        return f"{self.path}#{self.pointer}"

    @property
    def field(self) -> str:
        return self.pointer.rsplit("/", 1)[-1]

    def to_dict(self) -> dict:
        return asdict(self)


def _walk(doc, prefix: str = "") -> dict[str, object]:
    """Pointer -> value for every scalar; an array of scalars is one value."""
    out: dict[str, object] = {}
    if isinstance(doc, dict):
        if not doc and prefix:
            out[prefix] = {}
        for key, value in doc.items():
            out.update(_walk(value, f"{prefix}/{escape(key)}"))
    elif isinstance(doc, list) and any(isinstance(v, (dict, list)) for v in doc):
        for index, value in enumerate(doc):
            out.update(_walk(value, f"{prefix}/{index}"))
    else:
        out[prefix] = doc
    return out


_MISSING = object()


def _compare(change: ChangedFile, before, after, prefix: str = "") -> list[Leaf]:
    old, new = _walk(before, prefix), _walk(after, prefix)
    leaves = []
    for pointer in sorted(old.keys() | new.keys()):
        a, b = old.get(pointer, _MISSING), new.get(pointer, _MISSING)
        if a == b and type(a) is type(b):
            continue
        op = "add" if a is _MISSING else "remove" if b is _MISSING else "modify"
        leaves.append(
            Leaf(
                change.path,
                pointer,
                op,
                None if a is _MISSING else a,
                None if b is _MISSING else b,
                change.kind,
                change.status,
            )
        )
    return leaves


def _size_identity(size) -> tuple:
    if not isinstance(size, dict):
        return (repr(size),)
    return (size.get("uuid"), size.get("filament_weight"), size.get("diameter"))


def diff_leaves(change: ChangedFile) -> list[Leaf]:
    """Every value the change adds, modifies or removes, as separate leaves."""
    if change.status != "M":
        op = "add" if change.status == "A" else "remove"
        return [Leaf(change.path, "", op, change.before, change.after, change.kind, change.status)]
    before, after = change.before, change.after
    if change.kind == "sizes":
        # Existing spools keep their place and identity; new ones may only be appended.
        if (
            not isinstance(before, list)
            or not isinstance(after, list)
            or len(before) > len(after)
            or any(
                _size_identity(a) != _size_identity(b)
                for a, b in zip(before, after[: len(before)], strict=True)
            )
        ):
            return [Leaf(change.path, "", "structural", before, after, change.kind, change.status)]
        leaves = []
        for index, (a, b) in enumerate(zip(before, after[: len(before)], strict=True)):
            leaves += _compare(change, a, b, f"/{index}")
        for index in range(len(before), len(after)):
            leaves.append(
                Leaf(
                    change.path, f"/{index}", "add", None, after[index], change.kind, change.status
                )
            )
        return leaves
    if not isinstance(before, dict) or not isinstance(after, dict):
        return [Leaf(change.path, "", "structural", before, after, change.kind, change.status)]
    return _compare(change, before, after)


def is_new_entry(leaf: Leaf) -> bool:
    """A whole new file, or a whole spool row appended to an existing sizes.json."""
    if leaf.op != "add":
        return False
    if leaf.file_status == "A":
        return leaf.pointer == ""
    return (
        leaf.file_status == "M"
        and leaf.kind == "sizes"
        and re.fullmatch(r"/\d+", leaf.pointer) is not None
        and isinstance(leaf.after, dict)
    )


def classify(leaf: Leaf) -> str:
    if is_new_entry(leaf):
        return NEW
    if leaf.file_status != "M" or leaf.op not in ("add", "modify"):
        return HUMAN
    parts = leaf.pointer.strip("/").split("/")
    if leaf.kind == "sizes":
        if len(parts) != 2 or not parts[0].isdigit():
            return HUMAN
    elif len(parts) != 1:
        return HUMAN
    return PROVABLE if parts[-1] in RULES.get(leaf.kind, {}) else HUMAN


# --- product context ----------------------------------------------------------


@dataclass
class Context:
    """What the base branch says about the product a leaf belongs to."""

    brand_site: str | None
    filament_name: str = ""
    sibling_filaments: list[str] = field(default_factory=list)
    variant_name: str = ""
    sibling_variants: list[str] = field(default_factory=list)


def context_for(leaf: Leaf, base: TreeReader) -> Context:
    parts = PurePosixPath(leaf.path).parts  # data/brand/material/filament[/variant]/file
    brand = parts[1]
    brand_json = base.json(f"data/{brand}/brand.json") or {}
    filament_dir = "/".join(parts[:4])
    filament = base.json(f"{filament_dir}/filament.json") or {}
    filament_files = [
        p
        for p in base.all_paths()
        if p.startswith(f"data/{brand}/") and p.endswith("/filament.json")
    ]
    base.prefetch(filament_files)
    siblings = [
        (base.json(p) or {}).get("name", "")
        for p in filament_files
        if p != f"{filament_dir}/filament.json"
    ]
    ctx = Context(
        brand_site_name(brand_json.get("website") if isinstance(brand_json, dict) else None),
        str(filament.get("name", "")) if isinstance(filament, dict) else "",
        [s for s in siblings if s],
    )
    if leaf.kind in ("variant", "sizes"):
        variant_dir = "/".join(parts[:5])
        variant_files = [
            p
            for p in base.all_paths()
            if p.startswith(f"{filament_dir}/") and p.endswith("/variant.json")
        ]
        base.prefetch(variant_files)
        names = {p: (base.json(p) or {}).get("name", "") for p in variant_files}
        ctx.variant_name = names.get(f"{variant_dir}/variant.json", "")
        ctx.sibling_variants = [
            n for p, n in names.items() if n and p != f"{variant_dir}/variant.json"
        ]
    return ctx


# --- verification ---------------------------------------------------------------


def _same(a, b) -> bool:
    return type(a) is type(b) and a == b


def _named(name: str, text: str) -> bool:
    name = normalize(name)
    return (
        bool(name) and re.search(rf"(?<![a-z0-9]){re.escape(name)}(?![a-z0-9])", text) is not None
    )


def _on_brand_site(url: str, ctx: Context) -> str | None:
    host = (urlsplit(url).hostname or "").lower()
    if not ctx.brand_site:
        return "the brand has no website on record"
    if UGC_SUBDOMAIN.match(host) and host not in OFFICIAL_WIKIS:
        return f"{host} is a user-written section of the site"
    if site_name(host) != ctx.brand_site:
        return f"{host} is not the brand's own site"
    return None


def _range_end(field: str, value, quote: str) -> str | None:
    """A ``min_*`` value must be the low end of a range in the quote, ``max_*`` the high."""
    if not field.startswith(("min_", "max_")):
        return None
    for low, high in _RANGE.findall(quote):
        lo, hi = (float(x.replace(",", ".")) for x in (low, high))
        if field.startswith("min_") and float(value) == hi and float(value) != lo:
            return f"{value} is the top of the range {low}-{high}, not the minimum"
        if field.startswith("max_") and float(value) == lo and float(value) != hi:
            return f"{value} is the bottom of the range {low}-{high}, not the maximum"
    return None


def verify_proof(leaf: Leaf, proof: dict, fetcher, ctx: Context, stores_dir: Path) -> str | None:
    """None when ``proof`` proves ``leaf``, otherwise why not."""
    if proof.get("path") != leaf.path or proof.get("pointer") != leaf.pointer:
        return "the proof is for a different value"
    if not _same(proof.get("value"), leaf.after):
        return f"the proof's value {proof.get('value')!r} is not the PR's {leaf.after!r}"
    field_name = leaf.field
    anchor = RULES.get(leaf.kind, {}).get(field_name)
    if anchor is None:
        return "this field can't be proven automatically"
    source = proof.get("source_url") or ""
    quote = proof.get("quote") or ""

    if field_name in SHEETS:
        # The document is the proof: the value is its URL.
        if source != leaf.after:
            return "for a datasheet, source_url must be the document itself"
        if reason := rules.verify(
            {"pointer": leaf.pointer, "value": leaf.after, "source_url": source},
            fetcher,
            stores_dir,
        ):
            return reason
        page = fetcher.get(source)
        if reason := _on_brand_site(page.final_url or source, ctx):
            return reason
        if not _named(ctx.filament_name, page.text):
            return f"the document never names {ctx.filament_name!r}"
        return None

    enrichment = {
        "pointer": leaf.pointer,
        "value": leaf.after,
        "source_url": source,
        "source_quote": quote,
    }
    if reason := rules.verify(enrichment, fetcher, stores_dir):
        return reason
    page = fetcher.get(source)
    if reason := _on_brand_site(page.final_url or source, ctx):
        return reason
    if not quote_on_page(quote, page, max_gap=MAX_QUOTE_GAP):
        return "the quote's parts are too far apart on the page"
    q = normalize(quote)
    if not number_in(leaf.after, q) and isinstance(leaf.after, (int, float)):
        return "value is not in the quote"
    if reason := _range_end(field_name, leaf.after, q):
        return reason

    # About this exact product. Site chrome (the menu listing every product line) is
    # left out; a title or h1 naming the filament settles which product the page is.
    if reason := _about_product(page, q, ctx):
        return reason
    if anchor == "variant":
        content = page.content
        page_variants = [v for v in ctx.sibling_variants if _named(v, content)]
        if (page_variants or not _named(ctx.variant_name, content)) and not _named(
            ctx.variant_name, q
        ):
            return f"the quote doesn't name the colour {ctx.variant_name!r}"
    return None


def _about_product(page, quote: str, ctx: Context) -> str | None:
    """None when ``page`` is about the filament in ``ctx``."""
    if _named(ctx.filament_name, page.title):
        return None
    if not _named(ctx.filament_name, page.content):
        return f"the page never names {ctx.filament_name!r}"
    others = [s for s in ctx.sibling_filaments if not _named(s, normalize(ctx.filament_name))]
    if any(_named(s, page.content) for s in others) and not _named(ctx.filament_name, quote):
        return "the page covers several products, and the quote doesn't name this one"
    return None


def verify_all(proofs: list[dict], leaves: list[Leaf], fetcher, ctx_for, stores_dir: Path) -> dict:
    """``{leaf.key: {ok, reason, proof}}`` for every provable leaf.

    ``ctx_for(leaf) -> Context``. A leaf without an accepted proof is unproven.
    """
    verdicts: dict = {}
    for leaf in leaves:
        if classify(leaf) != PROVABLE:
            continue
        candidates = [
            p for p in proofs if p.get("path") == leaf.path and p.get("pointer") == leaf.pointer
        ]
        verdict = {"ok": False, "reason": "no proof was found", "proof": None}
        ctx = ctx_for(leaf)
        for proof in candidates:
            reason = verify_proof(leaf, proof, fetcher, ctx, stores_dir)
            if reason is None:
                verdict = {"ok": True, "reason": "", "proof": proof}
                break
            verdict = {"ok": False, "reason": reason, "proof": proof}
        verdicts[leaf.key] = verdict
    return verdicts


def verify_finding(
    finding: dict, head_value, kind: str, fetcher, ctx: Context, stores_dir: Path
) -> dict:
    """``{"verdict": "verified"|"unverified", "reason"}`` for a wrong-value finding.

    Verified means the brand's own page proves a *different* value for the field the
    finding points at, by the same rules as a proof.
    """
    evidence = finding.get("evidence")
    if not isinstance(evidence, dict):
        return {"verdict": "unverified", "reason": "no evidence given"}
    pointer = finding.get("pointer") or ""
    probe = Leaf(
        finding.get("path", ""), pointer, "modify", head_value, evidence.get("value"), kind
    )
    if classify(probe) != PROVABLE:
        return {"verdict": "unverified", "reason": "this field can't be checked automatically"}
    if _same(evidence.get("value"), head_value):
        return {"verdict": "unverified", "reason": "the evidence agrees with the PR"}
    reason = verify_proof(
        probe,
        {
            "path": probe.path,
            "pointer": pointer,
            "value": evidence.get("value"),
            "source_url": evidence.get("source_url"),
            "quote": evidence.get("quote"),
        },
        fetcher,
        ctx,
        stores_dir,
    )
    return (
        {"verdict": "unverified", "reason": reason}
        if reason
        else {"verdict": "verified", "reason": ""}
    )
