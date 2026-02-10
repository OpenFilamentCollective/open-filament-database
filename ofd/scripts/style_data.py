"""
Style Data Script - Sort JSON file keys according to schema definitions.

This script recursively processes all JSON files in the data/ and stores/
directories and reorders their keys to match the order defined in the
corresponding JSON schemas. This ensures consistent formatting across all
data files.

The script:
1. Loads all schemas and extracts property key orderings
2. Processes each JSON file and sorts keys according to schema
3. Handles nested objects with their own key orderings
4. Warns about keys found in data but not in schema
5. Validates all files after sorting using the validation module
6. Enforces 2-space indentation across all JSON files
"""

import argparse
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from ofd.base import BaseScript, ScriptResult, register_script
from ofd.validation import ValidationOrchestrator


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
    """Recursively extract nested object schemas and their key orderings."""
    nested = {}

    if "properties" in schema:
        for prop_name, prop_schema in schema["properties"].items():
            if isinstance(prop_schema, dict):
                if prop_schema.get("type") == "object" and "properties" in prop_schema:
                    nested[prop_name] = get_property_order(prop_schema)
                elif prop_schema.get("type") == "array" and "items" in prop_schema:
                    items_schema = prop_schema["items"]
                    if isinstance(items_schema, dict) and items_schema.get("type") == "object":
                        if "properties" in items_schema:
                            nested[prop_name] = get_property_order(items_schema)

    if "definitions" in schema:
        for def_name, def_schema in schema["definitions"].items():
            if isinstance(def_schema, dict) and def_schema.get("type") == "object":
                if "properties" in def_schema:
                    nested[def_name] = get_property_order(def_schema)

    return nested


def build_key_order_map(schemas_dir: Path) -> Dict[str, SchemaInfo]:
    """Build a mapping of schema names to their key orderings."""
    schemas = load_schemas(schemas_dir)
    key_order_map = {}

    for schema_name, schema_content in schemas.items():
        clean_name = schema_name.replace('_schema', '')

        if schema_content.get('type') == 'array' and 'items' in schema_content:
            items_schema = schema_content['items']
            keys = get_property_order(items_schema)
            nested = extract_nested_schemas(items_schema)
        else:
            keys = get_property_order(schema_content)
            nested = extract_nested_schemas(schema_content)

        key_order_map[clean_name] = SchemaInfo(keys=keys, nested=nested)

    return key_order_map


def sort_json_keys(
    data: Any,
    schema_info: SchemaInfo,
    extra_keys: Set[str]
) -> Any:
    """Recursively sort JSON keys according to schema ordering."""
    if isinstance(data, dict):
        ordered = {}
        remaining_keys = set(data.keys())

        for key in schema_info.keys:
            if key in data:
                value = data[key]

                if key in schema_info.nested:
                    nested_info = SchemaInfo(keys=schema_info.nested[key], nested=schema_info.nested)

                    if isinstance(value, list):
                        value = [sort_json_keys(item, nested_info, extra_keys) if isinstance(item, dict)
                                else item for item in value]
                    else:
                        value = sort_json_keys(value, nested_info, extra_keys)
                elif isinstance(value, dict):
                    value = sort_json_keys(value, SchemaInfo(), extra_keys)
                elif isinstance(value, list):
                    value = [sort_json_keys(item, schema_info, extra_keys) if isinstance(item, dict)
                            else item for item in value]

                ordered[key] = value
                remaining_keys.remove(key)

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
        result = []
        for item in data:
            if isinstance(item, dict):
                result.append(sort_json_keys(item, schema_info, extra_keys))
            elif isinstance(item, list):
                result.append(sort_json_keys(item, schema_info, extra_keys))
            else:
                result.append(item)
        return result

    else:
        return data


