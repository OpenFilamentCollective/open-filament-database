"""
Static API exporter that creates a GitHub Pages-friendly API structure.

Follows the native data directory hierarchy:
  /brands/{brand}/materials/{material}/filaments/{filament}/variants/{variant}
"""

import json
import shutil
from pathlib import Path

from ..models import Database
from ..serialization import entity_to_dict


def export_schemas(api_path: Path, schemas_dir: Path, version: str, generated_at: str) -> int:
    """Export JSON schemas to the API."""
    schemas_path = api_path / "schemas"
    schemas_path.mkdir(parents=True, exist_ok=True)

    schema_files = []

    if schemas_dir.exists():
        for schema_file in sorted(schemas_dir.glob("*.json")):
            # Copy schema file
            dest = schemas_path / schema_file.name
            shutil.copy2(schema_file, dest)

            # Extract schema name from filename (e.g., "brand_schema.json" -> "brand")
            name = schema_file.stem.replace("_schema", "").replace("-schema", "")

            schema_files.append({
                "name": name,
                "file": schema_file.name,
                "path": f"{schema_file.name}"
            })

    # Write schemas index
    schemas_index = {
        "version": version,
        "generated_at": generated_at,
        "count": len(schema_files),
        "schemas": schema_files
    }

    index_path = schemas_path / "index.json"
    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(schemas_index, f, indent=2, ensure_ascii=False)

    return len(schema_files)


