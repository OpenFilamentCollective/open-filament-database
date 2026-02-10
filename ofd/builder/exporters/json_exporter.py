"""
JSON exporter for the Open Filament Database.
"""

import gzip
import json
from pathlib import Path

from ..models import Database
from ..serialization import entity_to_dict


def database_to_dict(db: Database, version: str, generated_at: str) -> dict:
    """Convert the entire database to a dictionary."""
    return {
        "version": version,
        "generated_at": generated_at,
        "brands": [entity_to_dict(b) for b in db.brands],
        "materials": [entity_to_dict(m) for m in db.materials],
        "filaments": [entity_to_dict(f) for f in db.filaments],
        "variants": [entity_to_dict(v) for v in db.variants],
        "sizes": [entity_to_dict(s) for s in db.sizes],
        "stores": [entity_to_dict(s) for s in db.stores],
        "purchase_links": [entity_to_dict(pl) for pl in db.purchase_links],
    }


def export_all_json(db: Database, output_dir: str, version: str, generated_at: str):
    """Export all data to a single all.json file."""
    output_path = Path(output_dir) / "json"
    output_path.mkdir(parents=True, exist_ok=True)

    data = database_to_dict(db, version, generated_at)

    # Write uncompressed JSON
    all_json_path = output_path / "all.json"
    with open(all_json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  Written: {all_json_path}")

    # Write gzip compressed JSON
    all_json_gz_path = output_path / "all.json.gz"
    with gzip.open(all_json_gz_path, 'wt', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    print(f"  Written: {all_json_gz_path}")


def export_ndjson(db: Database, output_dir: str, version: str, generated_at: str):
    """Export all data as newline-delimited JSON (NDJSON)."""
    output_path = Path(output_dir) / "json"
    output_path.mkdir(parents=True, exist_ok=True)

    ndjson_path = output_path / "all.ndjson"
    with open(ndjson_path, 'w', encoding='utf-8') as f:
        # Write metadata line
        meta = {"_type": "meta", "version": version, "generated_at": generated_at}
        f.write(json.dumps(meta, ensure_ascii=False) + '\n')

        # Write each entity type
        for brand in db.brands:
            line = {"_type": "brand", **entity_to_dict(brand)}
            f.write(json.dumps(line, ensure_ascii=False) + '\n')

        for material in db.materials:
            line = {"_type": "material", **entity_to_dict(material)}
            f.write(json.dumps(line, ensure_ascii=False) + '\n')

        for filament in db.filaments:
            line = {"_type": "filament", **entity_to_dict(filament)}
            f.write(json.dumps(line, ensure_ascii=False) + '\n')

        for variant in db.variants:
            line = {"_type": "variant", **entity_to_dict(variant)}
            f.write(json.dumps(line, ensure_ascii=False) + '\n')

        for size in db.sizes:
            line = {"_type": "size", **entity_to_dict(size)}
            f.write(json.dumps(line, ensure_ascii=False) + '\n')

        for store in db.stores:
            line = {"_type": "store", **entity_to_dict(store)}
            f.write(json.dumps(line, ensure_ascii=False) + '\n')

        for pl in db.purchase_links:
            line = {"_type": "purchase_link", **entity_to_dict(pl)}
            f.write(json.dumps(line, ensure_ascii=False) + '\n')

    print(f"  Written: {ndjson_path}")


def export_per_brand_json(db: Database, output_dir: str, version: str, generated_at: str):
    """Export separate JSON files per brand."""
    output_path = Path(output_dir) / "json" / "brands"
    output_path.mkdir(parents=True, exist_ok=True)

    # Build index
    index = {
        "version": version,
        "generated_at": generated_at,
        "brands": []
    }

    for brand in db.brands:
        # Get all data for this brand
        brand_materials = [m for m in db.materials if m.brand_id == brand.id]
        brand_filaments = [f for f in db.filaments if f.brand_id == brand.id]
        brand_filament_ids = {f.id for f in brand_filaments}
        brand_variants = [v for v in db.variants if v.filament_id in brand_filament_ids]
        brand_variant_ids = {v.id for v in brand_variants}
        brand_sizes = [s for s in db.sizes if s.variant_id in brand_variant_ids]
        brand_size_ids = {s.id for s in brand_sizes}
        brand_purchase_links = [pl for pl in db.purchase_links if pl.size_id in brand_size_ids]

        brand_data = {
            "version": version,
            "generated_at": generated_at,
            "brand": entity_to_dict(brand),
            "materials": [entity_to_dict(m) for m in brand_materials],
            "filaments": [entity_to_dict(f) for f in brand_filaments],
            "variants": [entity_to_dict(v) for v in brand_variants],
            "sizes": [entity_to_dict(s) for s in brand_sizes],
            "purchase_links": [entity_to_dict(pl) for pl in brand_purchase_links],
        }

        # Write brand JSON
        brand_json_path = output_path / f"{brand.slug}.json"
        with open(brand_json_path, 'w', encoding='utf-8') as f:
            json.dump(brand_data, f, indent=2, ensure_ascii=False)

        # Add to index
        index["brands"].append({
            "id": brand.id,
            "name": brand.name,
            "slug": brand.slug,
            "path": f"brands/{brand.slug}.json"
        })

    # Write index
    index_path = output_path / "index.json"
    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(index, f, indent=2, ensure_ascii=False)
    print(f"  Written: {index_path} and {len(db.brands)} brand files")


def export_json(db: Database, output_dir: str, version: str, generated_at: str):
    """Export all JSON formats."""
    export_all_json(db, output_dir, version, generated_at)
    export_ndjson(db, output_dir, version, generated_at)
    export_per_brand_json(db, output_dir, version, generated_at)
