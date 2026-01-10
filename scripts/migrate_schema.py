#!/usr/bin/env python3
"""
migrate_schema.py - Migrate data files to new schema format

This script transforms the existing data files to conform to the updated schemas:
- brand.json: Rename 'brand' -> 'name', add 'id', rename logo files, rename folder
- filament.json: Add 'id' field, rename folder
- variant.json: Rename 'color_name' -> 'name', add 'id', rename folder
- store.json: Rename logo files, rename folder
- sizes.json: Update store_id references, migrate spool_refill to size level
- material.json: Map material types to valid enum values from material_types_schema.json

The script processes stores first to discover ID mappings (old_id -> new_id),
then uses these mappings to automatically update store_id references in data files.

For spool_refill migration: The new schema moves spool_refill from purchase_link
level to size level. If a size has mixed refill/non-refill purchase links, they
are split into separate size entries.

For material merging: When a material type maps to an existing folder (e.g.,
"Carbon Fibre" -> "PETG"), filaments are merged. Unique filaments are moved,
duplicate filaments have their data merged (missing variants/fields copied),
then the source material folder is deleted.

Usage:
    python scripts/migrate_schema.py --dry-run  # Preview changes
    python scripts/migrate_schema.py            # Apply changes
"""

import argparse
import json
import os
import re
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


# Mapping from old material names to schema enum values
# See schemas/material_types_schema.json for valid enum values
MATERIAL_TYPE_MAP: dict[str, str] = {
    # Nylon variants -> PA types
    "Nylon": "PA12",
    "PAHT": "PA12",
    "PA": "PA6",
    "PA-CF": "PA6",
    "PA-GF": "PA6",
    # PETG variants
    "PETG-CF": "PETG",
    "Addnite": "PETG",
    "Carbon Fibre": "PETG",  # Add-North Carbon Fibre is PETG-based
    "Graphene": "PETG",      # Add-North Graphene is PETG-based
    # PET variants
    "PE": "PET",
    "PET-CF": "PET",
    # PLA variants
    "APLA": "PLA",
    "Bio-performance": "PLA",
    "AquaPrint": "PLA",
    "Woodfill": "PLA",
    "Special": "PLA",
    # PPA variants
    "PPA-CF": "PPA",
    # CPE variants
    "CPE-HT": "CPE",
    # PP variants
    "CPX-PP": "PP",
    # PC variants
    "CPX-KyronMax": "PC",
    # EVA variants
    "EVA+": "EVA",
    # Support materials (typically PVA-based)
    "Support": "PVA",
    # Composite materials
    "Boron Carbide": "PA12",
}


@dataclass
class MigrationIssue:
    """Represents an issue encountered during migration."""
    issue_type: str
    path: str
    message: str


@dataclass
class MigrationReport:
    """Collects issues and warnings during migration."""
    issues: list[MigrationIssue] = field(default_factory=list)

    def add_issue(self, issue_type: str, path: str, message: str) -> None:
        self.issues.append(MigrationIssue(issue_type, path, message))

    def has_issues(self) -> bool:
        return len(self.issues) > 0

    def print_summary(self) -> None:
        if not self.issues:
            print("\nNo issues encountered during migration.")
            return

        print(f"\n{'=' * 60}")
        print(f"MIGRATION ISSUES ({len(self.issues)} total)")
        print('=' * 60)

        # Group by issue type
        by_type: dict[str, list[MigrationIssue]] = {}
        for issue in self.issues:
            by_type.setdefault(issue.issue_type, []).append(issue)

        for issue_type, issues in sorted(by_type.items()):
            print(f"\n{issue_type} ({len(issues)}):")
            for issue in issues:
                print(f"  - {issue.path}")
                print(f"    {issue.message}")


def generate_id(name: str) -> str:
    """Convert a name to a valid id (lowercase, spaces/hyphens/ampersands to underscores).

    Examples:
        "Bambu Lab" -> "bambu_lab"
        "3DO" -> "3do"
        "Add-North" -> "add_north"
        "ABS+" -> "abs+"
        "Black&White" -> "black_white"
    """
    id_str = name.lower()
    id_str = re.sub(r'[\s\-&]+', '_', id_str)  # spaces/hyphens/ampersands -> underscore
    id_str = re.sub(r'[^a-z0-9_+]', '', id_str)  # remove invalid chars (keep +)
    id_str = re.sub(r'_+', '_', id_str)  # collapse multiple underscores
    return id_str.strip('_')


