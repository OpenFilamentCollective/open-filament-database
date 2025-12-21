#!/usr/bin/env python3
"""
Process Bambu Lab GTIN CSV and update the database with GTIN13 data.
Built around the following sheet: https://docs.google.com/spreadsheets/d/1Sd5G7rxpmxu3dANn1IJRvPyXcLwF7me2FMyZ0vcHboY/edit?gid=0#gid=0
"""

import csv
import json
import os
import re
from pathlib import Path
from typing import Dict, List, Optional

def parse_bambu_csv(csv_path: str) -> Dict[str, str]:
    """Parse the Bambu GTIN CSV file and create a mapping of GTIN13 to product description."""
    gtin_map = {}

    with open(csv_path, 'r', encoding='utf-8') as f:
        # Skip the instruction lines at the beginning
        reader = csv.reader(f)
        for i in range(6):  # Skip first 6 lines
            next(reader, None)

        # Now read the actual data
        for row in reader:
            if len(row) < 6:
                continue

            gtin12 = row[0].strip()
            gtin13 = row[1].strip()
            description = row[4].strip() if len(row) > 4 else ""

            if gtin13 and description and 'Bambu Lab' in description:
                gtin_map[gtin13] = description

    return gtin_map

def normalize_color_name(color: str) -> str:
    """Normalize color names for matching."""
    # Remove special characters and convert to lowercase
    normalized = color.lower().strip()
    # Remove common variations
    normalized = re.sub(r'\s+', ' ', normalized)
    return normalized

def extract_product_info(description: str) -> Optional[Dict[str, str]]:
    """Extract material, filament type, and color from the description."""
    # Example: "Bambu Lab Bambu PLA Matte-Ivory White 1.2 千克"
    # Example: "Bambu Lab Bambu PLA Basic-Black 1.2 千克"

    if not description or 'Bambu Lab' not in description:
        return None

    # Remove "Bambu Lab" prefix
    desc = description.replace('Bambu Lab', '').strip()

    # Remove "Bambu" brand prefix if present
    if desc.startswith('Bambu '):
        desc = desc[6:].strip()

    # Remove weight information (e.g., "1.2 千克", "1.2 kg")
    desc = re.sub(r'\d+\.?\d*\s*(千克|kg|千克)', '', desc).strip()

    # Remove parenthetical notes like "(废除)" or "(Abolished)"
    desc = re.sub(r'\([^)]*\)', '', desc).strip()

    # Split by hyphen or dash to separate type from color
    parts = re.split(r'[-\u2013\u2014]', desc, 1)

    if len(parts) < 2:
        return None

    material_type = parts[0].strip()
    color = parts[1].strip()

    # Parse material and filament type
    # Examples: "PLA Matte", "PLA Basic", "ABS", "PETG HF", "PLA-CF"
    material_parts = material_type.split()

    if len(material_parts) >= 2:
        material = material_parts[0]
        filament = ' '.join(material_parts[1:])
    elif len(material_parts) == 1:
        # Handle cases like "PLA-CF" or just "ABS"
        if '-' in material_parts[0]:
            material = material_parts[0].split('-')[0]
            filament = material_parts[0]
        else:
            material = material_parts[0]
            filament = material_parts[0]
    else:
        return None

    return {
        'material': material,
        'filament': filament,
        'color': color
    }

def find_sizes_files(base_path: str) -> List[Path]:
    """Find all sizes.json files in the Bambu Lab directory."""
    bambu_path = Path(base_path) / "data" / "Bambu Lab"
    return list(bambu_path.rglob("sizes.json"))