def write_json(path: Path, data: dict):
    """Write JSON file with consistent formatting."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def export_api(db: Database, output_dir: str, version: str, generated_at: str, schemas_dir: str = None, base_url: str = "", **kwargs):
    """Export static API structure following native directory hierarchy."""
    api_path = Path(output_dir) / "api" / "v1"
    api_path.mkdir(parents=True, exist_ok=True)

    # Export schemas if directory provided
    schemas_count = 0
    if schemas_dir:
        schemas_path = Path(schemas_dir)
        schemas_count = export_schemas(api_path, schemas_path, version, generated_at)
        print(f"  Written: {schemas_count} schemas")

    # Build lookup maps for efficient access
    materials_by_brand = {}
    for m in db.materials:
        materials_by_brand.setdefault(m.brand_id, []).append(m)

    filaments_by_material = {}
    for f in db.filaments:
        filaments_by_material.setdefault(f.material_id, []).append(f)

    variants_by_filament = {}
    for v in db.variants:
        variants_by_filament.setdefault(v.filament_id, []).append(v)

    sizes_by_variant = {}
    for s in db.sizes:
        sizes_by_variant.setdefault(s.variant_id, []).append(s)

    purchase_links_by_size = {}
    for pl in db.purchase_links:
        purchase_links_by_size.setdefault(pl.size_id, []).append(pl)

    # Root index
    endpoints = {
        "brands": "brands/index.json",
        "stores": "stores/index.json",
        "all": "../json/all.json"
    }
    if schemas_count > 0:
        endpoints["schemas"] = "schemas/index.json"

    index = {
        "version": version,
        "generated_at": generated_at,
        "stats": {
            "brands": len(db.brands),
            "materials": len(db.materials),
            "filaments": len(db.filaments),
            "variants": len(db.variants),
            "sizes": len(db.sizes),
            "stores": len(db.stores),
            "purchase_links": len(db.purchase_links)
        },
        "endpoints": endpoints
    }
    write_json(api_path / "index.json", index)
    print(f"  Written: {api_path / 'index.json'}")

    # Brands index
    brands_path = api_path / "brands"
    brands_index = []

    for brand in db.brands:
        brand_materials = materials_by_brand.get(brand.id, [])
        brands_index.append({
            "id": brand.id,
            "name": brand.name,
            "slug": brand.slug,
            "origin": brand.origin,
            "material_count": len(brand_materials),
            "path": f"{brand.slug}/index.json"
        })

    write_json(brands_path / "index.json", {
        "version": version,
        "generated_at": generated_at,
        "count": len(db.brands),
        "brands": brands_index
    })

    # Per-brand structure
    brand_count = 0
    material_count = 0
    filament_count = 0
    variant_count = 0

    for brand in db.brands:
        brand_path = brands_path / brand.slug
        brand_materials = materials_by_brand.get(brand.id, [])

        # Brand index with materials list
        materials_list = []
        for mat in brand_materials:
            mat_filaments = filaments_by_material.get(mat.id, [])
            materials_list.append({
                "id": mat.id,
                "material": mat.material,
                "slug": mat.slug,
                "filament_count": len(mat_filaments),
                "path": f"materials/{mat.slug}/index.json"
            })

        brand_data = entity_to_dict(brand)
        brand_data["materials"] = materials_list
        write_json(brand_path / "index.json", brand_data)
        brand_count += 1

        # Per-material structure
        for mat in brand_materials:
            mat_path = brand_path / "materials" / mat.slug
            mat_filaments = filaments_by_material.get(mat.id, [])

            # Material index with filaments list
            filaments_list = []
            for fil in mat_filaments:
                fil_variants = variants_by_filament.get(fil.id, [])
                filaments_list.append({
                    "id": fil.id,
                    "name": fil.name,
                    "slug": fil.slug,
                    "variant_count": len(fil_variants),
                    "path": f"filaments/{fil.slug}/index.json"
                })

            mat_data = entity_to_dict(mat)
            mat_data["filaments"] = filaments_list
            write_json(mat_path / "index.json", mat_data)
            material_count += 1

            # Per-filament structure
            for fil in mat_filaments:
                fil_path = mat_path / "filaments" / fil.slug
                fil_variants = variants_by_filament.get(fil.id, [])

                # Filament index with variants list
                variants_list = []
                for var in fil_variants:
                    var_sizes = sizes_by_variant.get(var.id, [])
                    variants_list.append({
                        "id": var.id,
                        "color_name": var.color_name,
                        "color_hex": var.color_hex,
                        "slug": var.slug,
                        "size_count": len(var_sizes),
                        "path": f"variants/{var.slug}.json"
                    })

                fil_data = entity_to_dict(fil)
                fil_data["variants"] = variants_list
                write_json(fil_path / "index.json", fil_data)
                filament_count += 1

                # Per-variant files (leaf level - includes sizes and purchase links)
                variants_path = fil_path / "variants"
                for var in fil_variants:
                    var_sizes = sizes_by_variant.get(var.id, [])

                    # Build sizes with their purchase links
                    sizes_data = []
                    for size in var_sizes:
                        size_dict = entity_to_dict(size)
                        size_plinks = purchase_links_by_size.get(size.id, [])
                        if size_plinks:
                            size_dict["purchase_links"] = [entity_to_dict(pl) for pl in size_plinks]
                        sizes_data.append(size_dict)

                    var_data = entity_to_dict(var)
                    var_data["sizes"] = sizes_data
                    write_json(variants_path / f"{var.slug}.json", var_data)
                    variant_count += 1

    print(f"  Written: {brand_count} brands, {material_count} materials, {filament_count} filaments, {variant_count} variants")

    # Stores index
    stores_path = api_path / "stores"
    stores_index = []

    for store in db.stores:
        stores_index.append({
            "id": store.id,
            "name": store.name,
            "slug": store.slug,
            "storefront_url": store.storefront_url,
            "path": f"{store.slug}.json"
        })

    write_json(stores_path / "index.json", {
        "version": version,
        "generated_at": generated_at,
        "count": len(db.stores),
        "stores": stores_index
    })

    # Individual store files (just store info, no embedded purchase links)
    for store in db.stores:
        write_json(stores_path / f"{store.slug}.json", entity_to_dict(store))

    print(f"  Written: {len(db.stores)} stores")