def rename_folder(folder: Path, new_name: str, dry_run: bool) -> Path:
    """Rename a folder to a new name.

    Handles case-only renames on case-insensitive filesystems by using
    a two-step rename through a temporary name.

    Returns:
        The new path after renaming (or the original if no rename needed).
    """
    if folder.name == new_name:
        return folder

    new_path = folder.parent / new_name
    if new_path.exists():
        # Check if it's the same folder (case-insensitive rename like Black-White -> black_white)
        try:
            if folder.samefile(new_path):
                # Same folder, different case - do a two-step rename via temp name
                if dry_run:
                    print(f"  Would rename folder: {folder.name} -> {new_name}")
                else:
                    temp_path = folder.parent / f".{new_name}_temp_{os.getpid()}"
                    shutil.move(str(folder), str(temp_path))
                    shutil.move(str(temp_path), str(new_path))
                    print(f"  Renamed folder: {folder.name} -> {new_name}")
                return new_path
        except (OSError, ValueError):
            pass

        print(f"  Warning: Cannot rename {folder.name} -> {new_name}, target exists")
        return folder

    if dry_run:
        print(f"  Would rename folder: {folder.name} -> {new_name}")
    else:
        shutil.move(str(folder), str(new_path))
        print(f"  Renamed folder: {folder.name} -> {new_name}")

    return new_path


def find_logo_file(directory: Path) -> Path | None:
    """Find a logo file in the given directory."""
    logo_extensions = ['.png', '.jpg', '.jpeg', '.svg']
    for f in directory.iterdir():
        if f.is_file() and f.suffix.lower() in logo_extensions:
            return f
    return None


def rename_logo(directory: Path, current_logo: str, dry_run: bool) -> str | None:
    """Rename logo file to logo.{ext} and return new name.

    Returns:
        New logo filename (e.g., "logo.png") or None if no logo found.
    """
    if not current_logo:
        return None

    # Already in correct format
    if re.match(r'^logo\.(png|jpg|svg)$', current_logo):
        return current_logo

    # Find the current logo file
    current_path = directory / current_logo
    if not current_path.exists():
        # Try to find any logo file
        logo_file = find_logo_file(directory)
        if logo_file:
            current_path = logo_file
        else:
            print(f"  Warning: Logo file not found: {current_logo} in {directory}")
            return None

    # Determine new name
    ext = current_path.suffix.lower()
    if ext == '.jpeg':
        ext = '.jpg'
    new_name = f"logo{ext}"
    new_path = directory / new_name

    if current_path != new_path:
        if dry_run:
            print(f"  Would rename logo: {current_path.name} -> {new_name}")
        else:
            shutil.move(str(current_path), str(new_path))
            print(f"  Renamed logo: {current_path.name} -> {new_name}")

    return new_name


def load_json(path: Path) -> dict[str, Any] | None:
    """Load a JSON file, returning None if it doesn't exist."""
    if not path.exists():
        return None
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(path: Path, data: dict[str, Any], dry_run: bool) -> None:
    """Save data to a JSON file."""
    if dry_run:
        return
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
        f.write('\n')


def migrate_spool_refill(sizes_data: list[dict]) -> tuple[list[dict], bool]:
    """Migrate spool_refill from purchase_link level to size level.

    Per the new schema, spool_refill is now on the size object and applies to all
    purchase_links within that size. If a size has mixed refill/non-refill links,
    we split them into separate size entries.

    Args:
        sizes_data: List of size objects from sizes.json.

    Returns:
        Tuple of (updated sizes list, whether changes were made).
    """
    new_sizes = []
    changed = False

    for size_obj in sizes_data:
        if not isinstance(size_obj, dict):
            new_sizes.append(size_obj)
            continue

        purchase_links = size_obj.get('purchase_links', [])
        if not purchase_links:
            new_sizes.append(size_obj)
            continue

        # Separate links by spool_refill status
        refill_links = []
        non_refill_links = []

        for link in purchase_links:
            if not isinstance(link, dict):
                non_refill_links.append(link)
                continue

            is_refill = link.get('spool_refill', False)
            # Remove spool_refill from the link (it's deprecated at this level)
            link_copy = {k: v for k, v in link.items() if k != 'spool_refill'}

            if is_refill:
                refill_links.append(link_copy)
                changed = True  # We're removing/moving spool_refill
            else:
                # Only mark changed if we actually removed a spool_refill key
                if 'spool_refill' in link:
                    changed = True
                non_refill_links.append(link_copy)

        # Create size entries based on what we found
        if non_refill_links:
            # Non-refill size (original size without spool_refill)
            non_refill_size = {k: v for k, v in size_obj.items() if k != 'purchase_links'}
            non_refill_size['purchase_links'] = non_refill_links
            # Ensure spool_refill is not set or is False
            non_refill_size.pop('spool_refill', None)
            new_sizes.append(non_refill_size)

        if refill_links:
            # Refill size (with spool_refill=true at size level)
            refill_size = {k: v for k, v in size_obj.items() if k != 'purchase_links'}
            refill_size['spool_refill'] = True
            refill_size['purchase_links'] = refill_links
            new_sizes.append(refill_size)
            changed = True

    return new_sizes, changed


