#!/usr/bin/env python3
"""
sort_data.py - Sort JSON file keys according to schema definitions

This script recursively processes all JSON files in the data/ and stores/
directories and reorders their keys to match the order defined in the
corresponding JSON schemas. This ensures consistent formatting across all
data files.

The script:
1. Loads all schemas and extracts property key orderings
2. Processes each JSON file and sorts keys according to schema
3. Handles nested objects with their own key orderings
4. Warns about keys found in data but not in schema
5. Validates all files after sorting using data_validator.py

Usage:
    python scripts/sort_data.py --dry-run  # Preview changes
    python scripts/sort_data.py            # Apply changes
"""

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

# Add parent directory to path to import data_validator
sys.path.insert(0, str(Path(__file__).parent.parent))
from data_validator import ValidationOrchestrator

# Global flags for output mode
PROGRESS_MODE = False
JSON_MODE = False


def emit_progress(stage: str, percent: int, message: str = '') -> None:
    """Emit progress event as JSON to stdout for SSE streaming."""
    if PROGRESS_MODE and hasattr(sys.stdout, 'isatty') and not sys.stdout.isatty():
        # Only emit when stdout is piped (not terminal)
        print(json.dumps({
            'type': 'progress',
            'stage': stage,
            'percent': percent,
            'message': message
        }), flush=True)


@dataclass
class SchemaInfo:
    """Holds key ordering information for a schema."""
    keys: List[str] = field(default_factory=list)
    nested: Dict[str, List[str]] = field(default_factory=dict)


@dataclass
class ProcessingStats:
    """Statistics for file processing."""
    files_processed: int = 0
    files_modified: int = 0
    files_skipped: int = 0
    extra_keys_found: int = 0

    def to_dict(self) -> Dict[str, int]:
        """Convert to dictionary for JSON serialization."""
        return {
            'files_processed': self.files_processed,
            'files_modified': self.files_modified,
            'files_skipped': self.files_skipped,
            'extra_keys_found': self.extra_keys_found
        }


def load_json(path: Path) -> Optional[Dict[str, Any]]:
    """Load JSON from file with error handling."""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"Error loading {path}: {e}")
        return None


def save_json(path: Path, data: Any, dry_run: bool) -> None:
    """Save JSON to file with consistent formatting."""
    if dry_run:
        return
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')


def load_schemas(schemas_dir: Path) -> Dict[str, Dict[str, Any]]:
    """Load all JSON schemas from the schemas directory."""
    schemas = {}

    if not schemas_dir.exists():
        print(f"Error: {schemas_dir} directory not found")
        return schemas

    for schema_file in schemas_dir.glob("*.json"):
        try:
            with open(schema_file, 'r', encoding='utf-8') as f:
                schemas[schema_file.stem] = json.load(f)
        except json.JSONDecodeError as e:
            print(f"Error parsing {schema_file.name}: {e}")

    return schemas


def get_property_order(schema: Dict[str, Any]) -> List[str]:
    """Extract the order of properties from a JSON schema."""
    if "properties" in schema:
        return list(schema["properties"].keys())
    return []


def extract_nested_schemas(schema: Dict[str, Any]) -> Dict[str, List[str]]:
    """Recursively extract nested object schemas and their key orderings.

    Returns:
        Dictionary mapping nested property names to their key orderings.
        For example: {'color_standards': ['ral', 'ncs', 'pantone', ...]}
    """
    nested = {}

    # Check properties in the main schema
    if "properties" in schema:
        for prop_name, prop_schema in schema["properties"].items():
            if isinstance(prop_schema, dict):
                # Handle object types
                if prop_schema.get("type") == "object" and "properties" in prop_schema:
                    nested[prop_name] = get_property_order(prop_schema)
                # Handle array types with object items
                elif prop_schema.get("type") == "array" and "items" in prop_schema:
                    items_schema = prop_schema["items"]
                    if isinstance(items_schema, dict) and items_schema.get("type") == "object":
                        if "properties" in items_schema:
                            nested[prop_name] = get_property_order(items_schema)

    # Check definitions section for nested schemas
    if "definitions" in schema:
        for def_name, def_schema in schema["definitions"].items():
            if isinstance(def_schema, dict) and def_schema.get("type") == "object":
                if "properties" in def_schema:
                    nested[def_name] = get_property_order(def_schema)

    return nested


