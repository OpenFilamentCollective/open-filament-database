"""
Build command - Builds database exports.

This command wraps the builder module functionality to generate
JSON, SQLite, CSV, API, and HTML exports.
"""

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict

from ofd.builder.crawler import crawl_data
from ofd.builder.errors import BuildResult
from ofd.builder.exporters import export_json, export_sqlite, export_sqlite_stores, export_csv, export_api, export_html, export_directory_listings
from ofd.builder.utils import get_current_timestamp

project_root = Path(__file__).parent.parent.parent


def generate_version() -> str:
    """Generate a version string based on current date."""
    now = datetime.now(timezone.utc)
    return now.strftime("%Y.%m.%d")


def calculate_checksums(output_dir: str) -> Dict[str, str]:
    """Calculate SHA256 checksums for all generated files."""
    checksums = {}
    output_path = Path(output_dir)

    for file_path in output_path.rglob('*'):
        if file_path.is_file() and not file_path.name.endswith('.sha256'):
            rel_path = str(file_path.relative_to(output_path))
            with open(file_path, 'rb') as f:
                sha256 = hashlib.sha256(f.read()).hexdigest()
            checksums[rel_path] = sha256

    return checksums


def write_manifest(output_dir: str, version: str, generated_at: str, checksums: Dict[str, str]):
    """Write the manifest file with all artifacts."""
    output_path = Path(output_dir)

    artifacts = []
    for rel_path, sha256 in sorted(checksums.items()):
        file_path = output_path / rel_path
        artifacts.append({
            "path": rel_path,
            "sha256": sha256,
            "size": file_path.stat().st_size
        })

    manifest = {
        "dataset_version": version,
        "generated_at": generated_at,
        "artifact_count": len(artifacts),
        "artifacts": artifacts
    }

    manifest_file = output_path / "manifest.json"
    with open(manifest_file, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)

    print(f"Written: {manifest_file}")
    return manifest_file