def migrate_sizes(
    sizes_file: Path,
    id_mapping: dict[str, str],
    valid_store_ids: set[str],
    dry_run: bool
) -> bool:
    """Update store_id references and migrate spool_refill in a sizes.json file.

    Args:
        sizes_file: Path to the sizes.json file.
        id_mapping: Dictionary mapping old store IDs to new store IDs.
        valid_store_ids: Set of valid store IDs from stores directory.
        dry_run: If True, don't actually modify files.

    Returns:
        True if changes were made, False otherwise.
    """
    data = load_json(sizes_file)
    if data is None:
        return False

    file_changed = False

    # sizes.json is a list of size objects
    if isinstance(data, list):
        # First, migrate spool_refill from purchase_link level to size level
        data, spool_refill_changed = migrate_spool_refill(data)
        if spool_refill_changed:
            print(f"        Migrated spool_refill to size level")
            file_changed = True

        # Then update store_id references
        for size_obj in data:
            if not isinstance(size_obj, dict):
                continue
            purchase_links = size_obj.get('purchase_links', [])
            if not isinstance(purchase_links, list):
                continue

            for link in purchase_links:
                if not isinstance(link, dict):
                    continue
                old_store_id = link.get('store_id')
                if not old_store_id:
                    continue

                # Find the matching store ID
                new_store_id = find_matching_store_id(
                    old_store_id, id_mapping, valid_store_ids
                )

                if new_store_id is None:
                    # No match found - will be reported by caller
                    continue

                if old_store_id != new_store_id:
                    link['store_id'] = new_store_id
                    print(f"        Updated store_id: {old_store_id} -> {new_store_id}")
                    file_changed = True

    if file_changed:
        save_json(sizes_file, data, dry_run)

    return file_changed


def merge_variant_dirs(
    source_dir: Path, target_dir: Path, dry_run: bool
) -> bool:
    """Merge data from source variant directory into target if target is missing data.

    Args:
        source_dir: The source variant directory (will be deleted after merge).
        target_dir: The target variant directory to merge into.
        dry_run: If True, don't actually modify files.

    Returns:
        True if merge was successful (source can be deleted), False otherwise.
    """
    # Merge variant.json data if target is missing fields
    source_variant = load_json(source_dir / 'variant.json')
    target_variant = load_json(target_dir / 'variant.json')

    if source_variant and target_variant:
        merged = False
        for key, value in source_variant.items():
            if key not in target_variant and key != 'id':
                target_variant[key] = value
                merged = True
                if dry_run:
                    print(f"        Would merge field '{key}' into target variant.json")
                else:
                    print(f"        Merged field '{key}' into target variant.json")

        if merged and not dry_run:
            save_json(target_dir / 'variant.json', target_variant, dry_run)

    # Merge sizes.json if source has data target doesn't
    source_sizes = source_dir / 'sizes.json'
    target_sizes = target_dir / 'sizes.json'

    if source_sizes.exists():
        source_data = load_json(source_sizes)
        target_data = load_json(target_sizes) if target_sizes.exists() else []

        if source_data and isinstance(source_data, list):
            if not target_data:
                # Target has no sizes, copy from source
                if dry_run:
                    print(f"        Would copy sizes.json to target")
                else:
                    shutil.copy2(str(source_sizes), str(target_sizes))
                    print(f"        Copied sizes.json to target")
            else:
                if dry_run:
                    print(f"        Would skip sizes.json (target already has data)")
                else:
                    print(f"        Skipped sizes.json (target already has data)")

    return True


