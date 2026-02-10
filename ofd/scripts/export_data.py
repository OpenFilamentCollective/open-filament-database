"""
Export Data Script - Export database to folder structure.

This script reads the data from the folder structure and can re-export it
to a different location, useful for migrations or creating backups with
normalized data.
"""

import argparse
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional, Union

from jsonschema.validators import Draft7Validator
from jsonschema.exceptions import ValidationError as JsonSchemaValidationError
from referencing import Registry, Resource

from ofd.base import BaseScript, ScriptResult, register_script


PathLike = Union[str, os.PathLike[str]]
COLOR_HEX_PATTERN = re.compile(r"#?([a-fA-F0-9]{6})")


# ---------------------------------
# Utility Functions
# ---------------------------------

def shallow_remove_empty(input_dict: dict) -> dict:
    """Remove elements that are 'None' or have an empty list/dict."""
    cpy = input_dict.copy()
    for k, v in input_dict.items():
        if v is None or (isinstance(v, (list, dict)) and len(v) == 0):
            del cpy[k]
    return cpy


def normalize_color_hex(input_data: list[str]) -> list[str]:
    """Takes a list of color hex values and normalizes them."""
    res: list[str] = []
    for item in input_data:
        match = re.fullmatch(COLOR_HEX_PATTERN, item.strip())
        if match:
            res.append(match.group(1).upper())
        else:
            raise ValueError(f"Invalid hex color value: {item}")
    return res


def cleanse_folder_name(name: str) -> str:
    """Clean folder name by replacing slashes."""
    return name.replace("/", " ").strip()


def load_json(json_path: PathLike) -> Optional[Dict[str, Any]]:
    """Load JSON from file with error handling."""
    try:
        with open(json_path, mode="r", encoding="utf8") as file:
            return json.load(file)
    except json.JSONDecodeError:
        print(f"Failed to parse JSON from file: {json_path}")
    except OSError:
        print(f"Failed to open JSON file: {json_path}")
    return None


def save_json(path: Path, data: Any) -> None:
    """Save JSON to file with consistent formatting."""
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
        f.write('\n')


# ---------------------------------
# Schema Loading
# ---------------------------------

class SchemaLoader:
    """Loads and caches JSON schemas."""

    def __init__(self, schemas_dir: Path):
        self.schemas_dir = schemas_dir
        self._schemas: Dict[str, Dict] = {}
        self._registry: Optional[Registry] = None

    def get(self, name: str) -> Optional[Dict]:
        """Get schema by name."""
        if name not in self._schemas:
            path = self.schemas_dir / f"{name}_schema.json"
            if path.exists():
                self._schemas[name] = load_json(path)
        return self._schemas.get(name)

    @property
    def registry(self) -> Registry:
        """Get schema registry for $ref resolution."""
        if self._registry is None:
            material_types = self.get('material_types')
            resources = []
            if material_types:
                resources.append(("./material_types_schema.json", Resource.from_contents(material_types)))
            self._registry = Registry().with_resources(resources)
        return self._registry

    def validate(self, data: Any, schema_name: str) -> bool:
        """Validate data against a schema."""
        schema = self.get(schema_name)
        if schema is None:
            return True  # No schema, assume valid

        try:
            validator = Draft7Validator(schema, registry=self.registry)
            validator.validate(data)
            return True
        except JsonSchemaValidationError as error:
            print(f"Validation failed: {error.message} at {error.json_path}")
            return False


# ---------------------------------
# Data Statistics
# ---------------------------------

@dataclass
class ExportStats:
    """Statistics for data export."""
    brands: int = 0
    materials: int = 0
    filaments: int = 0
    variants: int = 0
    sizes: int = 0
    stores: int = 0
    purchase_links: int = 0
    errors: int = 0

    def to_dict(self) -> Dict[str, int]:
        return {
            'brands': self.brands,
            'materials': self.materials,
            'filaments': self.filaments,
            'variants': self.variants,
            'sizes': self.sizes,
            'stores': self.stores,
            'purchase_links': self.purchase_links,
            'errors': self.errors,
        }


