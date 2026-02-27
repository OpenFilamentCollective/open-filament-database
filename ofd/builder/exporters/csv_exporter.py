"""
CSV exporter that creates normalized CSV files.

Derives headers from dict keys, making the exporter resilient to schema changes.
"""

import csv
from pathlib import Path

from ..models import Database
from ..serialization import entity_to_dict, serialize_for_csv


# Preferred key ordering per entity type for stable CSV columns.
# Keys not listed here are appended alphabetically after these.
_KEY_ORDER = {
    "brand": ["id", "name", "slug", "website", "logo_name", "origin", "source"],
    "material": ["id", "brand_id", "material", "slug", "material_class",
                  "default_max_dry_temperature", "default_slicer_settings"],
    "filament": ["id", "brand_id", "material_id", "name", "slug", "material",
                  "density", "diameter_tolerance", "discontinued"],
    "variant": ["id", "filament_id", "slug", "name", "color_hex",
                 "hex_variants", "color_standards", "traits", "discontinued"],
    "size": ["id", "variant_id", "filament_weight", "diameter", "empty_spool_weight",
             "spool_core_diameter", "gtin", "article_number", "discontinued"],
    "store": ["id", "name", "slug", "storefront_url", "logo_name", "ships_from", "ships_to"],
    "purchase_link": ["id", "size_id", "store_id", "url", "spool_refill",
                       "ships_from", "ships_to"],
}

# Keys that are internal and should never appear in CSV
_INTERNAL_KEYS = {"directory_name"}


def _derive_headers(entities: list[dict], entity_type: str) -> list[str]:
    """Derive CSV headers from dict keys with stable ordering."""
    # Collect all keys across all entities
    all_keys: set[str] = set()
    for entity in entities:
        all_keys.update(entity.keys())

    all_keys -= _INTERNAL_KEYS

    # Handle logo -> logo_name rename for brands/stores
    if "logo" in all_keys:
        all_keys.discard("logo")
        all_keys.add("logo_name")

    # Start with preferred order, then append remaining keys alphabetically
    preferred = _KEY_ORDER.get(entity_type, [])
    ordered = [k for k in preferred if k in all_keys]
    remaining = sorted(all_keys - set(ordered))
    return ordered + remaining


def _export_entity_csv(
    entities: list[dict],
    entity_type: str,
    output_path: Path,
    filename: str,
) -> Path:
    """Export a list of dict entities to a CSV file."""
    csv_path = output_path / filename

    if not entities:
        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            pass
        return csv_path

    headers = _derive_headers(entities, entity_type)

    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(headers)

        for entity in entities:
            exported = entity_to_dict(entity)
            row = [serialize_for_csv(exported.get(h)) for h in headers]
            writer.writerow(row)

    return csv_path


def export_csv(db: Database, output_dir: str, version: str, generated_at: str):
    """Export database to CSV files."""
    output_path = Path(output_dir) / "csv"
    output_path.mkdir(parents=True, exist_ok=True)

    exports = [
        (db.brands, "brand", "brands.csv"),
        (db.materials, "material", "materials.csv"),
        (db.filaments, "filament", "filaments.csv"),
        (db.variants, "variant", "variants.csv"),
        (db.sizes, "size", "sizes.csv"),
        (db.stores, "store", "stores.csv"),
        (db.purchase_links, "purchase_link", "purchase_links.csv"),
    ]

    for entities, entity_type, filename in exports:
        csv_path = _export_entity_csv(entities, entity_type, output_path, filename)
        print(f"  Written: {csv_path}")