def migrate_variant(
    variant_dir: Path,
    dry_run: bool,
    id_mapping: dict[str, str] | None = None,
    valid_store_ids: set[str] | None = None
) -> tuple[bool, Path]:
    """Transform variant.json: color_name->name, add id, rename folder.
    Also updates store_id references in sizes.json.

    If a folder with the target name already exists (e.g., renaming "Black-White" to
    "black_white" when "black_white" already exists), merge the contents and delete the source.

    Args:
        variant_dir: Path to the variant directory.
        dry_run: If True, don't actually modify files.
        id_mapping: Dictionary mapping old store IDs to new store IDs.
        valid_store_ids: Set of valid store IDs from stores directory.

    Returns:
        Tuple of (changes_made, new_path after folder rename).
    """
    variant_file = variant_dir / 'variant.json'
    data = load_json(variant_file)
    if data is None:
        return False, variant_dir

    changed = False
    folder_name = variant_dir.name
    new_id = generate_id(folder_name)

    # Add id if missing
    if 'id' not in data:
        data['id'] = new_id
        print(f"    Added id: {data['id']}")
        changed = True

    # Rename 'color_name' to 'name'
    if 'color_name' in data:
        data['name'] = data.pop('color_name')
        print(f"    Renamed 'color_name' -> 'name': {data['name']}")
        changed = True

    if changed:
        # Reorder keys: id first, then name, then color_hex, then rest
        ordered = {}
        for key in ['id', 'name', 'color_hex']:
            if key in data:
                ordered[key] = data[key]
        for key in data:
            if key not in ordered:
                ordered[key] = data[key]
        save_json(variant_file, ordered, dry_run)

    # Update store_id references in sizes.json
    sizes_file = variant_dir / 'sizes.json'
    if sizes_file.exists() and id_mapping is not None and valid_store_ids is not None:
        if migrate_sizes(sizes_file, id_mapping, valid_store_ids, dry_run):
            changed = True

    # Check if target folder already exists (duplicate scenario)
    target_dir = variant_dir.parent / new_id
    if target_dir.exists() and target_dir != variant_dir:
        # Target exists - merge into it and delete source
        print(f"    Merging duplicate variant: {folder_name} -> {new_id}")
        merge_variant_dirs(variant_dir, target_dir, dry_run)
        if dry_run:
            print(f"    Would delete merged source: {folder_name}")
        else:
            shutil.rmtree(str(variant_dir))
            print(f"    Deleted merged source: {folder_name}")
        return True, target_dir

    # Rename folder to match id
    new_dir = rename_folder(variant_dir, new_id, dry_run)
    if new_dir != variant_dir:
        changed = True

    return changed, new_dir


def merge_filament_dirs(
    source_dir: Path, target_dir: Path, dry_run: bool
) -> bool:
    """Merge data from source filament directory into target if target is missing data.

    Compares the two directories and merges any missing variants or data from source
    into target. After merging, the source can be safely deleted.

    Args:
        source_dir: The source filament directory (will be deleted after merge).
        target_dir: The target filament directory to merge into.
        dry_run: If True, don't actually modify files.

    Returns:
        True if merge was successful (source can be deleted), False otherwise.
    """
    # Get variants from both directories
    source_variants = {d.name: d for d in source_dir.iterdir() if d.is_dir()}
    target_variants = {d.name: d for d in target_dir.iterdir() if d.is_dir()}

    # Merge missing variants from source to target
    for variant_name, variant_dir in source_variants.items():
        if variant_name not in target_variants:
            # Variant doesn't exist in target - move it
            dest = target_dir / variant_name
            if dry_run:
                print(f"        Would move variant: {variant_name} -> {target_dir.name}/")
            else:
                shutil.move(str(variant_dir), str(dest))
                print(f"        Moved variant: {variant_name} -> {target_dir.name}/")
        else:
            # Variant exists in both - check if we need to merge sizes.json
            source_sizes = variant_dir / 'sizes.json'
            target_sizes = target_variants[variant_name] / 'sizes.json'

            if source_sizes.exists():
                source_data = load_json(source_sizes)
                target_data = load_json(target_sizes) if target_sizes.exists() else []

                if source_data and target_data is not None:
                    # Check for purchase links or sizes that might be missing
                    # For simplicity, if source has data target doesn't, log it
                    if dry_run:
                        print(f"        Would skip duplicate variant: {variant_name} (exists in target)")
                    else:
                        print(f"        Skipped duplicate variant: {variant_name} (exists in target)")

    # Merge filament.json data if target is missing fields
    source_filament = load_json(source_dir / 'filament.json')
    target_filament = load_json(target_dir / 'filament.json')

    if source_filament and target_filament:
        merged = False
        for key, value in source_filament.items():
            if key not in target_filament and key != 'id':
                target_filament[key] = value
                merged = True
                if dry_run:
                    print(f"        Would merge field '{key}' into target filament.json")
                else:
                    print(f"        Merged field '{key}' into target filament.json")

        if merged and not dry_run:
            save_json(target_dir / 'filament.json', target_filament, dry_run)

    return True


def migrate_filament(filament_dir: Path, dry_run: bool) -> tuple[bool, Path]:
    """Transform filament.json: add id, rename folder.

    If a folder with the target name already exists (e.g., renaming "Rigid X" to
    "rigid_x" when "rigid_x" already exists), merge the contents and delete the source.

    Returns:
        Tuple of (changes_made, new_path after folder rename).
    """
    filament_file = filament_dir / 'filament.json'
    data = load_json(filament_file)
    if data is None:
        return False, filament_dir

    changed = False
    folder_name = filament_dir.name
    new_id = generate_id(folder_name)

    # Add or update id to match folder
    if data.get('id') != new_id:
        old_id = data.get('id')
        data['id'] = new_id
        if old_id:
            print(f"  Updated id: {old_id} -> {new_id}")
        else:
            print(f"  Added id: {new_id}")
        changed = True

    if changed:
        # Reorder keys: id first, then name, then rest
        ordered = {}
        for key in ['id', 'name']:
            if key in data:
                ordered[key] = data[key]
        for key in data:
            if key not in ordered:
                ordered[key] = data[key]
        save_json(filament_file, ordered, dry_run)

    # Check if target folder already exists (duplicate scenario)
    target_dir = filament_dir.parent / new_id
    if target_dir.exists() and target_dir != filament_dir:
        # Target exists - merge into it and delete source
        print(f"  Merging duplicate: {folder_name} -> {new_id}")
        merge_filament_dirs(filament_dir, target_dir, dry_run)
        if dry_run:
            print(f"  Would delete merged source: {folder_name}")
        else:
            shutil.rmtree(str(filament_dir))
            print(f"  Deleted merged source: {folder_name}")
        return True, target_dir

    # Rename folder to match id
    new_dir = rename_folder(filament_dir, new_id, dry_run)
    if new_dir != filament_dir:
        changed = True

    return changed, new_dir


