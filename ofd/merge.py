"""
OFD Merge Utilities.

Shared functions for merging filament data directories. Used by the
merge_data script, style_data script, and import_openprinttag script.

Merge strategy: existing data always wins. New data only fills gaps
(missing keys, empty strings, empty lists). For sizes.json arrays,
entries are deduplicated by (filament_weight, diameter).

Safety guarantees:
- merge_trees() raises ValueError if source and target paths overlap
  (same path, or one is a parent of the other).
- Unreadable JSON files are skipped with a "Skipped (unreadable)" action
  rather than writing null to the target.
- Callers should check merge_has_errors() before deleting the source
  directory to avoid data loss from partial merges.
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


def size_dedupe_key(size: dict) -> tuple:
    """The (filament_weight, diameter) identity used to dedupe/pair spools.

    Single-sourced so :func:`merge_sizes` and :func:`ofd.uuids.record_moved_from`
    pair spools identically — if they diverged, record_moved_from would attach a
    deleted spool's UUID to the wrong survivor (or lose it).
    """
    return (size.get("filament_weight"), size.get("diameter"))


def merge_sizes(existing: list[dict], new: list[dict]) -> list[dict]:
    """Merge sizes arrays, deduplicating by (filament_weight, diameter).

    Existing entries are kept as-is. New entries are appended only if their
    (weight, diameter) key doesn't already exist.
    """
    result = list(existing)
    existing_keys = {size_dedupe_key(s) for s in existing}
    for size in new:
        key = size_dedupe_key(size)
        if key not in existing_keys:
            result.append(size)
            existing_keys.add(key)
    return result


def merge_json_file(target: Path, source: Path) -> bool:
    """Merge a single JSON file from source into target.

    For dicts: uses merge_dicts (fills gaps only, existing values win).
    For lists: uses merge_sizes (deduplicates by filament_weight/diameter).

    Returns True if target was modified. Returns False if source is
    unreadable or no changes were needed.
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


def paths_overlap(a: Path, b: Path) -> bool:
    """Check if two paths are the same or one is a parent of the other."""
    a = a.resolve()
    b = b.resolve()
    return a == b or a in b.parents or b in a.parents


def merge_has_errors(actions: list[str]) -> bool:
    """Check if any merge actions indicate failures (skipped/unreadable files)."""
    return any(a.startswith("Skipped") for a in actions)


def merge_trees(target_dir: Path, source_dir: Path, dry_run: bool = False) -> list[str]:
    """Recursively merge source_dir into target_dir.

    - JSON files are merged (dicts fill gaps, size arrays deduplicate)
    - Non-JSON files (logos, etc.) are copied only if missing in target
    - Directories are created as needed

    Returns a list of action descriptions. Entries starting with "Skipped"
    indicate failures; callers should check merge_has_errors() before
    deleting the source.

    Raises ValueError if source and target overlap.
    """
    actions: list[str] = []

    if not source_dir.is_dir():
        return actions

    if paths_overlap(target_dir, source_dir):
        raise ValueError(f"Source and target must not overlap: {source_dir} / {target_dir}")

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
            source_data = load_json(source_path)
            if source_data is None:
                actions.append(f"Skipped (unreadable): {rel}")
                continue

            if not target_path.exists():
                if dry_run:
                    actions.append(f"Would copy: {rel}")
                else:
                    target_path.parent.mkdir(parents=True, exist_ok=True)
                    save_json(target_path, source_data)
                    actions.append(f"Copied: {rel}")
            else:
                if dry_run:
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
