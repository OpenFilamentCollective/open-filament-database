#!/usr/bin/env python3
"""
Remove invalid EANs and GTINs that are not exactly 13 digits.

Valid EAN-13/GTIN-13 codes must be exactly 13 numeric digits.
"""

import json
import re
from pathlib import Path


def is_valid_ean(value: str) -> bool:
    """Check if a value is a valid EAN (exactly 13 numeric digits)."""
    if not value:
        return False
    return bool(re.match(r'^\d{13}$', str(value)))


def clean_sizes_file(sizes_path: Path, dry_run: bool = False) -> tuple[bool, list[str]]:
    """
    Remove invalid EAN and GTIN fields from a sizes.json file.

    Returns (modified, messages) tuple.
    """
    try:
        with open(sizes_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        if not isinstance(data, list):
            return False, []

        modified = False
        messages = []

        for entry in data:
            # Check and remove invalid 'ean' (must be exactly 13 numeric digits)
            if 'ean' in entry:
                ean_value = str(entry['ean'])
                if not is_valid_ean(ean_value):
                    messages.append(f"Removed invalid ean: {ean_value}")
                    del entry['ean']
                    modified = True

        if modified and not dry_run:
            with open(sizes_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.write('\n')

        return modified, messages

    except Exception as e:
        return False, [f"Error: {e}"]


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Remove invalid EANs and GTINs from sizes.json files")
    parser.add_argument('--base-path', default=Path(__file__).parent.parent,
                        help="Base path of the repository")
    parser.add_argument('--dry-run', action='store_true', help="Don't modify files")
    parser.add_argument('--verbose', '-v', action='store_true', help="Show all files checked")

    args = parser.parse_args()

    base_path = Path(args.base_path)
    data_path = base_path / "data"

    if not data_path.exists():
        print(f"Error: data directory not found at {data_path}")
        return

    total_files = 0
    modified_files = 0
    all_removals = []

    for sizes_file in data_path.rglob("sizes.json"):
        total_files += 1
        modified, messages = clean_sizes_file(sizes_file, dry_run=args.dry_run)

        if modified:
            modified_files += 1
            rel_path = sizes_file.relative_to(base_path)
            print(f"{'[DRY RUN] ' if args.dry_run else ''}Modified: {rel_path}")
            for msg in messages:
                print(f"  {msg}")
                all_removals.append((rel_path, msg))
        elif args.verbose:
            print(f"OK: {sizes_file.relative_to(base_path)}")

    print(f"\n{'='*60}")
    print("Summary:")
    print(f"  Files checked: {total_files}")
    print(f"  Files modified: {modified_files}")
    print(f"  Invalid values removed: {len(all_removals)}")


if __name__ == "__main__":
    main()
