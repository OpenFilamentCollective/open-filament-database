"""
Generate UID Migration Script.

Produces a mapping from the previous (name-derived) entity UUIDs to the new
(id-derived) entity UUIDs after the filament UUID-derivation switch in
ofd/builder/crawler.py.

The filament UUID derivation changed from `generate_filament_id(brand, material, NAME)`
to `generate_filament_id(brand, material, ID)`. That change cascades into every
downstream entity whose UUID is derived from the filament UUID:

  - filament
  - variant   (variant_id is derived from filament_id + variant.id)
  - size      (size_id is derived from variant_id + size fields)
  - purchase_link (pl_id is derived from size_id + store_id + url)

Brand, material, and store UUIDs are unchanged.

Output is a single JSON file. Top-level keys:
  - `mapping`: flat `{old_uid: new_uid}` dictionary (only unambiguous entries)
  - `old_filament_collisions`: filament folders that derived the same old UUID
    (omitted when none)
  - `ambiguous_mappings`: `{old_uid: [new_uid, ...]}` for old UUIDs that could
    resolve to more than one new UUID (omitted when none). Consumers must
    decide per-case; these entries are NOT included in `mapping` to avoid
    silent overwrites.
  - `parse_errors`: list of `{path, error}` for JSON files that could not be
    read (omitted when none). The script exits non-zero when this list is
    non-empty so CI catches incomplete migrations.

Usage:
    ofd script generate_uid_migration
    ofd script generate_uid_migration --output uid_migration.json
    ofd script generate_uid_migration --csv uid_migration.csv
"""

import argparse
import csv
import json
from pathlib import Path
from typing import Any

from ofd.base import BaseScript, ScriptResult, register_script
from ofd.builder.utils import (
    generate_brand_id,
    generate_filament_id,
    generate_material_id,
    generate_purchase_link_id,
    generate_size_id,
    generate_store_id,
    generate_variant_id,
)


