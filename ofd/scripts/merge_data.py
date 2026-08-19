"""
Merge Data Script - Merge two data directories together.

Merges a source brand/store directory into a target, filling gaps without
overwriting existing data. Useful for fixing duplicate folders (e.g.
merging a hyphenated folder into its underscore counterpart) or combining
data from multiple sources.

Merge strategy:
- JSON dicts: existing values win; new data only fills missing/empty fields.
- sizes.json arrays: deduplicated by (filament_weight, diameter).
- Non-JSON files (logos, etc.): copied only if missing in the target.

Safety:
- Source and target paths must not overlap (same path or parent/child).
- Validation runs via ofd-validator after merging, before any deletion.
- --delete-source only removes the source if both validation passes and
  the merge had no errors (no skipped/unreadable files).

Examples:
    # Merge professional-lab into professional_lab, then delete source
    ofd script merge_data data/professional-lab data/professional_lab --delete-source

    # Preview what would happen
    ofd script merge_data data/professional-lab data/professional_lab --dry-run

    # Merge store directories
    ofd script merge_data stores/old_store stores/new_store
"""

import argparse
import shutil
from pathlib import Path

from ofd.base import BaseScript, ScriptResult, register_script
from ofd.merge import merge_has_errors, merge_trees, paths_overlap
from ofd.uuids import record_moved_from
from ofd.validation import ValidationOrchestrator


@register_script
class MergeDataScript(BaseScript):
    """Merge a source data directory into a target directory.

    Fills gaps without overwriting. Validates after merge and only
    deletes the source when both validation and merge succeed.
    """

    name = "merge_data"
    description = "Merge a source data directory into a target (fills gaps, never overwrites)"

    def configure_parser(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument("source", type=str, help="Source directory to merge from")
        parser.add_argument("target", type=str, help="Target directory to merge into")
        parser.add_argument(
            "--delete-source",
            action="store_true",
            help="Delete the source directory after a successful merge",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview changes without modifying files",
        )

    def run(self, args: argparse.Namespace) -> ScriptResult:
        dry_run = getattr(args, "dry_run", False)
        delete_source = getattr(args, "delete_source", False)

        source = Path(args.source)
        target = Path(args.target)

        # Resolve relative to project root
        if not source.is_absolute():
            source = self.project_root / source
        if not target.is_absolute():
            target = self.project_root / target

        if not source.is_dir():
            return ScriptResult(success=False, message=f"Source not found: {source}")

        if paths_overlap(source, target):
            return ScriptResult(
                success=False,
                message=f"Source and target must not overlap: {source} / {target}",
            )

        self.log(f"Merging: {source.name} -> {target.name}")
        if dry_run:
            self.log("=== DRY RUN ===\n")

        # Perform merge
        actions = merge_trees(target, source, dry_run=dry_run)

        for action in actions:
            self.log(f"  {action}")

        if not actions:
            self.log("  No changes needed (target already has all data)")

        # Validate after merge (unless dry-run)
        validation_data = None
        if not dry_run:
            self.log(f"\n{'=' * 40}")
            self.log("VALIDATING")
            self.log("=" * 40)

            orchestrator = ValidationOrchestrator(
                self.data_dir, self.stores_dir, progress_mode=self.progress_mode
            )
            validation_result = orchestrator.validate_all()
            validation_data = validation_result.to_dict()

            if validation_result.is_valid:
                self.log("Validation passed!")
            else:
                self.log(f"Validation failed: {validation_result.error_count} error(s)")
                for error in validation_result.errors:
                    self.log(f"  {error}")

                if delete_source:
                    self.log("\nSource NOT deleted (validation failed)")

                return ScriptResult(
                    success=False,
                    message=f"Merge done but validation failed: {validation_result.error_count} errors",
                    data={
                        "actions": actions,
                        "source_deleted": False,
                        "validation": validation_data,
                    },
                )

        # Only delete source after validation passes and merge had no errors
        deleted = False
        if delete_source and not dry_run:
            if merge_has_errors(actions):
                self.log("\nSource NOT deleted (merge had skipped/unreadable files)")
            else:
                # Preserve the source's canonical UUIDs so old references still
                # resolve to the surviving target (see ofd.uuids.record_moved_from).
                recorded = record_moved_from(target, source)
                if recorded:
                    self.log(
                        f"Recorded {len(recorded)} former UUID(s) into {target.name} moved_from"
                    )
                shutil.rmtree(source)
                self.log(f"\nDeleted source: {source.name}")
                deleted = True
        elif delete_source and dry_run:
            self.log(f"\nWould delete source: {source.name}")

        # Summary
        self.log(f"\n{'=' * 40}")
        self.log("DRY RUN SUMMARY" if dry_run else "MERGE SUMMARY")
        self.log("=" * 40)
        self.log(f"Actions: {len(actions)}")
        if deleted:
            self.log(f"Source deleted: {source.name}")

        return ScriptResult(
            success=True,
            message=f"Merge complete: {len(actions)} action(s)",
            data={
                "actions": actions,
                "source_deleted": deleted,
                "validation": validation_data,
            },
        )
