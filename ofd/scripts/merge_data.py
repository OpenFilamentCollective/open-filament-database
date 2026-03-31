"""
Merge Data Script - Merge two data directories together.

Merges a source brand/store directory into a target, filling gaps without
overwriting existing data. Useful for fixing duplicate folders (e.g.
merging a hyphenated folder into its underscore counterpart) or combining
data from multiple sources.

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
from ofd.merge import merge_trees
from ofd.validation import ValidationOrchestrator


@register_script
class MergeDataScript(BaseScript):
    """Merge a source data directory into a target directory."""

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

        self.log(f"Merging: {source.name} -> {target.name}")
        if dry_run:
            self.log("=== DRY RUN ===\n")

        # Perform merge
        actions = merge_trees(target, source, dry_run=dry_run)

        for action in actions:
            self.log(f"  {action}")

        if not actions:
            self.log("  No changes needed (target already has all data)")

        # Delete source if requested
        deleted = False
        if delete_source and not dry_run and actions is not None:
            shutil.rmtree(source)
            self.log(f"\nDeleted source: {source.name}")
            deleted = True
        elif delete_source and dry_run:
            self.log(f"\nWould delete source: {source.name}")

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

                return ScriptResult(
                    success=False,
                    message=f"Merge done but validation failed: {validation_result.error_count} errors",
                    data={
                        "actions": actions,
                        "source_deleted": deleted,
                        "validation": validation_data,
                    },
                )

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