def build_key_order_map(schemas_dir: Path) -> Dict[str, SchemaInfo]:
    """Build a mapping of schema names to their key orderings.

    Returns:
        Dictionary mapping schema names (without _schema suffix) to SchemaInfo.
    """
    schemas = load_schemas(schemas_dir)
    key_order_map = {}

    for schema_name, schema_content in schemas.items():
        # Remove _schema suffix if present
        clean_name = schema_name.replace('_schema', '')

        # Check if this is an array schema (like sizes_schema.json)
        if schema_content.get('type') == 'array' and 'items' in schema_content:
            # For array schemas, use the items schema
            items_schema = schema_content['items']
            keys = get_property_order(items_schema)
            nested = extract_nested_schemas(items_schema)
        else:
            # Extract top-level key order
            keys = get_property_order(schema_content)
            # Extract nested object key orderings
            nested = extract_nested_schemas(schema_content)

        key_order_map[clean_name] = SchemaInfo(keys=keys, nested=nested)

    return key_order_map


def sort_json_keys(
    data: Any,
    schema_info: SchemaInfo,
    extra_keys: Set[str]
) -> Any:
    """Recursively sort JSON keys according to schema ordering.

    Args:
        data: The JSON data to sort (dict, list, or primitive)
        schema_info: Schema information with key orderings
        extra_keys: Set to collect keys not in schema

    Returns:
        Sorted JSON data
    """
    if isinstance(data, dict):
        ordered = {}
        remaining_keys = set(data.keys())

        # Add keys in schema order first
        for key in schema_info.keys:
            if key in data:
                value = data[key]

                # Check if this key has a nested schema
                if key in schema_info.nested:
                    nested_info = SchemaInfo(keys=schema_info.nested[key], nested=schema_info.nested)

                    # If value is an array, process each item with nested schema
                    if isinstance(value, list):
                        value = [sort_json_keys(item, nested_info, extra_keys) if isinstance(item, dict)
                                else item for item in value]
                    else:
                        value = sort_json_keys(value, nested_info, extra_keys)
                elif isinstance(value, dict):
                    # No specific nested schema, just recurse with empty schema
                    value = sort_json_keys(value, SchemaInfo(), extra_keys)
                elif isinstance(value, list):
                    # Process list items
                    value = [sort_json_keys(item, schema_info, extra_keys) if isinstance(item, dict)
                            else item for item in value]

                ordered[key] = value
                remaining_keys.remove(key)

        # Add remaining keys alphabetically (these are not in schema)
        if remaining_keys:
            extra_keys.update(remaining_keys)
            for key in sorted(remaining_keys):
                value = data[key]
                if isinstance(value, dict):
                    value = sort_json_keys(value, SchemaInfo(), extra_keys)
                elif isinstance(value, list):
                    value = [sort_json_keys(item, SchemaInfo(), extra_keys) if isinstance(item, dict)
                            else item for item in value]
                ordered[key] = value

        return ordered

    elif isinstance(data, list):
        # For arrays, process each item
        # For sizes.json, each item should follow the size item schema
        result = []
        for item in data:
            if isinstance(item, dict):
                # For array items, use the same schema_info
                result.append(sort_json_keys(item, schema_info, extra_keys))
            elif isinstance(item, list):
                result.append(sort_json_keys(item, schema_info, extra_keys))
            else:
                result.append(item)
        return result

    else:
        return data


def process_json_file(
    file_path: Path,
    schema_name: str,
    key_order_map: Dict[str, SchemaInfo],
    dry_run: bool,
    stats: ProcessingStats
) -> bool:
    """Process a single JSON file and sort its keys.

    Args:
        file_path: Path to the JSON file
        schema_name: Name of the schema to use
        key_order_map: Mapping of schema names to key orderings
        dry_run: If True, don't save changes
        stats: Statistics tracker

    Returns:
        True if file was modified, False otherwise
    """
    # Load the file
    data = load_json(file_path)
    if data is None:
        stats.files_skipped += 1
        return False

    # Get schema info
    if schema_name not in key_order_map:
        if not JSON_MODE:
            print(f"  Warning: No schema found for {schema_name}")
        stats.files_skipped += 1
        return False

    schema_info = key_order_map[schema_name]

    # Track extra keys found in this file
    extra_keys: Set[str] = set()

    # Sort the keys
    sorted_data = sort_json_keys(data, schema_info, extra_keys)

    # Warn about extra keys
    if extra_keys:
        if not JSON_MODE:
            print(f"  Warning: Extra keys in {file_path.name}: {sorted(extra_keys)}")
        stats.extra_keys_found += len(extra_keys)

    # Check if anything changed
    original_json = json.dumps(data, ensure_ascii=False, sort_keys=False)
    sorted_json = json.dumps(sorted_data, ensure_ascii=False, sort_keys=False)

    stats.files_processed += 1

    if original_json != sorted_json:
        if not JSON_MODE:
            if dry_run:
                print(f"  Would sort: {file_path.name}")
            else:
                print(f"  Sorted: {file_path.name}")
        save_json(file_path, sorted_data, dry_run)
        stats.files_modified += 1
        return True

    return False


