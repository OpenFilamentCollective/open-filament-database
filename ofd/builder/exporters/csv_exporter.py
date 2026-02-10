"""
CSV exporter that creates normalized CSV files.

Uses dataclass introspection to automatically derive CSV headers from model definitions,
making the exporter resilient to schema changes.
"""

import csv
from dataclasses import fields
from pathlib import Path
from typing import Type

from ..models import (
    Database, Brand, Material, Filament, Variant, Size, Store, PurchaseLink
)
from ..serialization import entity_to_dict, serialize_for_csv


def export_entity_csv(
    entities: list,
    entity_class: Type,
    output_path: Path,
    filename: str
) -> Path:
    """
    Export a list of entities to a CSV file using dataclass introspection.

    Headers are automatically derived from the dataclass field names.

    Args:
        entities: List of dataclass instances to export
        entity_class: The dataclass type (used for field introspection)
        output_path: Directory to write the CSV file
        filename: Name of the CSV file

    Returns:
        Path to the written CSV file
    """
    from ..models import Brand, Store

    # Get field names, excluding directory_name for Brand and Store
    field_names = [
        f.name for f in fields(entity_class)
        if not (entity_class in (Brand, Store) and f.name == "directory_name")
    ]

    csv_path = output_path / filename
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(field_names)

        for entity in entities:
            row = [serialize_for_csv(getattr(entity, name)) for name in field_names]
            writer.writerow(row)

    return csv_path


def export_csv(db: Database, output_dir: str, version: str, generated_at: str):
    """Export database to CSV files."""
    output_path = Path(output_dir) / "csv"
    output_path.mkdir(parents=True, exist_ok=True)

    # Export each entity type using introspection
    exports = [
        (db.brands, Brand, "brands.csv"),
        (db.materials, Material, "materials.csv"),
        (db.filaments, Filament, "filaments.csv"),
        (db.variants, Variant, "variants.csv"),
        (db.sizes, Size, "sizes.csv"),
        (db.stores, Store, "stores.csv"),
        (db.purchase_links, PurchaseLink, "purchase_links.csv"),
    ]

    for entities, entity_class, filename in exports:
        csv_path = export_entity_csv(entities, entity_class, output_path, filename)
        print(f"  Written: {csv_path}")
