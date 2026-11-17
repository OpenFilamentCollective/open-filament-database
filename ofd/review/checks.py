"""
Deterministic, diff-aware review rules.

Each rule is the shape of a correction maintainers made by hand, found by mining
~1,100 review comments and fix-up commits (see ``guidelines.md``). Rules that make
sense for the whole tree live in ``ofd/validation/data_quality.py`` instead; these
need to know what the PR changed, or what the rest of the database looks like.

Levels:
    error    the data is wrong as submitted (a changed id)
    warning  very likely wrong, needs a source or a fix
    note     worth a look, often fine
"""

import re
from collections import defaultdict
from dataclasses import asdict, dataclass
from pathlib import PurePosixPath
from urllib.parse import urlsplit

from ofd.review.gitdata import ChangedFile, TreeReader
from ofd.scripts.apply_fiber_traits import SUGGEST, TRAIT_RULES, VALIDATE

# A temperature combination this many brands share for one material is a copied
# default, not a datasheet value: 68 PLA brands carry exactly 190-230 / 50-70.
TEMPLATE_MIN_BRANDS = 10

# Range checks need enough samples for the percentiles to mean anything.
RANGE_MIN_SAMPLES = 20
RANGE_QUANTILES = (0.01, 0.99)

TEMPLATE_FIELDS = (
    "min_print_temperature",
    "max_print_temperature",
    "min_bed_temperature",
    "max_bed_temperature",
)

RANGE_FIELDS = (
    *TEMPLATE_FIELDS,
    "preheat_temperature",
    "chamber_temperature",
    "min_chamber_temperature",
    "max_chamber_temperature",
    "max_dry_temperature",
    "dry_temperature",
    "dry_time",
    "max_volumetric_speed",
    "density",
    "diameter_tolerance",
)

STANDARD_DIAMETERS = {1.75, 2.85, 3.0}

# Names that announce more than one colour on the spool.
_MULTICOLOR = re.compile(
    r"(?:^|[^a-z])(?:dual|tri|bi|multi)[\s_-]?colou?r|rainbow|gradient|colou?r[\s_-]?morph"
    r"|(?:^|[^a-z])(?:dual|tri)(?![a-z])"
)

# Optional fields worth researching when they are missing on a new or changed entity.
ENRICHABLE = {
    "filament": (
        "min_print_temperature",
        "max_print_temperature",
        "min_bed_temperature",
        "max_bed_temperature",
        "max_dry_temperature",
        "dry_temperature",
        "dry_time",
        "enclosure",
        "data_sheet_url",
        "safety_sheet_url",
    ),
    "variant": ("transmission_distance",),
    "sizes": ("gtin", "article_number", "purchase_links", "empty_spool_weight"),
}


# Something worth researching, not a mistake: it goes to the model as a lead for
# `enrichments` and is never posted or counted against the PR.
HINT = "hint"


@dataclass
class Finding:
    rule: str
    level: str
    path: str
    message: str
    pointer: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def _parts(path: str) -> tuple[str, ...]:
    return PurePosixPath(path).parts


def material_of(path: str) -> str | None:
    """``PLA`` for ``data/<brand>/PLA/...``."""
    parts = _parts(path)
    return parts[2] if len(parts) > 3 and parts[0] == "data" else None


def _quantile(values: list[float], q: float) -> float:
    return values[int((len(values) - 1) * q)]