def update_sizes_file(sizes_path: Path, gtin: str) -> bool:
    """Update a sizes.json file with the GTIN."""
    try:
        with open(sizes_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        if not isinstance(data, list):
            print(f"Warning: {sizes_path} does not contain a list")
            return False

        modified = False
        for size_entry in data:
            # Check if this entry already has a gtin or matching ean
            existing_ean = size_entry.get('ean', '')
            existing_gtin = size_entry.get('gtin', '')

            # If we have a matching EAN, add or update the gtin field
            if existing_ean == gtin:
                if existing_gtin != gtin:
                    size_entry['gtin'] = gtin
                    modified = True
                    print(f"  Updated {sizes_path} with gtin: {gtin}")
            # If no EAN but no gtin either, we might want to add it
            elif not existing_ean and not existing_gtin:
                # Add gtin to entries without identifiers
                size_entry['gtin'] = gtin
                modified = True
                print(f"  Added gtin to {sizes_path}: {gtin}")

        if modified:
            with open(sizes_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.write('\n')

        return modified

    except Exception as e:
        print(f"Error updating {sizes_path}: {e}")
        return False

def match_and_update(gtin_map: Dict[str, str], base_path: str):
    """Match GTIN entries to sizes.json files and update them."""
    sizes_files = find_sizes_files(base_path)

    print(f"Found {len(sizes_files)} sizes.json files in Bambu Lab directory")
    print(f"Processing {len(gtin_map)} GTIN entries from CSV\n")

    matched_count = 0
    updated_count = 0

    for gtin, description in gtin_map.items():
        info = extract_product_info(description)
        if not info:
            continue

        # Try to find matching sizes.json file
        for sizes_file in sizes_files:
            # Get the path components
            parts = sizes_file.parts

            try:
                # Find Bambu Lab index
                bambu_idx = parts.index("Bambu Lab")

                # Extract material, filament type, and color from path
                if len(parts) > bambu_idx + 3:
                    path_material = parts[bambu_idx + 1]
                    path_filament = parts[bambu_idx + 2]
                    path_color = parts[bambu_idx + 3]

                    # Normalize for comparison
                    material_match = normalize_color_name(info['material']) == normalize_color_name(path_material)

                    # Check filament - handle variations
                    filament_normalized = normalize_color_name(info['filament'])
                    path_filament_normalized = normalize_color_name(path_filament)

                    # Handle special cases like "PLA-CF" vs "PLA CF"
                    filament_normalized = filament_normalized.replace('-', ' ')
                    path_filament_normalized = path_filament_normalized.replace('-', ' ')

                    filament_match = filament_normalized in path_filament_normalized or path_filament_normalized in filament_normalized

                    # Check color
                    color_normalized = normalize_color_name(info['color'])
                    path_color_normalized = normalize_color_name(path_color)

                    color_match = color_normalized == path_color_normalized or \
                                  color_normalized in path_color_normalized or \
                                  path_color_normalized in color_normalized

                    if material_match and filament_match and color_match:
                        matched_count += 1
                        print(f"\nMatch found for GTIN {gtin}:")
                        print(f"  Description: {description}")
                        print(f"  Path: {sizes_file}")

                        if update_sizes_file(sizes_file, gtin):
                            updated_count += 1

                        break
            except (ValueError, IndexError):
                continue

    print(f"\n\nSummary:")
    print(f"  Total GTIN entries processed: {len(gtin_map)}")
    print(f"  Matched to files: {matched_count}")
    print(f"  Files updated: {updated_count}")

def main():
    base_path = "/var/mnt/Vault/SP/open-filament-database"
    csv_path = os.path.join(base_path, "bambu gtin.csv")

    print("Parsing Bambu GTIN CSV...")
    gtin_map = parse_bambu_csv(csv_path)

    print(f"Found {len(gtin_map)} GTIN entries\n")

    # Show a few examples
    print("Sample entries:")
    for i, (gtin, desc) in enumerate(list(gtin_map.items())[:5]):
        print(f"  {gtin}: {desc}")
        info = extract_product_info(desc)
        if info:
            print(f"    -> Material: {info['material']}, Filament: {info['filament']}, Color: {info['color']}")
    print()

    match_and_update(gtin_map, base_path)

if __name__ == "__main__":
    main()
