#!/usr/bin/env python3
"""
Import script to fetch SpoolmanDB from GitHub Pages and merge into Open Filament Database.

Usage:
    python scripts/import_spoolmandb.py [OPTIONS]

Options:
    --dry-run           Show what would be imported without writing files
    --verbose           Print detailed progress
    --filter-brand      Only import specific brand(s), comma-separated
    --filter-material   Only import specific material(s), comma-separated
"""

import argparse
import json
import re
import shutil
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Optional

# Constants
SPOOLMANDB_URL = "https://donkie.github.io/SpoolmanDB/filaments.json"
DATA_DIR = Path(__file__).parent.parent / "data"
DEFAULT_LOGO_PATH = Path(__file__).parent / "placeholder.svg"

# Placeholder values for missing required fields
PLACEHOLDER_WEBSITE = "https://unknown.com"
PLACEHOLDER_LOGO = "placeholder.svg"
PLACEHOLDER_ORIGIN = "Unknown"
DEFAULT_DIAMETER_TOLERANCE = 0.05


def cleanse_folder_name(name: str) -> str:
    """Clean folder name by replacing invalid characters."""
    # Illegal characters must match data_validator.py:
    # #%&{}\<>*?/$!'":@+`|=
    illegal_chars_pattern = r"[#%&{}\\<>*?/$!'\":@+`|=]"
    # Replace illegal characters with spaces
    cleaned = re.sub(illegal_chars_pattern, " ", name)
    # Collapse multiple whitespace characters to a single space and strip
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def normalize_for_matching(name: str) -> str:
    """Normalize name for fuzzy matching.

    - Lowercase
    - Remove punctuation (colons, hyphens, underscores, etc.)
    - Remove common suffixes like '3D', 'Filament'
    """
    name = name.lower()
    # Replace punctuation with nothing
    name = re.sub(r'[:\-_\s]+', '', name)
    # Remove common suffixes
    name = re.sub(r'(3d|filament)$', '', name)
    return name


def normalize_color_hex(hex_value: str) -> str:
    """Normalize hex color to uppercase without # prefix.

    Also strips alpha channel if present (RGBA -> RGB).
    Returns a 6-character hexadecimal string (no leading '#').
    Falls back to '000000' (black) if the input is missing or invalid.
    """
    # Falsy or missing values fall back to black
    if not hex_value:
        return "000000"

    # Normalize: strip whitespace, remove leading '#', and uppercase
    hex_value = hex_value.strip().lstrip("#").upper()
    # Strip alpha channel if present (8 chars -> 6 chars)
    if len(hex_value) == 8:
        hex_value = hex_value[:6]
    # Validate that we have exactly 6 hex characters; otherwise fall back
    if len(hex_value) != 6 or not re.fullmatch(r"[0-9A-F]{6}", hex_value):
        return "000000"
    return hex_value


def fetch_spoolmandb(verbose: bool = False) -> list[dict]:
    """Fetch filaments.json from SpoolmanDB GitHub Pages."""
    if verbose:
        print(f"Fetching SpoolmanDB from {SPOOLMANDB_URL}...")

    try:
        with urllib.request.urlopen(SPOOLMANDB_URL, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))
            if verbose:
                print(f"  Fetched {len(data)} entries")
            return data
    except Exception as e:
        print(f"Error fetching SpoolmanDB: {e}")
        sys.exit(1)