def process_data_directory(
    data_dir: Path,
    key_order_map: Dict[str, SchemaInfo],
    dry_run: bool
) -> ProcessingStats:
    """Process all JSON files in the data directory hierarchy.

    Args:
        data_dir: Path to the data directory
        key_order_map: Mapping of schema names to key orderings
        dry_run: If True, don't save changes

    Returns:
        Processing statistics
    """
    stats = ProcessingStats()

    if not JSON_MODE:
        print("Processing data directory...")

    # Process each brand directory
    for brand_dir in sorted(data_dir.iterdir()):
        if not brand_dir.is_dir():
            continue

        if not JSON_MODE:
            print(f"  Brand: {brand_dir.name}")

        # Process brand.json
        brand_file = brand_dir / "brand.json"
        if brand_file.exists():
            process_json_file(brand_file, "brand", key_order_map, dry_run, stats)

        # Process each material directory
        for material_dir in sorted(brand_dir.iterdir()):
            if not material_dir.is_dir():
                continue

            # Process material.json
            material_file = material_dir / "material.json"
            if material_file.exists():
                process_json_file(material_file, "material", key_order_map, dry_run, stats)

            # Process each filament directory
            for filament_dir in sorted(material_dir.iterdir()):
                if not filament_dir.is_dir():
                    continue

                # Process filament.json
                filament_file = filament_dir / "filament.json"
                if filament_file.exists():
                    process_json_file(filament_file, "filament", key_order_map, dry_run, stats)

                # Process each variant directory
                for variant_dir in sorted(filament_dir.iterdir()):
                    if not variant_dir.is_dir():
                        continue

                    # Process variant.json
                    variant_file = variant_dir / "variant.json"
                    if variant_file.exists():
                        process_json_file(variant_file, "variant", key_order_map, dry_run, stats)

                    # Process sizes.json
                    sizes_file = variant_dir / "sizes.json"
                    if sizes_file.exists():
                        process_json_file(sizes_file, "sizes", key_order_map, dry_run, stats)

    return stats


def process_stores_directory(
    stores_dir: Path,
    key_order_map: Dict[str, SchemaInfo],
    dry_run: bool
) -> ProcessingStats:
    """Process all JSON files in the stores directory.

    Args:
        stores_dir: Path to the stores directory
        key_order_map: Mapping of schema names to key orderings
        dry_run: If True, don't save changes

    Returns:
        Processing statistics
    """
    stats = ProcessingStats()

    if not JSON_MODE:
        print("\nProcessing stores directory...")

    # Process each store directory
    for store_dir in sorted(stores_dir.iterdir()):
        if not store_dir.is_dir():
            continue

        if not JSON_MODE:
            print(f"  Store: {store_dir.name}")

        # Process store.json
        store_file = store_dir / "store.json"
        if store_file.exists():
            process_json_file(store_file, "store", key_order_map, dry_run, stats)

    return stats


def merge_stats(stats1: ProcessingStats, stats2: ProcessingStats) -> ProcessingStats:
    """Merge two ProcessingStats objects."""
    return ProcessingStats(
        files_processed=stats1.files_processed + stats2.files_processed,
        files_modified=stats1.files_modified + stats2.files_modified,
        files_skipped=stats1.files_skipped + stats2.files_skipped,
        extra_keys_found=stats1.extra_keys_found + stats2.extra_keys_found
    )


