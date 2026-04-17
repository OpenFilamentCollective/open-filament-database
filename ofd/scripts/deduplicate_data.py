"""
Deduplicate Data Script - Find and merge duplicate filament directories.

Scans the data directory for filament directories whose names are
word-order variants of each other (e.g. ``cf_pla`` vs ``pla_cf``) or
contain doubled modifier segments (e.g. ``pla_cf_cf``).  Detected
duplicates are merged into a canonical target using the standard
merge_trees utility, and optionally deleted.

Detection strategy:
- **Word-swap groups**: filament dirs within the same material folder
  whose underscore-separated words form the same multiset
  (``collections.Counter``).  E.g. ``cf_pla`` and ``pla_cf``.
- **Doubled modifiers**: filament dirs with consecutive repeated
  segments.  E.g. ``pla_cf_cf`` → ``pla_cf``.
- **Material-type redundancy**: filament dirs that include the parent
  material type as a redundant word (e.g. ``matte_pla`` under ``PLA/``
  when sibling ``matte`` already exists).  The shorter form is always
  kept as canonical.

Target selection (what to keep):
- Within each duplicate group, the directory whose first git commit is
  the oldest is preferred (original data).  Ties break by shorter name,
  then lexicographic order.

Merge strategy:
- Same as merge_data: existing values in the target win; new data only
  fills missing/empty fields.  Sizes are deduplicated by
  (filament_weight, diameter).

Examples:
    # Preview what would be merged
    ofd script deduplicate_data --dry-run

    # Merge and delete duplicate sources
    ofd script deduplicate_data --delete-source

    # Restrict scan to a single brand
    ofd script deduplicate_data --brand bambu_lab --delete-source
"""

import argparse
import json
import shutil
import subprocess
from collections import Counter
from pathlib import Path

from ofd.base import BaseScript, ScriptResult, register_script
from ofd.merge import merge_has_errors, merge_trees, save_json