def group_by_hierarchy(entries: list[dict]) -> dict:
    """
    Group flat SpoolmanDB entries into hierarchical structure:
    Brand -> Material -> Filament (=Material) -> Variant (color) -> Sizes
    """
    hierarchy = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(list))))

    for entry in entries:
        manufacturer = entry.get("manufacturer", "Unknown")
        material = entry.get("material", "Unknown")
        color_name = entry.get("name", "Unknown")

        # Filament name = Material name (per user decision)
        filament_name = material

        # Build size entry
        size_entry = {
            "filament_weight": entry.get("weight"),
            "diameter": entry.get("diameter", 1.75),
            "empty_spool_weight": entry.get("spool_weight"),
            "ean": entry.get("ean"),  # Keep original SpoolmanDB field; later mapped to 'gtin' in sizes.json to match schemas/sizes_schema.json
        }

        # Build variant data (will be merged later)
        variant_data = {
            "color_name": color_name,
            "color_hex": normalize_color_hex(entry.get("color_hex", "")),
            "color_hexes": entry.get("color_hexes"),  # Multi-color support
            "translucent": entry.get("translucent"),
            "glow": entry.get("glow"),
            "finish": entry.get("finish"),  # "matte" -> traits.matte
        }

        # Build filament-level data (density, temps)
        filament_data = {
            "density": entry.get("density", 1.24),
            "extruder_temp": entry.get("extruder_temp"),
            "bed_temp": entry.get("bed_temp"),
        }

        # Store in hierarchy
        hierarchy[manufacturer][material][filament_name][color_name].append({
            "size": size_entry,
            "variant": variant_data,
            "filament": filament_data,
        })

    return hierarchy


def load_existing_brands() -> dict[str, str]:
    """Load existing brand folder names from data/ directory.

    Returns: dict mapping normalized name -> actual folder name
    """
    brands = {}
    if DATA_DIR.exists():
        for item in DATA_DIR.iterdir():
            if item.is_dir() and (item / "brand.json").exists():
                brands[normalize_for_matching(item.name)] = item.name
    return brands


def load_existing_materials(brand_path: Path) -> dict[str, str]:
    """Load existing material folder names for a brand.

    Returns: dict mapping lowercase name -> actual folder name
    """
    materials = {}
    if brand_path.exists():
        for item in brand_path.iterdir():
            if item.is_dir() and (item / "material.json").exists():
                materials[item.name.lower()] = item.name
    return materials


def load_existing_filaments(material_path: Path) -> dict[str, str]:
    """Load existing filament folder names for a material.

    Returns: dict mapping lowercase name -> actual folder name
    """
    filaments = {}
    if material_path.exists():
        for item in material_path.iterdir():
            if item.is_dir() and (item / "filament.json").exists():
                filaments[item.name.lower()] = item.name
    return filaments


def load_existing_variants(filament_path: Path) -> dict[str, str]:
    """Load existing variant folder names for a filament.

    Returns: dict mapping lowercase name -> actual folder name
    """
    variants = {}
    if filament_path.exists():
        for item in filament_path.iterdir():
            if item.is_dir() and (item / "variant.json").exists():
                variants[item.name.lower()] = item.name
    return variants