def migrate_material(
    material_dir: Path, dry_run: bool, report: MigrationReport
) -> tuple[bool, Path | None]:
    """Transform material.json: map material types to enum values, rename folder.

    Note: material.json only has 'material', 'default_max_dry_temperature',
    and 'default_slicer_settings' fields - no 'id' field.

    If the target material folder already exists (e.g., mapping APLA -> PLA when
    PLA folder exists), moves all filament subdirectories to the target folder
    and deletes the source folder.

    Returns:
        Tuple of (changes_made, new_path after folder rename).
        If the folder was merged into another and deleted, returns (True, None).
    """
    material_file = material_dir / 'material.json'
    data = load_json(material_file)
    if data is None:
        return False, material_dir

    changed = False
    folder_name = material_dir.name
    original_material = data.get('material', folder_name)

    # Remove 'id' field if present (not part of material schema)
    if 'id' in data:
        del data['id']
        print(f"    Removed invalid 'id' field from material.json")
        changed = True

    # Map material type to enum value if needed
    new_material = original_material
    if original_material in MATERIAL_TYPE_MAP:
        new_material = MATERIAL_TYPE_MAP[original_material]
        data['material'] = new_material
        print(f"    Mapped material: {original_material} -> {new_material}")
        changed = True
    else:
        # Check if material is already a valid enum value (all caps typically)
        # If not, record it as an unmapped material
        material_value = data.get('material', '')
        if material_value and not material_value.isupper():
            # Likely needs mapping but we don't have one
            report.add_issue(
                "Unmapped material type",
                str(material_dir.relative_to(material_dir.parent.parent)),
                f"Material '{material_value}' is not mapped to a schema enum value"
            )

    # Check if target folder already exists (merge scenario)
    new_folder_name = data.get('material', folder_name)
    target_dir = material_dir.parent / new_folder_name

    if target_dir.exists() and target_dir != material_dir:
        # Target folder exists - merge filaments into it
        print(f"    Merging into existing folder: {new_folder_name}")

        # Build a mapping of normalized names to actual folder names in target
        target_filaments: dict[str, Path] = {}
        for d in target_dir.iterdir():
            if d.is_dir():
                # Map both the actual name and the normalized name
                target_filaments[d.name] = d
                target_filaments[generate_id(d.name)] = d

        # Move all filament subdirectories to target
        filament_dirs = [d for d in material_dir.iterdir() if d.is_dir()]
        for filament_dir in filament_dirs:
            # Check if a matching filament exists in target (by name or normalized name)
            source_name = filament_dir.name
            source_normalized = generate_id(source_name)

            matching_target = target_filaments.get(source_name) or target_filaments.get(source_normalized)

            if matching_target:
                # Filament exists in both - merge data from source to target
                print(f"      Merging duplicate filament: {source_name} -> {matching_target.name}")
                merge_filament_dirs(filament_dir, matching_target, dry_run)
                # Delete the source filament directory after merge
                if dry_run:
                    print(f"      Would delete merged source: {source_name}")
                else:
                    shutil.rmtree(str(filament_dir))
                    print(f"      Deleted merged source: {source_name}")
            else:
                # Filament doesn't exist in target - move it
                dest = target_dir / source_name
                if dry_run:
                    print(f"      Would move filament: {source_name} -> {new_folder_name}/")
                else:
                    shutil.move(str(filament_dir), str(dest))
                    print(f"      Moved filament: {source_name} -> {new_folder_name}/")

        # Delete the now-empty source folder (including material.json)
        if dry_run:
            print(f"      Would delete empty folder: {folder_name}")
        else:
            shutil.rmtree(str(material_dir))
            print(f"      Deleted empty folder: {folder_name}")

        return True, None  # Signal that folder was merged and deleted

    # Normal case: just update material.json and rename folder
    if changed:
        # Reorder keys: material first, then rest
        ordered = {}
        if 'material' in data:
            ordered['material'] = data['material']
        for key in data:
            if key not in ordered:
                ordered[key] = data[key]
        save_json(material_file, ordered, dry_run)

    # Rename folder to match material type (keep uppercase, e.g., "PLA", "CF")
    new_dir = rename_folder(material_dir, new_folder_name, dry_run)
    if new_dir != material_dir:
        changed = True

    return changed, new_dir


