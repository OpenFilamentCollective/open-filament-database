"""
slicer-mapper command — Link filament data to slicer profiles.
"""

import argparse
import json
import sys
from pathlib import Path

from slicer_profiles_db import SlicerType, ProfileStore, ProfileIndex


project_root = Path(__file__).parent.parent.parent


def register_subcommand(subparsers: argparse._SubParsersAction) -> None:
    """Register the slicer-mapper subcommand."""
    parser = subparsers.add_parser(
        "slicer-mapper",
        help="Map filament data to slicer profiles",
        description="Derive slicer_settings and slicer_ids mappings from profile store data.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  ofd slicer-mapper map --dry-run --slicer bambustudio
  ofd slicer-mapper map --slicer bambustudio orcaslicer
  ofd slicer-mapper map --brand bambu_lab --dry-run
        """,
    )

    mapper_subparsers = parser.add_subparsers(
        title="slicer-mapper commands",
        dest="mapper_command",
        required=True,
        metavar="<command>",
    )

    # --- map ---
    map_parser = mapper_subparsers.add_parser(
        "map",
        help="Derive and write filament-to-profile mappings",
    )
    map_parser.add_argument(
        "--slicer",
        nargs="*",
        choices=[s.value for s in SlicerType],
        default=None,
        help="Slicer(s) to map (default: all with profiles)",
    )
    map_parser.add_argument(
        "--store",
        default="profiles",
        help="Profile store directory path (default: profiles)",
    )
    map_parser.add_argument(
        "--data-dir",
        default="data",
        help="Data directory path (default: data)",
    )
    map_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would change without writing",
    )
    map_parser.add_argument(
        "--brand",
        default=None,
        help="Filter to a single brand_id",
    )
    map_parser.add_argument(
        "--json",
        action="store_true",
        help="Output as JSON",
    )
    map_parser.set_defaults(func=run_map)

    parser.set_defaults(func=lambda args: parser.print_help() or 1)


def run_map(args: argparse.Namespace) -> int:
    """Execute the map command."""
    from ofd.slicer_mapper import SlicerMapper

    store_path = project_root / args.store
    data_dir = project_root / args.data_dir

    if not data_dir.exists():
        print(f"Error: Data directory '{data_dir}' does not exist", file=sys.stderr)
        return 1

    if not store_path.exists():
        print(f"Error: Store directory '{store_path}' does not exist", file=sys.stderr)
        return 1

    slicers = args.slicer
    use_json = getattr(args, "json", False)

    # Build profile index
    store = ProfileStore(store_path)
    index = ProfileIndex(store)

    slicer_types = [SlicerType(s) for s in slicers] if slicers else None
    index.build(slicer_types)

    mapper = SlicerMapper(index=index, data_dir=data_dir)
    report = mapper.run(
        slicers=slicers,
        dry_run=args.dry_run,
        brand_filter=args.brand,
    )

    if use_json:
        output = {
            "updated": [
                {
                    "filament": str(r.filament_path.relative_to(project_root)),
                    "slicer": r.slicer,
                    "profile_name": r.profile_name,
                    "slicer_id": r.slicer_id,
                    "vendor": r.vendor,
                }
                for r in report.updated
            ],
            "already_correct": [
                {
                    "filament": str(r.filament_path.relative_to(project_root)),
                    "slicer": r.slicer,
                    "profile_name": r.profile_name,
                }
                for r in report.already_correct
            ],
            "conflicts": [
                {
                    "filament": str(c.filament_path.relative_to(project_root)),
                    "slicer": c.slicer,
                    "field": c.field,
                    "existing": c.existing,
                    "derived": c.derived,
                }
                for c in report.conflicts
            ],
            "skipped": [
                {"path": str(p), "reason": reason}
                for p, reason in report.skipped
            ],
        }
        print(json.dumps(output, indent=2))
    else:
        if report.conflicts:
            print("CONFLICTS FOUND — no changes written:\n", file=sys.stderr)
            for c in report.conflicts:
                rel = c.filament_path.relative_to(project_root)
                print(
                    f"  {rel} [{c.slicer}] {c.field}: "
                    f"existing={c.existing!r} vs derived={c.derived!r}",
                    file=sys.stderr,
                )
            print(
                f"\n{len(report.conflicts)} conflict(s). Fix these in filament.json "
                f"before re-running.",
                file=sys.stderr,
            )
            return 1

        action = "Would update" if args.dry_run else "Updated"

        if report.updated:
            print(f"\n{action} {len(report.updated)} mapping(s):")
            for r in report.updated:
                rel = r.filament_path.relative_to(project_root)
                id_str = f" (id={r.slicer_id})" if r.slicer_id else ""
                print(f"  {rel} [{r.slicer}] → {r.profile_name}{id_str}")

        if report.already_correct:
            print(f"\nAlready correct: {len(report.already_correct)}")

        if report.skipped:
            print(f"\nSkipped: {len(report.skipped)}")
            for path, reason in report.skipped[:10]:
                print(f"  {path}: {reason}")
            if len(report.skipped) > 10:
                print(f"  ... and {len(report.skipped) - 10} more")

        total = len(report.updated) + len(report.already_correct)
        print(f"\nTotal matched: {total}")

    return 0