@register_script
class StyleDataScript(BaseScript):
    """Sort and style JSON data files according to schema definitions."""

    name = "style_data"
    description = "Sort JSON keys according to schema definitions and fix formatting"

    def configure_parser(self, parser: argparse.ArgumentParser) -> None:
        """Add script-specific arguments."""
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview changes without modifying files'
        )
        parser.add_argument(
            '--validate',
            action='store_true',
            help='Run validation after sorting'
        )
        parser.add_argument(
            '--fix-indent-only',
            action='store_true',
            help='Only fix indentation to 2 spaces across all JSON files (skip sorting)'
        )

    def _fix_json_indentation(
        self,
        file_path: Path,
        dry_run: bool,
        stats: ProcessingStats
    ) -> bool:
        """Fix indentation of a JSON file to use 2 spaces."""
        data = load_json(file_path)
        if data is None:
            stats.files_skipped += 1
            return False

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                original_content = f.read()
        except OSError as e:
            self.log(f"Error reading {file_path}: {e}")
            stats.files_skipped += 1
            return False

        new_content = json.dumps(data, indent=2, ensure_ascii=False) + '\n'

        stats.files_processed += 1

        if original_content != new_content:
            try:
                rel_path = file_path.relative_to(self.project_root)
            except ValueError:
                rel_path = file_path
            if dry_run:
                self.log(f"  Would fix indentation: {rel_path}")
            else:
                self.log(f"  Fixed indentation: {rel_path}")

            if not dry_run:
                try:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                except OSError as e:
                    self.log(f"Error writing {file_path}: {e}")
                    stats.files_skipped += 1
                    return False

            stats.files_modified += 1
            return True

        return False

    def _fix_all_json_indentation(self, dry_run: bool) -> ProcessingStats:
        """Fix indentation for all JSON files in the repository."""
        stats = ProcessingStats()

        self.log("Fixing indentation for all JSON files...")

        json_files = list(self.project_root.rglob('*.json'))

        excluded_dirs = {'node_modules', '.git', 'dist', 'build', '.venv', 'venv'}
        json_files = [
            f for f in json_files
            if not any(part in excluded_dirs for part in f.parts)
        ]

        for json_file in sorted(json_files):
            self._fix_json_indentation(json_file, dry_run, stats)

        return stats

    def run(self, args: argparse.Namespace) -> ScriptResult:
        """Execute the style_data script."""
        dry_run = getattr(args, 'dry_run', False)
        do_validate = getattr(args, 'validate', False)
        fix_indent_only = getattr(args, 'fix_indent_only', False)

        if dry_run:
            self.log("=== DRY RUN MODE - No files will be modified ===\n")

        # Handle --fix-indent-only mode
        if fix_indent_only:
            self.emit_progress('fixing_indentation', 0, 'Fixing indentation for all JSON files...')
            total_stats = self._fix_all_json_indentation(dry_run)
            self.emit_progress('fixing_indentation', 100, 'Indentation fixes complete')

            self.log(f"\n{'=' * 60}")
            self.log("DRY RUN SUMMARY - INDENTATION FIX" if dry_run else "INDENTATION FIX SUMMARY")
            self.log('=' * 60)
            self.log(f"Files processed: {total_stats.files_processed}")
            self.log(f"Files modified: {total_stats.files_modified}")
            self.log(f"Files skipped: {total_stats.files_skipped}")
            self.log("\nDone!")

            return ScriptResult(
                success=True,
                message="Indentation fix complete",
                data={
                    'dry_run': dry_run,
                    'mode': 'fix_indent_only',
                    'stats': total_stats.to_dict()
                }
            )

        # Build key order mapping from schemas
        self.emit_progress('loading_schemas', 0, 'Loading schemas...')
        self.log("Loading schemas...")
        key_order_map = build_key_order_map(self.schemas_dir)
        self.emit_progress('loading_schemas', 100, f'Loaded {len(key_order_map)} schemas')
        self.log(f"Loaded {len(key_order_map)} schemas\n")

        # Process data directory
        data_stats = ProcessingStats()
        if self.data_dir.exists():
            self.emit_progress('sorting_data', 0, 'Processing data directory...')
            data_stats = self._process_data_directory(key_order_map, dry_run)
            self.emit_progress('sorting_data', 100, 'Data directory processing complete')
        else:
            self.log(f"Data directory not found: {self.data_dir}")

        # Process stores directory
        stores_stats = ProcessingStats()
        if self.stores_dir.exists():
            self.emit_progress('sorting_stores', 0, 'Processing stores directory...')
            stores_stats = self._process_stores_directory(key_order_map, dry_run)
            self.emit_progress('sorting_stores', 100, 'Stores directory processing complete')
        else:
            self.log(f"Stores directory not found: {self.stores_dir}")

        # Merge statistics
        total_stats = ProcessingStats(
            files_processed=data_stats.files_processed + stores_stats.files_processed,
            files_modified=data_stats.files_modified + stores_stats.files_modified,
            files_skipped=data_stats.files_skipped + stores_stats.files_skipped,
            extra_keys_found=data_stats.extra_keys_found + stores_stats.extra_keys_found
        )

        # Run validation if requested
        validation_data = None
        if do_validate and not dry_run and total_stats.files_modified > 0:
            self.emit_progress('validation', 0, 'Running validation...')
            self.log(f"\n{'=' * 60}")
            self.log("VALIDATING SORTED FILES")
            self.log('=' * 60)

            orchestrator = ValidationOrchestrator(
                self.data_dir, self.stores_dir,
                progress_mode=self.progress_mode
            )
            validation_result = orchestrator.validate_all()
            self.emit_progress('validation', 100, 'Validation complete')
            validation_data = validation_result.to_dict()

            if not validation_result.is_valid:
                return ScriptResult(
                    success=False,
                    message=f"Validation failed: {validation_result.error_count} errors",
                    data={
                        'dry_run': dry_run,
                        'stats': total_stats.to_dict(),
                        'validation': validation_data
                    }
                )

        # Summary
        self.log(f"\n{'=' * 60}")
        self.log("DRY RUN SUMMARY" if dry_run else "SORTING SUMMARY")
        self.log('=' * 60)
        self.log(f"Files processed: {total_stats.files_processed}")
        self.log(f"Files modified: {total_stats.files_modified}")
        self.log(f"Files skipped: {total_stats.files_skipped}")
        if total_stats.extra_keys_found > 0:
            self.log(f"Extra keys found: {total_stats.extra_keys_found}")
        self.log("\nDone!")

        result_data = {
            'dry_run': dry_run,
            'stats': total_stats.to_dict()
        }
        if validation_data:
            result_data['validation'] = validation_data

        return ScriptResult(success=True, message="Sorting complete", data=result_data)

    def _process_json_file(
        self,
        file_path: Path,
        schema_name: str,
        key_order_map: Dict[str, SchemaInfo],
        dry_run: bool,
        stats: ProcessingStats
    ) -> bool:
        """Process a single JSON file and sort its keys."""
        data = load_json(file_path)
        if data is None:
            stats.files_skipped += 1
            return False

        if schema_name not in key_order_map:
            self.log(f"  Warning: No schema found for {schema_name}")
            stats.files_skipped += 1
            return False

        schema_info = key_order_map[schema_name]
        extra_keys: Set[str] = set()

        sorted_data = sort_json_keys(data, schema_info, extra_keys)

        if extra_keys:
            self.log(f"  Warning: Extra keys in {file_path.name}: {sorted(extra_keys)}")
            stats.extra_keys_found += len(extra_keys)

        original_json = json.dumps(data, ensure_ascii=False, sort_keys=False)
        sorted_json = json.dumps(sorted_data, ensure_ascii=False, sort_keys=False)

        stats.files_processed += 1

        if original_json != sorted_json:
            if dry_run:
                self.log(f"  Would sort: {file_path.name}")
            else:
                self.log(f"  Sorted: {file_path.name}")
            save_json(file_path, sorted_data, dry_run)
            stats.files_modified += 1
            return True

        return False

    def _process_data_directory(
        self,
        key_order_map: Dict[str, SchemaInfo],
        dry_run: bool
    ) -> ProcessingStats:
        """Process all JSON files in the data directory hierarchy."""
        stats = ProcessingStats()
        self.log("Processing data directory...")

        for brand_dir in sorted(self.data_dir.iterdir()):
            if not brand_dir.is_dir():
                continue

            self.log(f"  Brand: {brand_dir.name}")

            brand_file = brand_dir / "brand.json"
            if brand_file.exists():
                self._process_json_file(brand_file, "brand", key_order_map, dry_run, stats)

            for material_dir in sorted(brand_dir.iterdir()):
                if not material_dir.is_dir():
                    continue

                material_file = material_dir / "material.json"
                if material_file.exists():
                    self._process_json_file(material_file, "material", key_order_map, dry_run, stats)

                for filament_dir in sorted(material_dir.iterdir()):
                    if not filament_dir.is_dir():
                        continue

                    filament_file = filament_dir / "filament.json"
                    if filament_file.exists():
                        self._process_json_file(filament_file, "filament", key_order_map, dry_run, stats)

                    for variant_dir in sorted(filament_dir.iterdir()):
                        if not variant_dir.is_dir():
                            continue

                        variant_file = variant_dir / "variant.json"
                        if variant_file.exists():
                            self._process_json_file(variant_file, "variant", key_order_map, dry_run, stats)

                        sizes_file = variant_dir / "sizes.json"
                        if sizes_file.exists():
                            self._process_json_file(sizes_file, "sizes", key_order_map, dry_run, stats)

        return stats

    def _process_stores_directory(
        self,
        key_order_map: Dict[str, SchemaInfo],
        dry_run: bool
    ) -> ProcessingStats:
        """Process all JSON files in the stores directory."""
        stats = ProcessingStats()
        self.log("\nProcessing stores directory...")

        for store_dir in sorted(self.stores_dir.iterdir()):
            if not store_dir.is_dir():
                continue

            self.log(f"  Store: {store_dir.name}")

            store_file = store_dir / "store.json"
            if store_file.exists():
                self._process_json_file(store_file, "store", key_order_map, dry_run, stats)

        return stats