def _has_doubled_segment(name: str) -> bool:
    """Check if name has a consecutive repeated word segment.

    Examples: ``pla_cf_cf`` (cf repeated), ``pla_glow_glow`` (glow repeated).
    """
    parts = name.split("_")
    for length in range(1, len(parts) // 2 + 1):
        for i in range(len(parts) - 2 * length + 1):
            if parts[i : i + length] == parts[i + length : i + 2 * length]:
                return True
    return False


def _remove_doubled_segments(name: str) -> str:
    """Remove consecutive repeated word segments.

    ``pla_cf_cf`` → ``pla_cf``, ``pla_glow_glow_glow`` → ``pla_glow``.
    Applied iteratively until stable.
    """
    prev = None
    while name != prev:
        prev = name
        parts = name.split("_")
        result: list[str] = []
        i = 0
        while i < len(parts):
            removed = False
            for length in range(len(parts) // 2, 0, -1):
                if i + 2 * length <= len(parts):
                    chunk = parts[i : i + length]
                    if chunk == parts[i + length : i + 2 * length]:
                        result.extend(chunk)
                        i += 2 * length
                        removed = True
                        break
            if not removed:
                result.append(parts[i])
                i += 1
        name = "_".join(result)
    return name


def _strip_material_type(name: str, material: str) -> str | None:
    """Remove the parent material type word from a filament directory name.

    Returns the shortened name, or ``None`` if the material word is not
    present or removing it would produce an empty string.

    Examples (material=``"pla"``):
        ``"matte_pla"``        → ``"matte"``
        ``"pla_basic"``        → ``"basic"``
        ``"tpu_filaflex_82a"`` → ``"filaflex_82a"``  (material=``"tpu"``)
        ``"pla"``              → ``None``
    """
    parts = name.split("_")
    if material not in parts:
        return None
    remaining = [p for p in parts if p != material]
    return "_".join(remaining) if remaining else None


def _git_first_commit_timestamp(path: str) -> int:
    """Return the unix timestamp of the earliest commit that added *path*.

    Falls back to a large value so unknown paths sort last.
    """
    try:
        r = subprocess.run(
            ["git", "log", "--diff-filter=A", "--format=%at", "--follow", "--", path + "/"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        timestamps = [int(t) for t in r.stdout.strip().split("\n") if t.strip()]
        return min(timestamps) if timestamps else 10**12
    except Exception:
        return 10**12


@register_script
class DeduplicateDataScript(BaseScript):
    """Find and merge duplicate filament directories."""

    name = "deduplicate_data"
    description = "Detect and merge duplicate filament directories (word-swaps, doubled modifiers, material-type redundancy)"

    def configure_parser(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument(
            "--brand",
            type=str,
            default=None,
            help="Only scan a specific brand directory (e.g. bambu_lab)",
        )
        parser.add_argument(
            "--delete-source",
            action="store_true",
            help="Delete duplicate source directories after merging",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview detected duplicates and planned merges without modifying files",
        )

    def run(self, args: argparse.Namespace) -> ScriptResult:
        dry_run = getattr(args, "dry_run", False)
        delete_source = getattr(args, "delete_source", False)
        brand_filter = getattr(args, "brand", None)

        # ── 1. Collect filament dirs ────────────────────────────────
        brand_dirs = sorted(self.data_dir.iterdir())
        if brand_filter:
            brand_dirs = [d for d in brand_dirs if d.name == brand_filter]
            if not brand_dirs:
                return ScriptResult(
                    success=False, message=f"Brand not found: {brand_filter}"
                )

        # mat_path -> [filament_dir_name, ...]
        filament_dirs: dict[Path, list[str]] = {}
        for brand in brand_dirs:
            if not brand.is_dir():
                continue
            for mat in sorted(brand.iterdir()):
                if not mat.is_dir():
                    continue
                names = sorted(d.name for d in mat.iterdir() if d.is_dir())
                if names:
                    filament_dirs[mat] = names

        # ── 2. Detect word-swap duplicate groups ────────────────────
        groups: list[tuple[Path, list[str]]] = []
        for mat_path, names in filament_dirs.items():
            buckets: dict[tuple, list[str]] = {}
            for n in names:
                key = tuple(sorted(Counter(n.split("_")).items()))
                buckets.setdefault(key, []).append(n)
            for _key, grp in buckets.items():
                if len(grp) > 1:
                    groups.append((mat_path, grp))

        # ── 3. Detect standalone doubled-modifier dirs ──────────────
        # (not already part of a word-swap group)
        in_group: set[str] = set()
        for mat_path, grp in groups:
            for n in grp:
                in_group.add(str(mat_path / n))

        doubled_standalone: list[tuple[Path, str]] = []
        for mat_path, names in filament_dirs.items():
            for n in names:
                if str(mat_path / n) not in in_group and _has_doubled_segment(n):
                    doubled_standalone.append((mat_path, n))

        # ── 4. Detect material-type-redundant pairs ────────────────
        # E.g. matte_pla + matte under PLA/ — the longer form
        # redundantly includes the parent material type.
        material_redundant: list[tuple[Path, str, str]] = []
        for mat_path, names in filament_dirs.items():
            material = mat_path.name.lower()
            name_set = set(names)
            for n in names:
                if str(mat_path / n) in in_group:
                    continue
                stripped = _strip_material_type(n, material)
                if stripped is not None and stripped in name_set and stripped != n:
                    material_redundant.append((mat_path, n, stripped))

        if not groups and not doubled_standalone and not material_redundant:
            self.log("No duplicates found.")
            return ScriptResult(success=True, message="No duplicates found")

        # ── 4. Plan merges ──────────────────────────────────────────
        # For each group: pick canonical target, merge others into it.
        # For doubled standalone: rename to clean name (merge if clean exists).
        merge_plan: list[tuple[Path, Path]] = []  # (source, target)
        rename_plan: list[tuple[Path, Path]] = []  # (old, new) for doubled-only

        for mat_path, grp in groups:
            # Sort by: git age (oldest first), no doubled segments, shorter, alpha
            grp_scored = sorted(
                grp,
                key=lambda n: (
                    _git_first_commit_timestamp(str(mat_path / n)),
                    _has_doubled_segment(n),
                    len(n),
                    n,
                ),
            )
            target_name = grp_scored[0]
            for source_name in grp_scored[1:]:
                merge_plan.append((mat_path / source_name, mat_path / target_name))

            # If the surviving target has doubled segments, schedule a rename
            if _has_doubled_segment(target_name):
                clean = _remove_doubled_segments(target_name)
                if clean != target_name:
                    clean_path = mat_path / clean
                    if clean_path.exists() and clean_path != mat_path / target_name:
                        # Clean name already exists — merge into it
                        merge_plan.append((mat_path / target_name, clean_path))
                    else:
                        rename_plan.append((mat_path / target_name, clean_path))

        for mat_path, name in doubled_standalone:
            clean = _remove_doubled_segments(name)
            if clean != name:
                clean_path = mat_path / clean
                if clean_path.exists():
                    merge_plan.append((mat_path / name, clean_path))
                else:
                    rename_plan.append((mat_path / name, clean_path))

        # Material-redundant: always merge the longer name into the
        # shorter canonical form (no git-age tiebreaking needed).
        for mat_path, source_name, target_name in material_redundant:
            merge_plan.append((mat_path / source_name, mat_path / target_name))

        # ── 6. Report plan ──────────────────────────────────────────
        self.log(f"Found {len(groups)} word-swap group(s), "
                 f"{len(doubled_standalone)} doubled-modifier dir(s), "
                 f"{len(material_redundant)} material-type-redundant pair(s)")
        self.log("")

        if merge_plan:
            self.log(f"{'Planned' if dry_run else 'Executing'} {len(merge_plan)} merge(s):")
            for src, tgt in merge_plan:
                self.log(f"  {src.relative_to(self.data_dir)} -> "
                         f"{tgt.relative_to(self.data_dir)}")

        if rename_plan:
            self.log(f"\n{'Planned' if dry_run else 'Executing'} {len(rename_plan)} rename(s):")
            for old, new in rename_plan:
                self.log(f"  {old.relative_to(self.data_dir)} -> {new.name}")

        if dry_run:
            total = len(merge_plan) + len(rename_plan)
            return ScriptResult(
                success=True,
                message=f"Dry run: {total} operation(s) planned",
                data={"merges": len(merge_plan), "renames": len(rename_plan)},
            )

        # ── 6. Execute merges ───────────────────────────────────────
        merge_ok = 0
        merge_fail = 0
        all_actions: list[str] = []

        for src, tgt in merge_plan:
            if not src.exists():
                continue
            self.log(f"\nMerging: {src.name} -> {tgt.name}")
            actions = merge_trees(tgt, src)
            all_actions.extend(actions)
            for a in actions:
                self.log(f"  {a}")
            if not actions:
                self.log("  No changes needed")

            if delete_source and not merge_has_errors(actions):
                shutil.rmtree(src)
                self.log(f"  Deleted: {src.name}")
                merge_ok += 1
            elif delete_source:
                self.log(f"  Source NOT deleted (merge had errors)")
                merge_fail += 1
            else:
                merge_ok += 1

        # ── 7. Execute renames ──────────────────────────────────────
        rename_ok = 0
        for old, new in rename_plan:
            if not old.exists():
                continue
            self.log(f"\nRenaming: {old.name} -> {new.name}")
            old.rename(new)

            # Update the id field in filament.json
            filament_json = new / "filament.json"
            if filament_json.exists():
                try:
                    with open(filament_json, encoding="utf-8") as f:
                        data = json.load(f)
                    if isinstance(data, dict) and data.get("id") != new.name:
                        data["id"] = new.name
                        save_json(filament_json, data)
                        self.log(f"  Updated id in filament.json")
                except Exception:
                    pass
            rename_ok += 1

        # ── 8. Summary ──────────────────────────────────────────────
        self.log(f"\n{'=' * 40}")
        self.log("DEDUPLICATION SUMMARY")
        self.log(f"{'=' * 40}")
        self.log(f"Merges: {merge_ok} succeeded"
                 + (f", {merge_fail} had errors" if merge_fail else ""))
        if rename_ok:
            self.log(f"Renames: {rename_ok}")

        return ScriptResult(
            success=merge_fail == 0,
            message=f"Deduplication complete: {merge_ok} merge(s), {rename_ok} rename(s)",
            data={
                "merges": merge_ok,
                "merge_errors": merge_fail,
                "renames": rename_ok,
            },
        )