def migrate_brand(brand_dir: Path, dry_run: bool) -> tuple[bool, Path]:
    """Transform brand.json: brand->name, add id, rename logo, rename folder.

    Returns:
        Tuple of (changes_made, new_path after folder rename).
    """
    brand_file = brand_dir / 'brand.json'
    data = load_json(brand_file)
    if data is None:
        return False, brand_dir

    changed = False
    folder_name = brand_dir.name
    new_id = generate_id(folder_name)

    # Add id if missing
    if 'id' not in data:
        data['id'] = new_id
        print(f"  Added id: {data['id']}")
        changed = True

    # Rename 'brand' to 'name'
    if 'brand' in data:
        data['name'] = data.pop('brand')
        print(f"  Renamed 'brand' -> 'name': {data['name']}")
        changed = True

    # Rename logo file and update reference
    if 'logo' in data:
        new_logo = rename_logo(brand_dir, data['logo'], dry_run)
        if new_logo and new_logo != data['logo']:
            data['logo'] = new_logo
            changed = True

    if changed:
        # Reorder keys: id first, then name, then rest
        ordered = {}
        for key in ['id', 'name', 'website', 'logo', 'origin']:
            if key in data:
                ordered[key] = data[key]
        for key in data:
            if key not in ordered:
                ordered[key] = data[key]
        save_json(brand_file, ordered, dry_run)

    # Rename folder to match id
    new_dir = rename_folder(brand_dir, new_id, dry_run)
    if new_dir != brand_dir:
        changed = True

    return changed, new_dir


def migrate_store(
    store_dir: Path, dry_run: bool, id_mapping: dict[str, str]
) -> tuple[bool, Path]:
    """Transform store.json: rename logo file, rename folder.

    Args:
        store_dir: Path to the store directory.
        dry_run: If True, don't actually modify files.
        id_mapping: Dictionary to populate with old_id -> new_id mappings.

    Returns:
        Tuple of (changes_made, new_path after folder rename).
    """
    store_file = store_dir / 'store.json'
    data = load_json(store_file)
    if data is None:
        return False, store_dir

    changed = False
    folder_name = store_dir.name
    new_id = generate_id(folder_name)

    # Record the old ID -> new ID mapping
    old_id = data.get('id', folder_name)
    if old_id != new_id:
        id_mapping[old_id] = new_id
    # Also map the folder name if different from the old id
    if folder_name != old_id and folder_name != new_id:
        id_mapping[folder_name] = new_id

    # Update id in data if it doesn't match the new format
    if 'id' in data and data['id'] != new_id:
        data['id'] = new_id
        print(f"  Updated id: {data['id']}")
        changed = True

    # Rename logo file and update reference
    if 'logo' in data:
        new_logo = rename_logo(store_dir, data['logo'], dry_run)
        if new_logo and new_logo != data['logo']:
            data['logo'] = new_logo
            changed = True

    if changed:
        save_json(store_file, data, dry_run)

    # Rename folder to match id
    new_dir = rename_folder(store_dir, new_id, dry_run)
    if new_dir != store_dir:
        changed = True

    return changed, new_dir


def process_data_directory(
    data_dir: Path,
    dry_run: bool,
    report: MigrationReport,
    id_mapping: dict[str, str] | None = None,
    valid_store_ids: set[str] | None = None
) -> dict[str, int]:
    """Process all data files in the data directory.

    Important: We process from deepest level up (variants -> filaments -> materials -> brands)
    to avoid path issues when renaming folders.

    Args:
        data_dir: Path to the data directory.
        dry_run: If True, don't actually modify files.
        report: MigrationReport to add issues to.
        id_mapping: Dictionary mapping old store IDs to new store IDs.
        valid_store_ids: Set of valid store IDs from stores directory.

    Returns:
        Dictionary with counts of modified files by type.
    """
    stats = {'brands': 0, 'materials': 0, 'filaments': 0, 'variants': 0}

    # Collect all directories first to avoid issues with iteration during rename
    brand_dirs = sorted([d for d in data_dir.iterdir() if d.is_dir()])

    for brand_dir in brand_dirs:
        print(f"\nBrand: {brand_dir.name}")

        # First, process all nested content (variants -> filaments -> materials)
        material_dirs = sorted([d for d in brand_dir.iterdir() if d.is_dir()])

        for material_dir in material_dirs:
            # Check if this is a material directory (has material.json)
            if not (material_dir / 'material.json').exists():
                continue

            print(f"  Material: {material_dir.name}")

            filament_dirs = sorted([d for d in material_dir.iterdir() if d.is_dir()])

            for filament_dir in filament_dirs:
                # Check if this is a filament directory (has filament.json)
                if not (filament_dir / 'filament.json').exists():
                    continue

                print(f"    Filament: {filament_dir.name}")

                # Process variants FIRST (deepest level)
                variant_dirs = sorted([d for d in filament_dir.iterdir() if d.is_dir()])
                for variant_dir in variant_dirs:
                    if (variant_dir / 'variant.json').exists():
                        print(f"      Variant: {variant_dir.name}")
                        changed, _ = migrate_variant(
                            variant_dir, dry_run, id_mapping, valid_store_ids
                        )
                        if changed:
                            stats['variants'] += 1

                # Then process filament
                changed, _ = migrate_filament(filament_dir, dry_run)
                if changed:
                    stats['filaments'] += 1

            # Then process material
            changed, _ = migrate_material(material_dir, dry_run, report)
            if changed:
                stats['materials'] += 1

        # Finally, process the brand itself
        changed, _ = migrate_brand(brand_dir, dry_run)
        if changed:
            stats['brands'] += 1

    return stats


