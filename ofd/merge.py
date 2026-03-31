"""
OFD Merge Utilities.

Shared functions for merging filament data directories. Used by the
merge_data script and the import_openprinttag script.

Merge strategy: existing data wins. New data only fills gaps (missing
keys, empty strings, empty lists). For sizes.json arrays, entries are
deduplicated by (filament_weight, diameter).
"""

import json
import shutil
from pathlib import Path
from typing import Any


def load_json(path: Path) -> Any | None:
    """Load JSON with error handling."""
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def save_json(path: Path, data: Any) -> None:
    """Save JSON with consistent 2-space formatting."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def merge_dicts(existing: dict, new: dict) -> dict:
    """Merge new dict into existing, only filling gaps.

    A gap is a key that is missing, None, an empty string, or an empty list
    in the existing dict. Existing values are never overwritten.
    """
    result = existing.copy()
    for key, value in new.items():
        existing_value = result.get(key)
        if existing_value is None or existing_value == "" or existing_value == []:
            result[key] = value
    return result


def merge_sizes(existing: list[dict], new: list[dict]) -> list[dict]:
    """Merge sizes arrays, deduplicating by (filament_weight, diameter).

    Existing entries are kept as-is. New entries are appended only if their
    (weight, diameter) key doesn't already exist.
    """
    result = list(existing)
    existing_keys = {
        (s.get("filament_weight"), s.get("diameter")) for s in existing
    }
    for size in new:
        key = (size.get("filament_weight"), size.get("diameter"))
        if key not in existing_keys:
            result.append(size)
            existing_keys.add(key)
    return result


def merge_json_file(target: Path, source: Path) -> bool:
    """Merge a single JSON file from source into target.

    For dicts: fills gaps. For sizes arrays: deduplicates by key.
    Returns True if target was modified.
    """
    source_data = load_json(source)
    if source_data is None:
        return False

    if not target.exists():
        save_json(target, source_data)
        return True

    target_data = load_json(target)
    if target_data is None:
        # Target is corrupt, replace with source
        save_json(target, source_data)
        return True

    if isinstance(target_data, dict) and isinstance(source_data, dict):
        merged = merge_dicts(target_data, source_data)
        if merged != target_data:
            save_json(target, merged)
            return True
    elif isinstance(target_data, list) and isinstance(source_data, list):
        merged = merge_sizes(target_data, source_data)
        if merged != target_data:
            save_json(target, merged)
            return True

    return False


def merge_trees(target_dir: Path, source_dir: Path, dry_run: bool = False) -> list[str]:
    """Recursively merge source_dir into target_dir.

    - JSON files are merged (dicts fill gaps, size arrays deduplicate)
    - Non-JSON files (logos, etc.) are copied only if missing in target
    - Directories are created as needed

    Returns a list of action descriptions.
    """
    actions: list[str] = []

    if not source_dir.is_dir():
        return actions

    for source_path in sorted(source_dir.rglob("*")):
        rel = source_path.relative_to(source_dir)
        target_path = target_dir / rel

        if source_path.is_dir():
            if not target_path.exists():
                if dry_run:
                    actions.append(f"Would create directory: {rel}")
                else:
                    target_path.mkdir(parents=True, exist_ok=True)
                    actions.append(f"Created directory: {rel}")
            continue

        if source_path.suffix == ".json":
            if not target_path.exists():
                if dry_run:
                    actions.append(f"Would copy: {rel}")
                else:
                    target_path.parent.mkdir(parents=True, exist_ok=True)
                    save_json(target_path, load_json(source_path))
                    actions.append(f"Copied: {rel}")
            else:
                if dry_run:
                    # Check if merge would change anything
                    source_data = load_json(source_path)
                    target_data = load_json(target_path)
                    if isinstance(target_data, dict) and isinstance(source_data, dict):
                        merged = merge_dicts(target_data, source_data)
                        if merged != target_data:
                            actions.append(f"Would merge: {rel}")
                    elif isinstance(target_data, list) and isinstance(source_data, list):
                        merged = merge_sizes(target_data, source_data)
                        if merged != target_data:
                            actions.append(f"Would merge: {rel}")
                else:
                    if merge_json_file(target_path, source_path):
                        actions.append(f"Merged: {rel}")
        else:
            # Non-JSON files (logos, etc.) - copy only if missing
            if not target_path.exists():
                if dry_run:
                    actions.append(f"Would copy: {rel}")
                else:
                    target_path.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source_path, target_path)
                    actions.append(f"Copied: {rel}")

    return actions