def register_subcommand(subparsers: argparse._SubParsersAction) -> None:
    """Register the build subcommand."""
    parser = subparsers.add_parser(
        'build',
        help='Build database exports (JSON, SQLite, CSV, API, HTML)',
        description='Build all database exports from the data and stores directories.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  ofd build                        Build all exports to dist/
  ofd build -o output              Build to custom output directory
  ofd build --skip-sqlite          Skip SQLite export
  ofd build --skip-json --skip-csv Only build API and HTML
        """
    )

    # Output options
    parser.add_argument(
        '--output-dir', '-o',
        default='dist',
        help='Output directory (default: dist)'
    )

    # Input options
    parser.add_argument(
        '--data-dir', '-d',
        default='data',
        help='Data directory (default: data)'
    )
    parser.add_argument(
        '--stores-dir', '-s',
        default='stores',
        help='Stores directory (default: stores)'
    )

    # Version
    parser.add_argument(
        '--version', '-v',
        default=None,
        help='Dataset version (default: auto-generated from date)'
    )

    # Skip options
    skip_group = parser.add_argument_group('skip options')
    skip_group.add_argument(
        '--skip-json',
        action='store_true',
        help='Skip JSON export'
    )
    skip_group.add_argument(
        '--skip-sqlite',
        action='store_true',
        help='Skip SQLite export'
    )
    skip_group.add_argument(
        '--skip-csv',
        action='store_true',
        help='Skip CSV export'
    )
    skip_group.add_argument(
        '--skip-api',
        action='store_true',
        help='Skip static API export'
    )
    skip_group.add_argument(
        '--skip-html',
        action='store_true',
        help='Skip HTML landing page export'
    )

    parser.set_defaults(func=run_build)


def run_build(args: argparse.Namespace) -> int:
    """
    Execute the build command.

    Args:
        args: Parsed command-line arguments

    Returns:
        Exit code (0 for success, 1 for errors)
    """
    # Resolve paths
    data_dir = project_root / args.data_dir
    stores_dir = project_root / args.stores_dir
    schemas_dir = project_root / "schemas"
    builder_schemas_dir = Path(__file__).parent.parent / "builder" / "schemas"
    output_dir = project_root / args.output_dir

    # Check directories exist
    if not data_dir.exists():
        print(f"Error: Data directory '{data_dir}' does not exist", file=sys.stderr)
        return 1
    if not stores_dir.exists():
        print(f"Error: Stores directory '{stores_dir}' does not exist", file=sys.stderr)
        return 1

    # Generate version if not provided
    version = args.version or generate_version()
    generated_at = get_current_timestamp()

    print("=" * 60)
    print("Open Filament Database Builder")
    print("=" * 60)
    print(f"Version: {version}")
    print(f"Generated at: {generated_at}")
    print(f"Data directory: {data_dir}")
    print(f"Stores directory: {stores_dir}")
    print(f"Output directory: {output_dir}")
    print("=" * 60)

    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)

    # Initialize build result to collect all errors
    build_result = BuildResult()

    # Step 1: Crawl data
    print("\n[1/8] Crawling data...")
    db, crawl_result = crawl_data(str(data_dir), str(stores_dir))
    build_result.merge(crawl_result)

    # Step 2: Export JSON
    if not args.skip_json:
        print("\n[2/8] Exporting JSON...")
        export_json(db, str(output_dir), version, generated_at)
    else:
        print("\n[2/8] Skipping JSON export")

    # Step 3: Export SQLite (filaments)
    if not args.skip_sqlite:
        print("\n[3/8] Exporting SQLite (filaments)...")
        export_sqlite(db, str(output_dir), version, generated_at)
    else:
        print("\n[3/8] Skipping SQLite export")

    # Step 4: Export SQLite (stores)
    if not args.skip_sqlite:
        print("\n[4/8] Exporting SQLite (stores)...")
        export_sqlite_stores(db, str(output_dir), version, generated_at)
    else:
        print("\n[4/8] Skipping SQLite stores export")

    # Step 5: Export CSV
    if not args.skip_csv:
        print("\n[5/8] Exporting CSV...")
        export_csv(db, str(output_dir), version, generated_at)
    else:
        print("\n[5/8] Skipping CSV export")

    # Step 6: Export Static API
    if not args.skip_api:
        print("\n[6/8] Exporting Static API...")
        export_api(
            db, str(output_dir), version, generated_at,
            schemas_dir=str(schemas_dir),
            builder_schemas_dir=str(builder_schemas_dir),
            data_dir=str(data_dir),
            stores_dir=str(stores_dir)
        )
    else:
        print("\n[6/8] Skipping Static API export")

    # Step 7: Export HTML landing page
    if not args.skip_html:
        print("\n[7/8] Exporting HTML landing page...")
        templates_dir = Path(__file__).parent.parent / "builder" / "templates"
        config_dir = project_root / "config"
        export_html(db, str(output_dir), version, generated_at, str(templates_dir), str(config_dir))
    else:
        print("\n[7/8] Skipping HTML export")

    # Step 8: Generate directory listings
    if not args.skip_html:
        print("\n[8/8] Generating directory listings...")
        templates_dir = Path(__file__).parent.parent / "builder" / "templates"
        export_directory_listings(str(output_dir), str(templates_dir))
    else:
        print("\n[8/8] Skipping directory listings")

    # Calculate checksums and write manifest
    print("\nGenerating checksums and manifest...")
    checksums = calculate_checksums(str(output_dir))
    write_manifest(str(output_dir), version, generated_at, checksums)

    # Print any errors/warnings collected during build
    build_result.print_summary()

    print("\n" + "=" * 60)
    print("Build complete!")
    print("=" * 60)
    print(f"\nOutput files are in: {output_dir}")
    print(f"Total artifacts: {len(checksums)}")

    if build_result.errors:
        print(f"\nBuild issues: {build_result.error_count} errors, {build_result.warning_count} warnings")

    # Return non-zero exit code if there were errors
    return 1 if build_result.has_errors else 0