def process_stores_directory(
    stores_dir: Path, dry_run: bool
) -> tuple[int, dict[str, str]]:
    """Process all store files in the stores directory.

    Returns:
        Tuple of (count of modified store files, old_id -> new_id mapping).
    """
    count = 0
    id_mapping: dict[str, str] = {}

    # Collect directories first to avoid iteration issues
    store_dirs = sorted([d for d in stores_dir.iterdir() if d.is_dir()])

    for store_dir in store_dirs:
        print(f"\nStore: {store_dir.name}")
        changed, _ = migrate_store(store_dir, dry_run, id_mapping)
        if changed:
            count += 1

    return count, id_mapping


def get_valid_store_ids(stores_dir: Path) -> set[str]:
    """Scan stores directory and return all valid store IDs.

    Returns:
        Set of valid store IDs (folder names that contain store.json).
    """
    valid_ids = set()
    if not stores_dir.exists():
        return valid_ids

    for store_dir in stores_dir.iterdir():
        if store_dir.is_dir() and (store_dir / 'store.json').exists():
            valid_ids.add(store_dir.name)

    return valid_ids


def find_matching_store_id(
    old_store_id: str,
    id_mapping: dict[str, str],
    valid_store_ids: set[str]
) -> str | None:
    """Find the correct store ID for an old store_id reference.

    Tries multiple strategies to find a match:
    1. Check explicit id_mapping from migration
    2. Check if it's already a valid store ID
    3. Check if generate_id(old_store_id) matches a valid store
    4. Check if any valid store ID contains the normalized old_store_id

    Args:
        old_store_id: The store_id value found in data files.
        id_mapping: Dictionary mapping old store IDs to new store IDs.
        valid_store_ids: Set of valid store IDs from stores directory.

    Returns:
        The matching store ID, or None if no match found.
    """
    # 1. Check explicit mapping from migration
    if old_store_id in id_mapping:
        return id_mapping[old_store_id]

    # 2. Already a valid store ID
    if old_store_id in valid_store_ids:
        return old_store_id

    # 3. Check if normalized form is valid
    normalized = generate_id(old_store_id)
    if normalized in valid_store_ids:
        return normalized

    # 4. Try fuzzy matching - check if removing common suffixes helps
    # e.g., "3do.dk" -> check if "3do" exists
    for suffix in ['.dk', '.com', '.de', '.eu', '_amazon', '_store']:
        if old_store_id.lower().endswith(suffix):
            base = old_store_id[:-len(suffix)]
            base_normalized = generate_id(base)
            if base_normalized in valid_store_ids:
                return base_normalized

    # 5. Check case-insensitive match
    old_lower = old_store_id.lower()
    for valid_id in valid_store_ids:
        if valid_id.lower() == old_lower:
            return valid_id

    return None


