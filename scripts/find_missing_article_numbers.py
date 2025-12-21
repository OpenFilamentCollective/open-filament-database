#!/usr/bin/env python3
"""Find all sizes.json files that don't include an article_number field."""

import json
from pathlib import Path

def main():
    data_dir = Path(__file__).parent.parent / "data/Bambu Lab"
    missing = []

    for sizes_file in data_dir.rglob("sizes.json"):
        try:
            data = None
            with open(sizes_file) as f:
                data = f.read()

            if not "article_number" in data:
                missing.append(sizes_file)
        except (json.JSONDecodeError, IOError) as e:
            print(f"Error reading {sizes_file}: {e}")

    print(f"Found {len(missing)} sizes.json files missing article_number:\n")
    for path in sorted(missing):
        print(path.relative_to(data_dir))

if __name__ == "__main__":
    main()
