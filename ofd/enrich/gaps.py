"""
What a brand's existing entries are missing.

A gap is one entity (a filament, a variant, or one spool row in a sizes.json) and the
fields worth researching on it: fields that are absent, sustainability sections the
filament has no entry for (#768), and temperatures that are still the generic
per-material template most brands share (see ``MaterialStats``). Only these pointers
may be written by an enrichment run; anything else the model proposes is dropped, so a
run can never quietly rewrite data that was already sourced.

A brand claimed by its manufacturer (``ofd/brand_claims.json``, #808) owns its data:
its template values are not re-checked, only empty fields are filled, and the PR
waits for a representative's sign-off.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path

from ofd.review.checks import TEMPLATE_FIELDS, MaterialStats, material_of

FILAMENT_FIELDS = (
    *TEMPLATE_FIELDS,
    "max_dry_temperature",
    # #767
    "dry_temperature",
    "dry_time",
    "max_volumetric_speed",
    "min_fan_speed",
    "max_fan_speed",
    "enclosure",
    "data_sheet_url",
    "safety_sheet_url",
)
# Filament ``sustainability`` sections (#768), as ``sustainability/<section>`` so the
# pointer is ``/sustainability/<section>``.
SUSTAINABILITY_FIELDS = tuple(
    f"sustainability/{s}"
    for s in ("recycled_content", "bio_based_content", "carbon_footprints", "relative_claims")
)
VARIANT_FIELDS = ("transmission_distance",)
SIZE_FIELDS = ("gtin", "article_number", "purchase_links")


@dataclass
class Gap:
    path: str  # repo-relative file
    prefix: str  # JSON pointer of the entity inside the file ("" or "/<index>")
    label: str  # human-readable, for the prompt and the PR body
    missing: list[str] = field(default_factory=list)
    # Fields that hold a value, but one that looks copied from the template.
    recheck: list[str] = field(default_factory=list)
    current: dict = field(default_factory=dict)

    @property
    def fields(self) -> list[str]:
        return [*self.missing, *self.recheck]

    def pointers(self) -> set[str]:
        return {f"{self.prefix}/{f}" for f in self.fields}


def _load(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def brand_gaps(
    root: Path,
    brand: str,
    stats: MaterialStats,
    limit: int,
    sustainability: bool = True,
    claimed: bool = False,
) -> list[Gap]:
    """Gaps for ``brand``: filaments first (the data that matters most), then colours,
    then spools."""
    brand_dir = root / "data" / brand
    brand_data = _load(brand_dir / "brand.json") or {}
    brand_name = brand_data.get("name", brand)
    filament_gaps: list[Gap] = []
    variant_gaps: list[Gap] = []
    size_gaps: list[Gap] = []

    for filament_file in sorted(brand_dir.glob("*/*/filament.json")):
        filament = _load(filament_file)
        if not isinstance(filament, dict) or filament.get("discontinued"):
            continue
        rel = str(filament_file.relative_to(root))
        material = material_of(rel)
        label = f"{brand_name} · {material} · {filament.get('name', filament_file.parent.name)}"

        gap = Gap(rel, "", label, current={k: filament.get(k) for k in FILAMENT_FIELDS})
        gap.missing = [f for f in FILAMENT_FIELDS if filament.get(f) in (None, "")]
        if sustainability:
            block = filament.get("sustainability")
            block = block if isinstance(block, dict) else {}
            gap.missing += [f for f in SUSTAINABILITY_FIELDS if not block.get(f.split("/")[1])]
        combo = tuple(filament.get(f) for f in TEMPLATE_FIELDS)
        if not claimed and combo in stats.templates.get(material, {}):
            gap.recheck = list(TEMPLATE_FIELDS)
        if gap.fields:
            filament_gaps.append(gap)

        for variant_file in sorted(filament_file.parent.glob("*/variant.json")):
            variant = _load(variant_file)
            if not isinstance(variant, dict) or variant.get("discontinued"):
                continue
            missing = [f for f in VARIANT_FIELDS if variant.get(f) in (None, "")]
            if missing:
                variant_gaps.append(
                    Gap(
                        str(variant_file.relative_to(root)),
                        "",
                        f"{label} · {variant.get('name', variant_file.parent.name)}",
                        missing,
                        current={"color_hex": variant.get("color_hex")},
                    )
                )

        for sizes_file in sorted(filament_file.parent.glob("*/sizes.json")):
            variant = _load(sizes_file.parent / "variant.json") or {}
            if variant.get("discontinued"):
                continue
            sizes = _load(sizes_file)
            if not isinstance(sizes, list):
                continue
            for index, size in enumerate(sizes):
                if not isinstance(size, dict) or size.get("discontinued"):
                    continue
                missing = [f for f in SIZE_FIELDS if not size.get(f)]
                if size.get("ean"):  # deprecated alias, already a barcode
                    missing = [f for f in missing if f != "gtin"]
                if not missing:
                    continue
                refill = " refill" if size.get("container_material") == "refill" else ""
                size_gaps.append(
                    Gap(
                        str(sizes_file.relative_to(root)),
                        f"/{index}",
                        f"{label} · {variant.get('name', sizes_file.parent.name)} · "
                        f"{size.get('filament_weight')} g {size.get('diameter')} mm{refill}",
                        missing,
                        current={k: size.get(k) for k in (*SIZE_FIELDS, "ean")},
                    )
                )

    return (filament_gaps + variant_gaps + size_gaps)[:limit]