def update_store_references(
    data_dir: Path,
    stores_dir: Path,
    id_mapping: dict[str, str],
    dry_run: bool,
    report: MigrationReport
) -> int:
    """Update store_id references and migrate spool_refill in all sizes.json files.

    Normalizes store_id values to match existing store IDs.
    Uses multiple strategies to find the correct store ID:
    1. Explicit mappings discovered during store migration
    2. Direct match with existing store IDs
    3. Normalized form matching
    4. Fuzzy matching for common patterns

    Also migrates spool_refill from purchase_link level to size level.

    Args:
        data_dir: Path to the data directory.
        stores_dir: Path to the stores directory.
        id_mapping: Dictionary mapping old store IDs to new store IDs
                    (built dynamically during store migration).
        dry_run: If True, don't actually modify files.
        report: MigrationReport to add issues to.

    Returns:
        Count of sizes.json files updated.
    """
    print(f"\nUpdating store_id references...")

    # Get all valid store IDs from the stores directory
    valid_store_ids = get_valid_store_ids(stores_dir)
    print(f"  Found {len(valid_store_ids)} valid stores")

    if id_mapping:
        print(f"  Discovered mappings: {id_mapping}")

    count = 0
    unmatched_stores: set[str] = set()

    # Find all sizes.json files
    for sizes_file in data_dir.rglob('sizes.json'):
        data = load_json(sizes_file)
        if data is None:
            continue

        file_changed = False

        # sizes.json is a list of size objects
        if isinstance(data, list):
            # First, migrate spool_refill from purchase_link level to size level
            data, spool_refill_changed = migrate_spool_refill(data)
            if spool_refill_changed:
                print(f"  {sizes_file.relative_to(data_dir)}: migrated spool_refill")
                file_changed = True

            # Then update store_id references
            for size_obj in data:
                if not isinstance(size_obj, dict):
                    continue
                purchase_links = size_obj.get('purchase_links', [])
                if not isinstance(purchase_links, list):
                    continue

                for link in purchase_links:
                    if not isinstance(link, dict):
                        continue
                    old_store_id = link.get('store_id')
                    if not old_store_id:
                        continue

                    # Find the matching store ID
                    new_store_id = find_matching_store_id(
                        old_store_id, id_mapping, valid_store_ids
                    )

                    if new_store_id is None:
                        # No match found - track for reporting
                        unmatched_stores.add(old_store_id)
                        continue

                    if old_store_id != new_store_id:
                        link['store_id'] = new_store_id
                        print(f"  {sizes_file.relative_to(data_dir)}: "
                              f"{old_store_id} -> {new_store_id}")
                        file_changed = True

        if file_changed:
            save_json(sizes_file, data, dry_run)
            count += 1

    # Report unmatched stores
    for store_id in sorted(unmatched_stores):
        report.add_issue(
            "Unknown store reference",
            "sizes.json files",
            f"store_id '{store_id}' does not match any known store"
        )

    return count


def main():
    parser = argparse.ArgumentParser(
        description='Migrate data files to new schema format'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview changes without modifying files'
    )
    parser.add_argument(
        '--data-only',
        action='store_true',
        help='Only process data directory (skip stores)'
    )
    parser.add_argument(
        '--stores-only',
        action='store_true',
        help='Only process stores directory (skip data)'
    )
    args = parser.parse_args()

    # Determine paths relative to script location
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent
    data_dir = repo_root / 'data'
    stores_dir = repo_root / 'stores'

    if args.dry_run:
        print("=== DRY RUN MODE - No files will be modified ===\n")

    total_changes = 0
    report = MigrationReport()

    # Process stores directory FIRST to build the ID mapping
    # This mapping is needed to update store_id references in data files
    store_id_mapping: dict[str, str] = {}
    valid_store_ids: set[str] = set()
    if not args.data_only:
        if stores_dir.exists():
            print("Processing stores directory...")
            store_count, store_id_mapping = process_stores_directory(
                stores_dir, args.dry_run
            )
            # Get valid store IDs after processing (folder names after migration)
            valid_store_ids = get_valid_store_ids(stores_dir)
            total_changes += store_count
            print(f"\n--- Stores Summary ---")
            print(f"  Stores modified: {store_count}")
            print(f"  Valid store IDs: {len(valid_store_ids)}")
            if store_id_mapping:
                print(f"  ID mappings discovered: {len(store_id_mapping)}")
        else:
            print(f"Stores directory not found: {stores_dir}")
    else:
        # Even if skipping stores, we need valid IDs to update references
        valid_store_ids = get_valid_store_ids(stores_dir)

    # Process data directory (includes store_id reference updates during variant migration)
    if not args.stores_only:
        if data_dir.exists():
            print("\nProcessing data directory...")
            stats = process_data_directory(
                data_dir, args.dry_run, report, store_id_mapping, valid_store_ids
            )
            total_changes += sum(stats.values())
            print(f"\n--- Data Summary ---")
            print(f"  Brands modified: {stats['brands']}")
            print(f"  Materials modified: {stats['materials']}")
            print(f"  Filaments modified: {stats['filaments']}")
            print(f"  Variants modified: {stats['variants']}")
        else:
            print(f"Data directory not found: {data_dir}")

    print(f"\n{'=' * 40}")
    if args.dry_run:
        print(f"DRY RUN COMPLETE: {total_changes} items would be modified")
    else:
        print(f"MIGRATION COMPLETE: {total_changes} items modified")

    # Print any issues encountered
    report.print_summary()


if __name__ == '__main__':
    main()
