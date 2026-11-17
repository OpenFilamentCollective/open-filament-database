"""
Add container_material Script.

The boolean ``spool_refill`` (on a size, or the older per-purchase-link copy) is
deprecated in favour of ``container_material``. For every size in every
``sizes.json`` that has no ``container_material`` yet:

    spool_refill = true (size, or any purchase link)        ->  "refill"
    otherwise                                               ->  left alone

Nothing else is inferred: the data never recorded the spool material, so
"plastic" and "cardboard" are left for people to fill in.

The script only ever *adds* the key: ``spool_refill`` and everything else is kept,
and an existing ``container_material`` is never overwritten. Keys are written in
schema order, matching the ``style_data`` convention.

Usage:
    ofd script migrate_spool_refill --dry-run     # preview, change nothing
    ofd script migrate_spool_refill               # apply changes
    ofd script migrate_spool_refill --json        # machine-readable summary
"""

import argparse
import json
from pathlib import Path
from typing import Any

from ofd.base import BaseScript, ScriptResult, register_script


def _size_order(schemas_dir: Path) -> list[str]:
    with open(schemas_dir / "sizes_schema.json", encoding="utf-8") as f:
        return list(json.load(f)["items"]["properties"].keys())


def migrate_size(size: dict[str, Any]) -> tuple[dict[str, Any], bool, str | None]:
    """Return (new_size, changed, added_material) without mutating the input.

    Only ever adds ``container_material``; nothing is removed or overwritten.
    """
    if "container_material" in size:
        return size, False, None

    links = size.get("purchase_links")
    is_refill = size.get("spool_refill") is True or (
        isinstance(links, list)
        and any(isinstance(link, dict) and link.get("spool_refill") is True for link in links)
    )
    if not is_refill:
        return size, False, None
    material = "refill"

    return {**size, "container_material": material}, True, material


@register_script
class MigrateSpoolRefillScript(BaseScript):
    """Add container_material alongside the deprecated spool_refill boolean."""

    name = "migrate_spool_refill"
    description = "Add container_material=refill to sizes flagged with the deprecated spool_refill; removes nothing"

    def configure_parser(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument(
            "--dry-run", action="store_true", help="Preview changes without modifying files"
        )

    def run(self, args: argparse.Namespace) -> ScriptResult:
        dry_run = getattr(args, "dry_run", False)

        if not self.data_dir.exists():
            return ScriptResult(success=False, message=f"Data directory not found: {self.data_dir}")

        order = _size_order(self.schemas_dir)
        rank = {k: i for i, k in enumerate(order)}

        if dry_run:
            self.log("=== DRY RUN - no files will be modified ===\n")

        files_modified = 0
        added = {"refill": 0}
        changes: list[str] = []

        for sizes_file in sorted(self.data_dir.glob("*/*/*/*/sizes.json")):
            try:
                with open(sizes_file, encoding="utf-8") as f:
                    data = json.load(f)
            except (json.JSONDecodeError, OSError):
                continue
            if not isinstance(data, list):
                continue

            new_data = []
            file_changed = False
            for size in data:
                if not isinstance(size, dict):
                    new_data.append(size)
                    continue
                new, changed, material = migrate_size(size)
                if changed:
                    file_changed = True
                    # Known keys in schema order, unknown keys keep their place at the end
                    new = dict(sorted(new.items(), key=lambda kv: rank.get(kv[0], len(rank))))
                if material:
                    added[material] += 1
                new_data.append(new)

            if not file_changed:
                continue

            files_modified += 1
            rel = sizes_file.relative_to(self.project_root)
            changes.append(str(rel))
            self.log(f"  {'Would migrate' if dry_run else 'Migrated'} {rel}")
            if not dry_run:
                with open(sizes_file, "w", encoding="utf-8") as f:
                    json.dump(new_data, f, indent=2, ensure_ascii=False)
                    f.write("\n")

        message = (
            f"{'Would modify' if dry_run else 'Modified'} {files_modified} sizes.json file(s); "
            f"added container_material=refill to {added['refill']} size(s)"
        )
        self.log(f"\n{message}")
        return ScriptResult(
            success=True,
            message=message,
            data={
                "dry_run": dry_run,
                "files_modified": files_modified,
                "added": added,
                "files": changes,
            },
        )