class MaterialStats:
    """What the base branch says is normal for each material."""

    def __init__(self, reader: TreeReader):
        paths = [
            p for p in reader.all_paths() if p.startswith("data/") and p.endswith("/filament.json")
        ]
        reader.prefetch(paths)
        combos: dict[str, dict[tuple, set[str]]] = defaultdict(lambda: defaultdict(set))
        values: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
        for path in paths:
            data = reader.json(path)
            material = material_of(path)
            if not isinstance(data, dict) or not material:
                continue
            combo = tuple(data.get(f) for f in TEMPLATE_FIELDS)
            if all(isinstance(v, (int, float)) for v in combo):
                combos[material][combo].add(_parts(path)[1])
            for f in RANGE_FIELDS:
                v = data.get(f)
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    values[material][f].append(v)

        self.templates = {
            m: {c: len(b) for c, b in cs.items() if len(b) >= TEMPLATE_MIN_BRANDS}
            for m, cs in combos.items()
        }
        self.bounds: dict[str, dict[str, tuple[float, float]]] = {}
        for m, fields in values.items():
            for f, vs in fields.items():
                if len(vs) >= RANGE_MIN_SAMPLES:
                    vs.sort()
                    self.bounds.setdefault(m, {})[f] = tuple(
                        _quantile(vs, q) for q in RANGE_QUANTILES
                    )


# --- identity -----------------------------------------------------------------


def check_identity(change: ChangedFile) -> list[Finding]:
    """Ids and uuids are atomic (#235): changing one breaks every reference to it."""
    findings: list[Finding] = []
    before, after = change.before, change.after
    if change.status == "D" and change.kind != "sizes":
        findings.append(
            Finding(
                "entity_deleted",
                "warning",
                change.path,
                f"Deletes this {change.kind}. If it moved or merged, the new entity needs "
                f"its UUID in `moved_from`; if it was wrong, say where that is documented.",
            )
        )
    if not (isinstance(before, dict) and isinstance(after, dict)):
        return findings
    for key in ("id", "uuid"):
        if key in before and before.get(key) != after.get(key):
            findings.append(
                Finding(
                    "identity_changed",
                    "error",
                    change.path,
                    f"`{key}` changed from {before.get(key)!r} to {after.get(key)!r}. Ids and "
                    f"UUIDs never change once merged; edit the other fields instead.",
                    f"/{key}",
                )
            )
    return findings


# --- filament -----------------------------------------------------------------


def _changed(change: ChangedFile, field: str) -> bool:
    before = change.before if isinstance(change.before, dict) else {}
    return isinstance(change.after, dict) and change.after.get(field) != before.get(field)


def looks_like_product_page(url: str) -> bool:
    """Mirrors ``looksLikeProductPage`` in ``webui/src/lib/utils/urlSanitizer.ts``."""
    parts = urlsplit(url if "://" in url else f"https://{url}")
    target = f"{parts.hostname or ''}{parts.path}".lower().rstrip("/")
    if re.search(r"\.(pdf|docx?|xlsx?)$", target):
        return False
    if re.search(r"[?&]variant=", url, re.I):
        return True
    return bool(re.search(r"/(products?|collections|item|dp|sku)/", target + "/"))


def check_filament(change: ChangedFile, stats: MaterialStats) -> list[Finding]:
    data = change.after
    if change.kind != "filament" or not isinstance(data, dict):
        return []
    findings: list[Finding] = []
    material = material_of(change.path)

    combo = tuple(data.get(f) for f in TEMPLATE_FIELDS)
    shared = stats.templates.get(material, {}).get(combo)
    if shared and any(_changed(change, f) for f in TEMPLATE_FIELDS):
        findings.append(
            Finding(
                "template_values",
                "warning",
                change.path,
                f"Print/bed temperatures {combo[0]}-{combo[1]} / {combo[2]}-{combo[3]} °C are the "
                f"generic {material} values {shared} brands share. Check them against the "
                f"manufacturer's datasheet or product page and link the source.",
                "/min_print_temperature",
            )
        )

    # Filled, foamed and specialty grades legitimately sit outside the norm, so this is
    # one note per file asking for a second look, not a verdict.
    unusual = []
    for field in RANGE_FIELDS:
        value = data.get(field)
        bounds = stats.bounds.get(material, {}).get(field)
        if (
            bounds
            and isinstance(value, (int, float))
            and _changed(change, field)
            and not bounds[0] <= value <= bounds[1]
        ):
            unusual.append(f"`{field}` {value} (usual {bounds[0]}-{bounds[1]})")
    if unusual:
        findings.append(
            Finding(
                "out_of_range",
                "note",
                change.path,
                f"Unusual for {material}: {'; '.join(unusual)}. Fine if the datasheet says "
                f"so; worth a second look for typos or a value in the wrong field.",
            )
        )

    tds, sds = data.get("data_sheet_url"), data.get("safety_sheet_url")
    if (
        tds
        and tds == sds
        and (_changed(change, "data_sheet_url") or _changed(change, "safety_sheet_url"))
    ):
        findings.append(
            Finding(
                "sheet_urls_identical",
                "warning",
                change.path,
                "`data_sheet_url` and `safety_sheet_url` are the same link. A TDS and an SDS "
                "are different documents; drop the one that isn't.",
                "/safety_sheet_url",
            )
        )
    for field in ("data_sheet_url", "safety_sheet_url"):
        url = data.get(field)
        if isinstance(url, str) and _changed(change, field) and looks_like_product_page(url):
            findings.append(
                Finding(
                    "sheet_url_is_shop_page",
                    "warning",
                    change.path,
                    f"`{field}` points at a shop listing, not a datasheet document.",
                    f"/{field}",
                )
            )
    return findings