@register_script
class ExportDataScript(BaseScript):
    """Export database to folder structure."""

    name = "export_data"
    description = "Export database to a folder structure"

    def configure_parser(self, parser: argparse.ArgumentParser) -> None:
        """Add script-specific arguments."""
        parser.add_argument(
            '-o', '--output',
            required=True,
            help='Output directory for exported data'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview export without writing files'
        )
        parser.add_argument(
            '--include-stores',
            action='store_true',
            default=True,
            help='Include stores in export (default: true)'
        )
        parser.add_argument(
            '--validate',
            action='store_true',
            help='Validate data before export'
        )

    def run(self, args: argparse.Namespace) -> ScriptResult:
        """Execute the export_data script."""
        dry_run = getattr(args, 'dry_run', False)
        do_validate = getattr(args, 'validate', False)
        output_dir = Path(args.output)

        if dry_run:
            self.log("=== DRY RUN MODE - No files will be written ===\n")

        # Initialize
        schema_loader = SchemaLoader(self.schemas_dir)
        stats = ExportStats()

        # Create output directories
        if not dry_run:
            output_dir.mkdir(parents=True, exist_ok=True)
            (output_dir / "data").mkdir(exist_ok=True)
            (output_dir / "stores").mkdir(exist_ok=True)

        # Export stores first (needed for purchase link references)
        self.emit_progress('stores', 0, 'Exporting stores...')
        self.log("Exporting stores...")
        stores = self._export_stores(output_dir / "stores", schema_loader, stats, dry_run, do_validate)
        self.emit_progress('stores', 100, f'Exported {stats.stores} stores')

        # Export data
        self.emit_progress('data', 0, 'Exporting data...')
        self.log("\nExporting data...")
        self._export_data(output_dir / "data", schema_loader, stats, stores, dry_run, do_validate)
        self.emit_progress('data', 100, 'Data export complete')

        # Summary
        self.log(f"\n{'=' * 60}")
        self.log("DRY RUN SUMMARY" if dry_run else "EXPORT SUMMARY")
        self.log('=' * 60)
        self.log(f"Brands:         {stats.brands}")
        self.log(f"Materials:      {stats.materials}")
        self.log(f"Filaments:      {stats.filaments}")
        self.log(f"Variants:       {stats.variants}")
        self.log(f"Sizes:          {stats.sizes}")
        self.log(f"Stores:         {stats.stores}")
        self.log(f"Purchase Links: {stats.purchase_links}")
        if stats.errors > 0:
            self.log(f"Errors:         {stats.errors}")

        if not dry_run:
            self.log(f"\nOutput directory: {output_dir}")

        success = stats.errors == 0
        return ScriptResult(
            success=success,
            message="Export complete" if success else f"Export completed with {stats.errors} errors",
            data={
                'dry_run': dry_run,
                'output_dir': str(output_dir),
                'stats': stats.to_dict()
            }
        )

    def _export_stores(
        self,
        output_dir: Path,
        schema_loader: SchemaLoader,
        stats: ExportStats,
        dry_run: bool,
        do_validate: bool
    ) -> Dict[str, Dict]:
        """Export stores and return a mapping of store_id -> store_data."""
        stores = {}

        for store_dir in sorted(self.stores_dir.iterdir()):
            if not store_dir.is_dir():
                continue

            store_file = store_dir / "store.json"
            if not store_file.exists():
                continue

            data = load_json(store_file)
            if data is None:
                stats.errors += 1
                continue

            if do_validate and not schema_loader.validate(data, 'store'):
                stats.errors += 1
                continue

            store_id = data.get('id', store_dir.name)
            stores[store_id] = data
            stats.stores += 1

            if dry_run:
                self.log(f"  Would export store: {store_id}")
            else:
                store_output = output_dir / store_id
                store_output.mkdir(exist_ok=True)
                save_json(store_output / "store.json", data)

                # Copy logo if exists
                for logo_name in ['logo.png', 'logo.jpg', 'logo.svg']:
                    logo_src = store_dir / logo_name
                    if logo_src.exists():
                        import shutil
                        shutil.copy2(logo_src, store_output / logo_name)
                        break

        return stores

    def _export_data(
        self,
        output_dir: Path,
        schema_loader: SchemaLoader,
        stats: ExportStats,
        stores: Dict[str, Dict],
        dry_run: bool,
        do_validate: bool
    ) -> None:
        """Export data directory structure."""
        import shutil

        for brand_dir in sorted(self.data_dir.iterdir()):
            if not brand_dir.is_dir():
                continue

            brand_file = brand_dir / "brand.json"
            if not brand_file.exists():
                continue

            brand_data = load_json(brand_file)
            if brand_data is None:
                stats.errors += 1
                continue

            if do_validate and not schema_loader.validate(brand_data, 'brand'):
                stats.errors += 1
                continue

            brand_name = brand_data.get('name', brand_dir.name)
            stats.brands += 1

            if dry_run:
                self.log(f"  Brand: {brand_name}")
            else:
                brand_output = output_dir / cleanse_folder_name(brand_name)
                brand_output.mkdir(exist_ok=True)
                save_json(brand_output / "brand.json", brand_data)

                # Copy logo
                for logo_name in ['logo.png', 'logo.jpg', 'logo.svg']:
                    logo_src = brand_dir / logo_name
                    if logo_src.exists():
                        shutil.copy2(logo_src, brand_output / logo_name)
                        break

            # Process materials
            for material_dir in sorted(brand_dir.iterdir()):
                if not material_dir.is_dir():
                    continue

                material_file = material_dir / "material.json"
                if not material_file.exists():
                    continue

                material_data = load_json(material_file)
                if material_data is None:
                    stats.errors += 1
                    continue

                material_name = material_data.get('material', material_dir.name)
                stats.materials += 1

                if not dry_run:
                    material_output = brand_output / cleanse_folder_name(material_name)
                    material_output.mkdir(exist_ok=True)
                    save_json(material_output / "material.json", material_data)

                # Process filaments
                for filament_dir in sorted(material_dir.iterdir()):
                    if not filament_dir.is_dir():
                        continue

                    filament_file = filament_dir / "filament.json"
                    if not filament_file.exists():
                        continue

                    filament_data = load_json(filament_file)
                    if filament_data is None:
                        stats.errors += 1
                        continue

                    filament_name = filament_data.get('name', filament_dir.name)
                    stats.filaments += 1

                    if not dry_run:
                        filament_output = material_output / cleanse_folder_name(filament_name)
                        filament_output.mkdir(exist_ok=True)
                        save_json(filament_output / "filament.json", filament_data)

                    # Process variants
                    for variant_dir in sorted(filament_dir.iterdir()):
                        if not variant_dir.is_dir():
                            continue

                        variant_file = variant_dir / "variant.json"
                        sizes_file = variant_dir / "sizes.json"

                        if not variant_file.exists():
                            continue

                        variant_data = load_json(variant_file)
                        if variant_data is None:
                            stats.errors += 1
                            continue

                        variant_name = variant_data.get('name', variant_dir.name)
                        stats.variants += 1

                        # Count sizes and purchase links
                        sizes_data = load_json(sizes_file) if sizes_file.exists() else []
                        if sizes_data:
                            stats.sizes += len(sizes_data)
                            for size in sizes_data:
                                stats.purchase_links += len(size.get('purchase_links', []))

                        if not dry_run:
                            variant_output = filament_output / cleanse_folder_name(variant_name)
                            variant_output.mkdir(exist_ok=True)
                            save_json(variant_output / "variant.json", variant_data)
                            if sizes_data:
                                save_json(variant_output / "sizes.json", sizes_data)