def load_existing_sizes(variant_path: Path) -> list[dict]:
    """Load existing sizes from sizes.json."""
    sizes_file = variant_path / "sizes.json"
    if sizes_file.exists():
        try:
            with open(sizes_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return []


def size_exists(existing_sizes: list[dict], new_size: dict) -> bool:
    """Check if a size entry already exists (by weight and diameter).
    If a matching size is found, update it in-place with any additional
    metadata from ``new_size`` (such as empty_spool_weight, ean, or gtin)
    that is missing from the existing entry, then return True.
    """
    for size in existing_sizes:
        if (
            size.get("filament_weight") == new_size.get("filament_weight")
            and size.get("diameter") == new_size.get("diameter")
        ):
            # Merge additional metadata where the existing entry is missing data.
            for key in ("empty_spool_weight", "ean", "gtin"):
                existing_value = size.get(key)
                new_value = new_size.get(key)
                # Only fill in if the existing value is absent/empty and the new value is meaningful.
                if (existing_value is None or existing_value == "") and new_value not in (None, ""):
                    size[key] = new_value
            return True
    return False


def create_brand(brand_path: Path, brand_name: str, dry_run: bool = False, verbose: bool = False) -> bool:
    """Create brand folder and brand.json."""
    if verbose:
        print(f"  Creating brand: {brand_name}")

    if not dry_run:
        brand_path.mkdir(parents=True, exist_ok=True)

        brand_data = {
            "brand": brand_name,
            "logo": PLACEHOLDER_LOGO,
            "website": PLACEHOLDER_WEBSITE,
            "origin": PLACEHOLDER_ORIGIN,
        }

        with open(brand_path / "brand.json", "w", encoding="utf-8") as f:
            json.dump(brand_data, f, indent=2)

        # Copy default logo as placeholder
        if DEFAULT_LOGO_PATH.exists():
            shutil.copy(DEFAULT_LOGO_PATH, brand_path / PLACEHOLDER_LOGO)
    return True


def create_material(material_path: Path, material_name: str, dry_run: bool = False, verbose: bool = False) -> bool:
    """Create material folder and material.json."""
    if verbose:
        print(f"    Creating material: {material_name}")

    if dry_run:
        return True

    material_path.mkdir(parents=True, exist_ok=True)

    material_data = {
        "material": material_name,
    }

    with open(material_path / "material.json", "w", encoding="utf-8") as f:
        json.dump(material_data, f, indent=2)

    return True


def create_filament(filament_path: Path, filament_name: str, filament_data: dict,
                    dry_run: bool = False, verbose: bool = False) -> bool:
    """Create filament folder and filament.json."""
    if verbose:
        print(f"      Creating filament: {filament_name}")

    if dry_run:
        return True

    filament_path.mkdir(parents=True, exist_ok=True)

    # Build slicer_settings from temperature data
    slicer_settings = None
    if filament_data.get("extruder_temp") or filament_data.get("bed_temp"):
        generic_settings = {}
        if filament_data.get("extruder_temp"):
            generic_settings["nozzle_temp"] = filament_data["extruder_temp"]
        if filament_data.get("bed_temp"):
            generic_settings["bed_temp"] = filament_data["bed_temp"]
        if generic_settings:
            slicer_settings = {"generic": generic_settings}

    filament_json = {
        "name": filament_name,
        "density": filament_data.get("density", 1.24),
        "diameter_tolerance": DEFAULT_DIAMETER_TOLERANCE,
    }

    if slicer_settings:
        filament_json["slicer_settings"] = slicer_settings

    with open(filament_path / "filament.json", "w", encoding="utf-8") as f:
        json.dump(filament_json, f, indent=2)

    return True


def create_variant(variant_path: Path, variant_data: dict, sizes: list[dict],
                   dry_run: bool = False, verbose: bool = False) -> bool:
    """Create variant folder with variant.json and sizes.json."""
    color_name = variant_data.get("color_name", "Unknown")
    if verbose:
        print(f"        Creating variant: {color_name}")

    if dry_run:
        return True

    variant_path.mkdir(parents=True, exist_ok=True)

    # Build color_hex (single or array)
    raw_color_hex = variant_data.get("color_hex")
    if variant_data.get("color_hexes"):
        # Multi-color: use array
        normalized_hexes = [normalize_color_hex(h) for h in variant_data["color_hexes"]]
        color_hex_list = ["#" + h for h in normalized_hexes]
        if color_hex_list:
            # At least one valid multi-color entry; keep as non-empty array
            color_hex = color_hex_list
        else:
            # All multi-color entries were invalid; fall back to a single color
            fallback_hex = normalize_color_hex(variant_data.get("color_hex", "000000"))
            if not fallback_hex:
                fallback_hex = "000000"
            color_hex = "#" + fallback_hex
    else:
        normalized_single_hex = normalize_color_hex(raw_color_hex) if raw_color_hex else "000000"
        color_hex = f"#{normalized_single_hex}"

    # Build traits
    traits = {}
    if variant_data.get("translucent"):
        traits["translucent"] = True
    if variant_data.get("glow"):
        traits["glow"] = True
    if variant_data.get("finish") == "matte":
        traits["matte"] = True

    variant_json = {
        "color_name": color_name,
        "color_hex": color_hex,
    }
    if traits:
        variant_json["traits"] = traits

    with open(variant_path / "variant.json", "w", encoding="utf-8") as f:
        json.dump(variant_json, f, indent=2)

    # Write sizes.json
    sizes_json = []
    for size in sizes:
        size_entry = {
            "filament_weight": size.get("filament_weight", 1000),
            "diameter": size.get("diameter", 1.75),
        }
        if size.get("empty_spool_weight"):
            size_entry["empty_spool_weight"] = size["empty_spool_weight"]
        if size.get("ean"):
            size_entry["gtin"] = size["ean"]
        sizes_json.append(size_entry)

    with open(variant_path / "sizes.json", "w", encoding="utf-8") as f:
        json.dump(sizes_json, f, indent=2)

    return True


def extend_sizes(variant_path: Path, new_sizes: list[dict],
                 dry_run: bool = False, verbose: bool = False) -> int:
    """Add new size entries to existing sizes.json."""
    existing_sizes = load_existing_sizes(variant_path)
    added = 0

    for new_size in new_sizes:
        if not size_exists(existing_sizes, new_size):
            if verbose:
                print(f"          Adding size: {new_size.get('filament_weight')}g / {new_size.get('diameter')}mm")
            size_entry = {
                "filament_weight": new_size.get("filament_weight", 1000),
                "diameter": new_size.get("diameter", 1.75),
            }
            if new_size.get("empty_spool_weight"):
                size_entry["empty_spool_weight"] = new_size["empty_spool_weight"]
            if new_size.get("ean"):
                size_entry["gtin"] = new_size["ean"]
            existing_sizes.append(size_entry)
            added += 1

    if added > 0 and not dry_run:
        with open(variant_path / "sizes.json", "w", encoding="utf-8") as f:
            json.dump(existing_sizes, f, indent=2)

    return added


def import_spoolmandb(
    dry_run: bool = False,
    verbose: bool = False,
    filter_brands: Optional[list[str]] = None,
    filter_materials: Optional[list[str]] = None,
) -> dict:
    """Main import function."""
    stats = {
        "brands_added": 0,
        "materials_added": 0,
        "filaments_added": 0,
        "variants_added": 0,
        "sizes_added": 0,
        "skipped": 0,
    }

    # Fetch data
    entries = fetch_spoolmandb(verbose)

    # Apply filters
    if filter_brands:
        filter_brands_lower = [b.lower() for b in filter_brands]
        entries = [e for e in entries if e.get("manufacturer", "").lower() in filter_brands_lower]
        if verbose:
            print(f"Filtered to {len(entries)} entries by brand")

    if filter_materials:
        filter_materials_lower = [m.lower() for m in filter_materials]
        entries = [e for e in entries if e.get("material", "").lower() in filter_materials_lower]
        if verbose:
            print(f"Filtered to {len(entries)} entries by material")

    # Group by hierarchy
    hierarchy = group_by_hierarchy(entries)

    # Load existing brands
    existing_brands = load_existing_brands()

    # Process hierarchy
    for brand_name, materials in hierarchy.items():
        brand_folder = cleanse_folder_name(brand_name)
        brand_normalized = normalize_for_matching(brand_name)
        brand_is_new = brand_normalized not in existing_brands

        if brand_is_new:
            brand_path = DATA_DIR / brand_folder
            create_brand(brand_path, brand_name, dry_run, verbose)
            stats["brands_added"] += 1
            existing_materials = {}
        else:
            # Use actual folder name from filesystem (may have different casing/punctuation)
            actual_brand_folder = existing_brands[brand_normalized]
            brand_path = DATA_DIR / actual_brand_folder
            existing_materials = load_existing_materials(brand_path)

        for material_name, filaments in materials.items():
            material_folder = cleanse_folder_name(material_name)
            material_folder_lower = material_folder.lower()
            material_is_new = material_folder_lower not in existing_materials

            if material_is_new:
                material_path = brand_path / material_folder
                create_material(material_path, material_name, dry_run, verbose)
                stats["materials_added"] += 1
                existing_filaments = {}
            else:
                # Use actual folder name from filesystem
                actual_material_folder = existing_materials[material_folder_lower]
                material_path = brand_path / actual_material_folder
                existing_filaments = load_existing_filaments(material_path)

            for filament_name, variants in filaments.items():
                filament_folder = cleanse_folder_name(filament_name)
                filament_folder_lower = filament_folder.lower()
                filament_is_new = filament_folder_lower not in existing_filaments

                # Get filament-level data from first entry
                first_variant_entries = list(variants.values())[0]
                filament_data = first_variant_entries[0]["filament"]

                if filament_is_new:
                    filament_path = material_path / filament_folder
                    create_filament(filament_path, filament_name, filament_data, dry_run, verbose)
                    stats["filaments_added"] += 1
                    existing_variants = {}
                else:
                    # Use actual folder name from filesystem
                    actual_filament_folder = existing_filaments[filament_folder_lower]
                    filament_path = material_path / actual_filament_folder
                    existing_variants = load_existing_variants(filament_path)

                for color_name, variant_entries in variants.items():
                    variant_folder = cleanse_folder_name(color_name)
                    variant_folder_lower = variant_folder.lower()
                    variant_is_new = variant_folder_lower not in existing_variants

                    # Collect all sizes for this variant
                    sizes = [entry["size"] for entry in variant_entries]
                    variant_data = variant_entries[0]["variant"]

                    if variant_is_new:
                        variant_path = filament_path / variant_folder
                        create_variant(variant_path, variant_data, sizes, dry_run, verbose)
                        stats["variants_added"] += 1
                        stats["sizes_added"] += len(sizes)
                    else:
                        # Use actual folder name from filesystem
                        actual_variant_folder = existing_variants[variant_folder_lower]
                        variant_path = filament_path / actual_variant_folder
                        # Merge & extend: add missing sizes
                        added = extend_sizes(variant_path, sizes, dry_run, verbose)
                        stats["sizes_added"] += added
                        if added == 0:
                            stats["skipped"] += 1

    return stats


def main():
    parser = argparse.ArgumentParser(
        description="Import SpoolmanDB into Open Filament Database"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be imported without writing files",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Print detailed progress",
    )
    parser.add_argument(
        "--filter-brand",
        type=str,
        help="Only import specific brand(s), comma-separated",
    )
    parser.add_argument(
        "--filter-material",
        type=str,
        help="Only import specific material(s), comma-separated",
    )

    args = parser.parse_args()

    filter_brands = None
    if args.filter_brand:
        filter_brands = [b.strip() for b in args.filter_brand.split(",")]

    filter_materials = None
    if args.filter_material:
        filter_materials = [m.strip() for m in args.filter_material.split(",")]

    if args.dry_run:
        print("=== DRY RUN MODE ===\n")

    stats = import_spoolmandb(
        dry_run=args.dry_run,
        verbose=args.verbose,
        filter_brands=filter_brands,
        filter_materials=filter_materials,
    )

    print("\n=== Import Summary ===")
    print(f"Brands added:    {stats['brands_added']}")
    print(f"Materials added: {stats['materials_added']}")
    print(f"Filaments added: {stats['filaments_added']}")
    print(f"Variants added:  {stats['variants_added']}")
    print(f"Sizes added:     {stats['sizes_added']}")
    print(f"Skipped:         {stats['skipped']}")

    if args.dry_run:
        print("\n(No files were written - dry run mode)")


if __name__ == "__main__":
    main()
