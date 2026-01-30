#!/usr/bin/env python3
"""
Quick script to add source field to all brand.json files.

Usage:
    python3 add_source_to_brands.py                    # Process all brands
    python3 add_source_to_brands.py --git-changes      # Only git changes
    python3 add_source_to_brands.py --dry-run          # Preview changes
"""
import argparse
import json
from pathlib import Path

def add_source_to_brand(filepath, source_url, dry_run=False):
    """Add source field to brand.json if not present."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Check if source already exists
        if 'source' in data:
            return False, "already has source"

        # Add source field after origin
        keys = list(data.keys())
        new_data = {}
        for key in keys:
            new_data[key] = data[key]
            if key == 'origin':
                new_data['source'] = source_url

        if not dry_run:
            # Write back with proper formatting
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(new_data, f, indent=2, ensure_ascii=False)
                f.write('\n')

        return True, "added source"

    except Exception as e:
        return False, f"error: {e}"

def main():
    parser = argparse.ArgumentParser(description='Add source field to brand.json files')
    parser.add_argument('--git-changes', action='store_true',
                        help='Only process files in git changes')
    parser.add_argument('--dry-run', action='store_true',
                        help='Preview changes without modifying files')
    parser.add_argument('--source', type=str,
                        default='https://github.com/OpenPrintTag/openprinttag-database',
                        help='Source URL to add (default: OpenPrintTag GitHub)')
    args = parser.parse_args()

    if args.dry_run:
        print("DRY RUN MODE - No files will be modified\n")

    data_dir = Path(__file__).parent / 'data'

    if args.git_changes:
        import subprocess
        result = subprocess.run(
            ['git', 'status', '--porcelain'],
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent
        )

        brand_files = []
        for line in result.stdout.strip().split('\n'):
            if 'brand.json' in line and 'data/' in line:
                parts = line.strip().split(maxsplit=1)
                if len(parts) == 2:
                    filepath = Path(__file__).parent / parts[1].strip()
                    if filepath.exists():
                        brand_files.append(filepath)
    else:
        brand_files = sorted(data_dir.glob('*/brand.json'))

    if not brand_files:
        print("No brand.json files found.")
        return

    print(f"Processing {len(brand_files)} brand.json files...\n")

    updated = 0
    skipped = 0
    errors = 0

    for filepath in brand_files:
        success, reason = add_source_to_brand(filepath, args.source, args.dry_run)

        if success:
            print(f"✓ {filepath.parent.name}")
            updated += 1
        elif "already has source" in reason:
            skipped += 1
        else:
            print(f"✗ {filepath.parent.name} - {reason}")
            errors += 1

    print(f"\n{'='*60}")
    print(f"Summary:")
    print(f"  Updated: {updated}")
    print(f"  Already had source: {skipped}")
    print(f"  Errors: {errors}")
    print(f"{'='*60}")

if __name__ == '__main__':
    main()