@register_script
class GenerateUidMigrationScript(BaseScript):
    name = "generate_uid_migration"
    description = (
        "Generate a flat {old_uid: new_uid} mapping for entities whose UUIDs "
        "changed when filament UUID derivation switched from name to id."
    )

    def configure_parser(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument(
            "--output",
            "-o",
            default="uid_migration.json",
            help="Path to write the JSON mapping (default: uid_migration.json)",
        )
        parser.add_argument(
            "--csv",
            metavar="PATH",
            help="Also write a flat CSV with columns old_id,new_id",
        )
        parser.add_argument(
            "--data-dir",
            default=None,
            help="Override data directory (default: project_root/data)",
        )
        parser.add_argument(
            "--stores-dir",
            default=None,
            help="Override stores directory (default: project_root/stores)",
        )

    def run(self, args: argparse.Namespace) -> ScriptResult:
        data_dir = Path(args.data_dir) if args.data_dir else self.data_dir
        stores_dir = Path(args.stores_dir) if args.stores_dir else self.stores_dir

        if not data_dir.exists():
            return ScriptResult(success=False, message=f"Data directory not found: {data_dir}")
        if not stores_dir.exists():
            return ScriptResult(success=False, message=f"Stores directory not found: {stores_dir}")

        # Collected during the walk
        parse_errors: list[dict[str, str]] = []
        old_filament_collisions: dict[str, list[str]] = {}
        # Candidates per old_id; multiple distinct new_ids means ambiguous.
        candidates: dict[str, set[str]] = {}

        def load_json(path: Path) -> Any:
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                try:
                    rel = str(path.relative_to(self.project_root))
                except ValueError:
                    rel = str(path)
                parse_errors.append({"path": rel, "error": str(exc)})
                return None

        def record(old_id: str, new_id: str) -> None:
            if old_id == new_id:
                return
            candidates.setdefault(old_id, set()).add(new_id)

        store_uuid_by_source_id = self._build_store_uuid_index(stores_dir, load_json)

        for brand_dir in sorted(data_dir.iterdir()):
            if not brand_dir.is_dir() or brand_dir.name.startswith("."):
                continue
            brand_id = generate_brand_id(brand_dir.name)

            for material_dir in sorted(brand_dir.iterdir()):
                if not material_dir.is_dir() or material_dir.name.startswith("."):
                    continue
                material_id = generate_material_id(brand_id, material_dir.name)

                for filament_dir in sorted(material_dir.iterdir()):
                    if not filament_dir.is_dir() or filament_dir.name.startswith("."):
                        continue
                    filament_json = filament_dir / "filament.json"
                    if not filament_json.exists():
                        continue
                    filament_data = load_json(filament_json)
                    if filament_data is None:
                        continue

                    filament_source_id = filament_data.get("id", filament_dir.name)
                    filament_name = filament_data.get("name", filament_dir.name)

                    old_fid = generate_filament_id(brand_id, material_id, filament_name)
                    new_fid = generate_filament_id(brand_id, material_id, filament_source_id)

                    old_filament_collisions.setdefault(old_fid, []).append(
                        f"{brand_dir.name}/{material_dir.name}/{filament_dir.name}"
                    )

                    record(old_fid, new_fid)

                    for variant_dir in sorted(filament_dir.iterdir()):
                        if not variant_dir.is_dir() or variant_dir.name.startswith("."):
                            continue
                        variant_json = variant_dir / "variant.json"
                        if not variant_json.exists():
                            continue
                        variant_data = load_json(variant_json)
                        if variant_data is None:
                            continue

                        variant_source_id = variant_data.get("id", variant_dir.name)
                        old_vid = generate_variant_id(old_fid, variant_source_id)
                        new_vid = generate_variant_id(new_fid, variant_source_id)
                        record(old_vid, new_vid)

                        sizes_json = variant_dir / "sizes.json"
                        if not sizes_json.exists():
                            continue
                        sizes_data = load_json(sizes_json)
                        if sizes_data is None:
                            continue
                        if not isinstance(sizes_data, list):
                            sizes_data = [sizes_data]

                        for idx, size_entry in enumerate(sizes_data):
                            if not isinstance(size_entry, dict):
                                continue
                            if size_entry.get("filament_weight") is None:
                                continue

                            old_sid = generate_size_id(old_vid, size_entry, idx)
                            new_sid = generate_size_id(new_vid, size_entry, idx)
                            record(old_sid, new_sid)

                            for pl_entry in size_entry.get("purchase_links") or []:
                                if not isinstance(pl_entry, dict):
                                    continue
                                source_store_id = pl_entry.get("store_id")
                                url = pl_entry.get("url")
                                if not source_store_id or not url:
                                    continue
                                store_uuid = store_uuid_by_source_id.get(source_store_id)
                                if not store_uuid:
                                    continue

                                old_plid = generate_purchase_link_id(old_sid, store_uuid, url)
                                new_plid = generate_purchase_link_id(new_sid, store_uuid, url)
                                record(old_plid, new_plid)

        # Resolve candidates into safe mapping + ambiguous bucket.
        mapping: dict[str, str] = {}
        ambiguous: dict[str, list[str]] = {}
        for old_id, new_ids in candidates.items():
            if len(new_ids) == 1:
                mapping[old_id] = next(iter(new_ids))
            else:
                ambiguous[old_id] = sorted(new_ids)

        collisions = [
            {"old_id": old_fid, "locations": sorted(locs)}
            for old_fid, locs in sorted(old_filament_collisions.items())
            if len(locs) > 1
        ]

        output_path = Path(args.output)
        if not output_path.is_absolute():
            output_path = self.project_root / output_path
        output_path.parent.mkdir(parents=True, exist_ok=True)

        payload: dict[str, Any] = {"mapping": mapping}
        if collisions:
            payload["old_filament_collisions"] = collisions
        if ambiguous:
            payload["ambiguous_mappings"] = ambiguous
        if parse_errors:
            payload["parse_errors"] = parse_errors

        output_path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )

        csv_path: Path | None = None
        if args.csv:
            csv_path = Path(args.csv)
            if not csv_path.is_absolute():
                csv_path = self.project_root / csv_path
            csv_path.parent.mkdir(parents=True, exist_ok=True)
            with csv_path.open("w", newline="", encoding="utf-8") as fh:
                writer = csv.writer(fh)
                writer.writerow(["old_id", "new_id"])
                for old_id, new_id in mapping.items():
                    writer.writerow([old_id, new_id])

        if not self.json_mode:
            print(f"Wrote {len(mapping):,} mappings to {output_path}")
            if csv_path:
                print(f"Wrote CSV to {csv_path}")
            if collisions:
                print(
                    f"WARNING: {len(collisions)} old filament UUID(s) "
                    "collided across multiple folders — see "
                    "`old_filament_collisions` in the JSON output"
                )
            if ambiguous:
                print(
                    f"WARNING: {len(ambiguous):,} old UUID(s) resolve to multiple "
                    "new UUIDs and were excluded from `mapping`; see "
                    "`ambiguous_mappings` in the JSON output"
                )
            if parse_errors:
                print(
                    f"ERROR: {len(parse_errors)} JSON file(s) failed to parse; "
                    "see `parse_errors` in the JSON output"
                )

        # Surface parse errors as a non-zero exit so CI catches incomplete output.
        success = not parse_errors
        message_parts = [f"Generated {len(mapping)} UID mappings"]
        if ambiguous:
            message_parts.append(f"{len(ambiguous)} ambiguous")
        if parse_errors:
            message_parts.append(f"{len(parse_errors)} parse errors")
        message = "; ".join(message_parts)

        return ScriptResult(
            success=success,
            message=message,
            data={
                "output": str(output_path),
                "csv": str(csv_path) if csv_path else None,
                "count": len(mapping),
                "collision_count": len(collisions),
                "ambiguous_count": len(ambiguous),
                "parse_error_count": len(parse_errors),
            },
        )

    def _build_store_uuid_index(self, stores_dir: Path, load_json) -> dict[str, str]:
        """Map source store id (from store.json) -> derived store UUID."""
        index: dict[str, str] = {}
        for store_dir in sorted(stores_dir.iterdir()):
            if not store_dir.is_dir() or store_dir.name.startswith("."):
                continue
            store_json = store_dir / "store.json"
            if not store_json.exists():
                continue
            data = load_json(store_json)
            if data is None:
                continue
            source_id = data.get("id")
            if not source_id:
                continue
            index[source_id] = generate_store_id(source_id)
        return index