# --- variant ------------------------------------------------------------------


def _name_text(head: TreeReader, variant_path: str, variant: dict) -> str:
    """Material / filament / variant names, as ``data_quality`` matches trait rules."""
    variant_dir = PurePosixPath(variant_path).parent
    filament_dir = variant_dir.parent
    filament = head.json(f"{filament_dir}/filament.json") or {}
    return " / ".join(
        str(p).lower()
        for p in (
            filament_dir.parent.name,
            filament_dir.name,
            filament.get("name") if isinstance(filament, dict) else "",
            variant_dir.name,
            variant.get("name"),
        )
        if p
    )


def _sibling_variants(head: TreeReader, variant_path: str) -> list[dict]:
    variant_dir = PurePosixPath(variant_path).parent
    filament_dir = variant_dir.parent
    paths = [
        f"{filament_dir}/{name}/variant.json"
        for name in head.listdir(str(filament_dir))
        if name != variant_dir.name and "." not in name
    ]
    head.prefetch(paths)
    return [d for d in (head.json(p) for p in paths) if isinstance(d, dict)]


def check_variant(change: ChangedFile, head: TreeReader) -> list[Finding]:
    data = change.after
    if change.kind != "variant" or not isinstance(data, dict):
        return []
    findings: list[Finding] = []
    traits = data.get("traits") if isinstance(data.get("traits"), dict) else {}
    name = str(data.get("name") or "")

    # Rules that also VALIDATE are already reported by `ofd validate`.
    text = _name_text(head, change.path, data)
    hinted: list[str] = []
    for rule in TRAIT_RULES:
        if (
            SUGGEST in rule.applies_to
            and VALIDATE not in rule.applies_to
            and rule.regex.search(text)
        ):
            hinted.extend(t for t in rule.traits if traits.get(t) is not True and t not in hinted)
    if hinted:
        findings.append(
            Finding(
                "trait_from_name",
                HINT,
                change.path,
                f"the name suggests these traits, which are not set: {', '.join(hinted)}",
                "/traits",
            )
        )

    siblings = _sibling_variants(head, change.path)
    if len(siblings) >= 3:
        shared = set.intersection(
            *({k for k, v in (s.get("traits") or {}).items() if v is True} for s in siblings)
        )
        missing = sorted(t for t in shared if traits.get(t) is not True and t not in hinted)
        if missing and change.status == "A":
            findings.append(
                Finding(
                    "sibling_trait_parity",
                    HINT,
                    change.path,
                    f"every other colour of this filament has {', '.join(missing)}; "
                    f"this one doesn't",
                    "/traits",
                )
            )

    hexes = data.get("color_hex")
    before_hexes = change.before.get("color_hex") if isinstance(change.before, dict) else None
    after_count = len(hexes) if isinstance(hexes, list) else 1
    if isinstance(before_hexes, list) and after_count < len(before_hexes):
        findings.append(
            Finding(
                "multicolor_collapsed",
                "warning",
                change.path,
                f"`color_hex` went from {len(before_hexes)} colours to {after_count}. "
                f"Multi-colour spools keep every colour (#327).",
                "/color_hex",
            )
        )
    elif isinstance(hexes, str) and _MULTICOLOR.search(
        f"{name} {PurePosixPath(change.path).parent.name}".lower()
    ):
        findings.append(
            Finding(
                "multicolor_single_hex",
                "warning",
                change.path,
                f"{name!r} is a multi-colour filament but `color_hex` holds one colour. "
                f"Use an array with every colour on the spool, e.g. "
                f'`"color_hex": ["#FFD700", "#800080"]`.',
                "/color_hex",
            )
        )
    return findings


