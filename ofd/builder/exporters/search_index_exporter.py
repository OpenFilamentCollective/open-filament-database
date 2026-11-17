"""
Flat global search index for the web UI.

Emits a single /api/v1/search-index.json listing every brand, store, material,
and filament with just enough fields to match, rank, link, and render a card.
The web UI downloads this once and searches + paginates it client-side; the
local contributor build produces the same shape on the fly from /data.

Record shape (mirrors webui/src/lib/types/search.ts SearchRecord):
    { type, name, href, brandName?, brandSlug?, logo?, materialType?, keywords?, path }

Hrefs/paths use the cloud `slug` segments so they resolve against the static
files the API exporter writes (e.g. brands/{brand_slug}/materials/{mat_slug}).
"""

from pathlib import Path

from ..models import Database
from .api_exporter import write_json


def _join_keywords(*values) -> str:
    parts = []
    for v in values:
        if v is None:
            continue
        if isinstance(v, (list, tuple)):
            parts.extend(str(x) for x in v if x)
        elif v != "":
            parts.append(str(v))
    return " ".join(parts)


def build_search_records(
    db: Database,
    brand_logo_id_mapping: dict | None = None,
    store_logo_id_mapping: dict | None = None,
) -> list[dict]:
    """Build the flat list of search records from a crawled Database."""
    brand_logo_id_mapping = brand_logo_id_mapping or {}
    store_logo_id_mapping = store_logo_id_mapping or {}

    brand_by_id = {b["id"]: b for b in db.brands}
    material_by_id = {m["id"]: m for m in db.materials}

    records: list[dict] = []

    # Brands
    for b in db.brands:
        rec = {
            "type": "brand",
            "name": b["name"],
            "href": f"/brands/{b['slug']}",
            "brandName": b["name"],
            "brandSlug": b["slug"],
            "keywords": _join_keywords(b.get("origin"), b.get("website")),
            "path": f"brands/{b['slug']}",
        }
        if b["id"] in brand_logo_id_mapping:
            rec["logo"] = brand_logo_id_mapping[b["id"]]
        if b.get("uuid"):
            rec["uuid"] = b["uuid"]
        records.append(rec)

    # Materials
    for m in db.materials:
        brand = brand_by_id.get(m["brand_id"])
        if not brand:
            continue
        rec = {
            "type": "material",
            "name": m["material"],
            "href": f"/brands/{brand['slug']}/{m['slug']}",
            "brandName": brand["name"],
            "brandSlug": brand["slug"],
            "materialType": m["material"],
            "keywords": _join_keywords(m["material"]),
            "path": f"brands/{brand['slug']}/materials/{m['slug']}",
        }
        if m.get("uuid"):
            rec["uuid"] = m["uuid"]
        records.append(rec)

    # Filaments
    for f in db.filaments:
        material = material_by_id.get(f["material_id"])
        if not material:
            continue
        brand = brand_by_id.get(material["brand_id"])
        if not brand:
            continue
        rec = {
            "type": "filament",
            "name": f["name"],
            "href": f"/brands/{brand['slug']}/{material['slug']}/{f['slug']}",
            "brandName": brand["name"],
            "brandSlug": brand["slug"],
            "materialType": material["material"],
            "keywords": _join_keywords(f["name"]),
            "path": f"brands/{brand['slug']}/materials/{material['slug']}/filaments/{f['slug']}",
        }
        if f.get("uuid"):
            rec["uuid"] = f["uuid"]
        records.append(rec)

    # Stores
    for s in db.stores:
        rec = {
            "type": "store",
            "name": s["name"],
            "href": f"/stores/{s['slug']}",
            "keywords": _join_keywords(
                s.get("storefront_url"), s.get("ships_from"), s.get("ships_to")
            ),
            "path": f"stores/{s['slug']}",
        }
        if s["id"] in store_logo_id_mapping:
            rec["logo"] = store_logo_id_mapping[s["id"]]
        if s.get("uuid"):
            rec["uuid"] = s["uuid"]
        records.append(rec)

    return records


def export_search_index(
    db: Database,
    api_path: str | Path,
    version: str,
    generated_at: str,
    brand_logo_id_mapping: dict | None = None,
    store_logo_id_mapping: dict | None = None,
) -> int:
    """Write /api/v1/search-index.json. Returns the number of records written."""
    records = build_search_records(db, brand_logo_id_mapping, store_logo_id_mapping)

    write_json(
        Path(api_path) / "search-index.json",
        {
            "version": version,
            "generated_at": generated_at,
            "count": len(records),
            "records": records,
        },
    )

    return len(records)