def main():
    global PROGRESS_MODE, JSON_MODE

    parser = argparse.ArgumentParser(
        description='Sort JSON file keys according to schema definitions'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview changes without modifying files'
    )
    parser.add_argument(
        '--json',
        action='store_true',
        help='Output results as JSON'
    )
    parser.add_argument(
        '--progress',
        action='store_true',
        help='Emit progress events (for SSE streaming)'
    )
    parser.add_argument(
        '--validate',
        action='store_true',
        help='Run validation after sorting'
    )
    args = parser.parse_args()

    PROGRESS_MODE = args.progress
    JSON_MODE = args.json

    # Determine paths relative to script location
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent
    data_dir = repo_root / 'data'
    stores_dir = repo_root / 'stores'
    schemas_dir = repo_root / 'schemas'

    if args.dry_run:
        if not JSON_MODE:
            print("=== DRY RUN MODE - No files will be modified ===\n")

    # Build key order mapping from schemas
    emit_progress('loading_schemas', 0, 'Loading schemas...')
    if not JSON_MODE:
        print("Loading schemas...")
    key_order_map = build_key_order_map(schemas_dir)
    emit_progress('loading_schemas', 100, f'Loaded {len(key_order_map)} schemas')
    if not JSON_MODE:
        print(f"Loaded {len(key_order_map)} schemas\n")

    # Process data directory
    data_stats = ProcessingStats()
    if data_dir.exists():
        emit_progress('sorting_data', 0, 'Processing data directory...')
        data_stats = process_data_directory(data_dir, key_order_map, args.dry_run)
        emit_progress('sorting_data', 100, 'Data directory processing complete')
    else:
        if not JSON_MODE:
            print(f"Data directory not found: {data_dir}")

    # Process stores directory
    stores_stats = ProcessingStats()
    if stores_dir.exists():
        emit_progress('sorting_stores', 0, 'Processing stores directory...')
        stores_stats = process_stores_directory(stores_dir, key_order_map, args.dry_run)
        emit_progress('sorting_stores', 100, 'Stores directory processing complete')
    else:
        if not JSON_MODE:
            print(f"Stores directory not found: {stores_dir}")

    # Merge statistics
    total_stats = merge_stats(data_stats, stores_stats)

    # Run validation if requested
    validation_result = None
    if args.validate and not args.dry_run and total_stats.files_modified > 0:
        emit_progress('validation', 0, 'Running validation...')
        if not JSON_MODE:
            print(f"\n{'=' * 60}")
            print("VALIDATING SORTED FILES")
            print('=' * 60)

        orchestrator = ValidationOrchestrator(data_dir, stores_dir, progress_mode=PROGRESS_MODE)
        validation_result = orchestrator.validate_all()
        emit_progress('validation', 100, 'Validation complete')

    # Output results
    if JSON_MODE:
        # JSON output mode
        output = {
            'dry_run': args.dry_run,
            'stats': total_stats.to_dict()
        }
        if validation_result:
            output['validation'] = validation_result.to_dict()

        # Use compact output in progress mode for SSE compatibility, pretty output otherwise
        if PROGRESS_MODE:
            print(json.dumps(output))
        else:
            print(json.dumps(output, indent=2))

        # Exit with error code if validation failed
        if validation_result and not validation_result.is_valid:
            sys.exit(1)
        sys.exit(0)
    else:
        # Text output mode
        print(f"\n{'=' * 60}")
        if args.dry_run:
            print("DRY RUN SUMMARY")
        else:
            print("SORTING SUMMARY")
        print('=' * 60)
        print(f"Files processed: {total_stats.files_processed}")
        print(f"Files modified: {total_stats.files_modified}")
        print(f"Files skipped: {total_stats.files_skipped}")
        if total_stats.extra_keys_found > 0:
            print(f"Extra keys found: {total_stats.extra_keys_found}")

        if validation_result:
            if validation_result.errors:
                print("\nValidation errors found:")

                # Group errors by category
                errors_by_category: Dict[str, List] = {}
                for error in validation_result.errors:
                    if error.category not in errors_by_category:
                        errors_by_category[error.category] = []
                    errors_by_category[error.category].append(error)

                # Print errors grouped by category
                for category, errors in sorted(errors_by_category.items()):
                    print(f"\n{category} ({len(errors)}):")
                    print("-" * 80)
                    for error in errors[:10]:  # Limit to first 10 per category
                        print(f"  {error}")
                    if len(errors) > 10:
                        print(f"  ... and {len(errors) - 10} more")

                print(f"\nValidation failed: {validation_result.error_count} errors, {validation_result.warning_count} warnings")
                print("\nDone!")
                sys.exit(1)
            else:
                print("\nAll validations passed!")

        print("\nDone!")
        sys.exit(0)


if __name__ == '__main__':
    main()