# --- sizes --------------------------------------------------------------------


def _sibling_sizes(head: TreeReader, sizes_path: str) -> list[list]:
    variant_dir = PurePosixPath(sizes_path).parent
    filament_dir = variant_dir.parent
    paths = [
        f"{filament_dir}/{name}/sizes.json"
        for name in head.listdir(str(filament_dir))
        if name != variant_dir.name and "." not in name
    ]
    head.prefetch(paths)
    return [d for d in (head.json(p) for p in paths) if isinstance(d, list)]


def check_sizes(change: ChangedFile, head: TreeReader) -> list[Finding]:
    sizes = change.after
    if change.kind != "sizes" or not isinstance(sizes, list):
        return []
    findings: list[Finding] = []
    for index, size in enumerate(sizes):
        if not isinstance(size, dict):
            continue
        diameter = size.get("diameter")
        if isinstance(diameter, (int, float)) and diameter not in STANDARD_DIAMETERS:
            findings.append(
                Finding(
                    "nonstandard_diameter",
                    "warning",
                    change.path,
                    f"Size #{index + 1} has diameter {diameter} mm; filament comes in 1.75, "
                    f"2.85 or 3.00 mm. Typo?",
                    f"/{index}/diameter",
                )
            )

    siblings = _sibling_sizes(head, change.path)
    siblings_with_links = sum(
        1 for s in siblings if any(isinstance(x, dict) and x.get("purchase_links") for x in s)
    )
    if (
        siblings
        and siblings_with_links == len(siblings)
        and not any(isinstance(s, dict) and s.get("purchase_links") for s in sizes)
    ):
        findings.append(
            Finding(
                "missing_purchase_links",
                HINT,
                change.path,
                "every other colour of this filament has a purchase link; this one has none",
            )
        )
    return findings


# --- enrichment gaps ----------------------------------------------------------


def enrichment_gaps(changes: list[ChangedFile]) -> list[dict]:
    """Optional fields that are empty on the entities this PR adds or edits.

    These go to the model as a research list, not to the contributor as findings:
    a missing datasheet is an opportunity, not a mistake.
    """
    gaps: list[dict] = []
    for change in changes:
        fields = ENRICHABLE.get(change.kind)
        if not fields or change.after is None:
            continue
        if isinstance(change.after, dict):
            missing = [f for f in fields if not change.after.get(f)]
            if missing:
                gaps.append({"path": change.path, "pointer": "", "missing": missing})
        elif isinstance(change.after, list):
            for index, size in enumerate(change.after):
                if isinstance(size, dict):
                    missing = [f for f in fields if not size.get(f)]
                    if missing:
                        gaps.append(
                            {"path": change.path, "pointer": f"/{index}", "missing": missing}
                        )
    return gaps


def run_checks(changes: list[ChangedFile], base: TreeReader, head: TreeReader) -> list[Finding]:
    stats = MaterialStats(base)
    findings: list[Finding] = []
    for change in changes:
        findings.extend(check_identity(change))
        if change.status == "D":
            continue
        findings.extend(check_filament(change, stats))
        findings.extend(check_variant(change, head))
        findings.extend(check_sizes(change, head))
    return findings
