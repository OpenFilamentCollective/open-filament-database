"""
Barcode (GTIN/EAN/UPC) lookup index.

Emits a single ``/api/v1/gtin-index.json`` mapping every barcode in the database to
the size(s) carrying it, so scanning a spool resolves to a variant in one request.
Issue #479: the codes were already in the data and already published on each size,
but nothing indexed them, leaving a consumer to download the whole dataset and scan
it — which is exactly what the issue asked not to have to do.

Deliberately one flat file rather than a file per code:
  - ~2,700 codes at roughly 250 bytes each is a small download, and it is fetched
    lazily (the web UI only asks for it when a query looks like a barcode);
  - it needs no per-code routing on a static host.

Keys are the 14-digit GTIN form (see :func:`ofd.builder.utils.normalize_gtin`), so a
UPC-A, an EAN-13 and a GTIN-14 for the same product all land on one entry.

Values are always **lists**: a barcode is a product identifier, not a primary key,
and in the current tree 88 of 2,595 codes cover more than one size (up to five) —
typically a spool and its refill. Collapsing those to a single object would silently
drop all but one.

Each entry carries display names as well as slugs so a consumer — the web UI's search
among them — can render a result and link to it without a second request. Nothing
derivable is repeated: the four slugs build the web UI route, and ``href`` is the
matching API file.

Artifact shape:
    { "version", "generated_at", "count", "codes": { gtin14: [ entry, ... ] } }
"""

from pathlib import Path

from ..models import Database
from ..utils import normalize_gtin
from .api_exporter import write_json


def build_gtin_index(db: Database) -> dict[str, list[dict]]:
    """Build the ``{gtin14: [size entry, ...]}`` map from a crawled Database."""
    brand_by_id = {b["id"]: b for b in db.brands}
    material_by_id = {m["id"]: m for m in db.materials}
    filament_by_id = {f["id"]: f for f in db.filaments}
    variant_by_id = {v["id"]: v for v in db.variants}

    index: dict[str, list[dict]] = {}

    for size in db.sizes:
        # The crawler has already folded the deprecated `ean` spelling into `gtin`.
        code = normalize_gtin(size.get("gtin"))
        if not code:
            continue

        variant = variant_by_id.get(size.get("variant_id"))
        if not variant:
            continue
        filament = filament_by_id.get(variant.get("filament_id"))
        if not filament:
            continue
        material = material_by_id.get(filament.get("material_id"))
        if not material:
            continue
        brand = brand_by_id.get(material.get("brand_id"))
        if not brand:
            continue

        entry = {
            # As stored, so a consumer can echo back the form the contributor used.
            "gtin": size["gtin"],
            "brand_name": brand["name"],
            "brand_slug": brand["slug"],
            # The material's slug is its type ("PETG"), and it is the path segment in
            # both the API and the web UI, so one field serves display and linking.
            "material_slug": material["slug"],
            "filament_name": filament["name"],
            "filament_slug": filament["slug"],
            "variant_name": variant["name"],
            "variant_slug": variant["slug"],
            "filament_weight": size.get("filament_weight"),
            "diameter": size.get("diameter"),
            "href": (
                f"brands/{brand['slug']}/materials/{material['slug']}"
                f"/filaments/{filament['slug']}/variants/{variant['slug']}.json"
            ),
        }
        if variant.get("uuid"):
            entry["variant_uuid"] = variant["uuid"]
        if size.get("uuid"):
            entry["size_uuid"] = size["uuid"]

        index.setdefault(code, []).append(entry)

    return index


def export_gtin_index(
    db: Database,
    out_path: str | Path,
    version: str,
    generated_at: str,
) -> int:
    """Write the barcode index to ``out_path``. Returns the number of codes indexed."""
    index = build_gtin_index(db)

    write_json(
        Path(out_path),
        {
            "version": version,
            "generated_at": generated_at,
            "count": len(index),
            # Sorted for deterministic output (stable diffs and checksums).
            "codes": dict(sorted(index.items())),
        },
    )

    return len(index)
