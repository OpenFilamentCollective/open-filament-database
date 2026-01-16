"""
Validator classes for OFD CLI.

This module contains all the validator implementations for validating
data files, logos, folder names, store IDs, and GTIN/EAN codes.
"""

import json
import re
from pathlib import Path
from typing import Any, Dict, Optional

from PIL import Image
from jsonschema import validate, ValidationError as JsonSchemaValidationError
from referencing import Registry, Resource
from referencing.exceptions import Unresolvable

from .types import ValidationError, ValidationLevel, ValidationResult


# -------------------------
# Configuration & Constants
# -------------------------

ILLEGAL_CHARACTERS = [
    "#", "%", "&", "{", "}", "\\", "<", ">", "*", "?",
    "/", "$", "!", "'", '"', ":", "@", "`", "|", "="
]

LOGO_MIN_SIZE = 100
LOGO_MAX_SIZE = 400
SNAKE_CASE_PATTERN = re.compile(r'^[a-z0-9+]+(?:_[a-z0-9+]+)*$')
LOGO_NAME_PATTERN = re.compile(r'^logo\.(png|jpg|svg)$')


# -------------------------
# Utility Functions
# -------------------------

def load_json(path: Path) -> Optional[Dict[str, Any]]:
    """Load JSON from file with error handling."""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def cleanse_folder_name(name: str) -> str:
    """Clean folder name by replacing slashes and stripping whitespace."""
    return name.replace("/", " ").strip()


# -------------------------
# Schema Cache
# -------------------------

class SchemaCache:
    """Lazy-loading cache for JSON schemas."""

    def __init__(self, schemas_dir: Optional[Path] = None):
        self._schemas: Dict[str, Dict] = {}
        self._schemas_dir = schemas_dir or Path("schemas")
        self._schema_paths = {
            'store':          self._schemas_dir / 'store_schema.json',
            'brand':          self._schemas_dir / 'brand_schema.json',
            'material':       self._schemas_dir / 'material_schema.json',
            'material_types': self._schemas_dir / 'material_types_schema.json',
            'filament':       self._schemas_dir / 'filament_schema.json',
            'variant':        self._schemas_dir / 'variant_schema.json',
            'sizes':          self._schemas_dir / 'sizes_schema.json',
        }

    def get(self, schema_name: str) -> Optional[Dict]:
        """Get schema by name, loading if necessary."""
        if schema_name not in self._schemas:
            path = self._schema_paths.get(schema_name)
            if path and path.exists():
                self._schemas[schema_name] = load_json(path)
        return self._schemas.get(schema_name)

    def all_schemas(self) -> Dict[str, Optional[Dict]]:
        """Return a mapping of schema path keys to loaded schema dicts.

        Keys are the stored path (e.g. 'schemas/..') to support lookups by
        relative filenames and full relative paths used in $ref values.
        """
        for name, path in self._schema_paths.items():
            if name not in self._schemas:
                if path.exists():
                    self._schemas[name] = load_json(path)

        # Build mapping of candidate keys -> schema content
        mapping: Dict[str, Optional[Dict]] = {}
        for name, path in self._schema_paths.items():
            schema = self._schemas.get(name)
            relpath = str(path)
            mapping[relpath] = schema
            # also expose the filename with a leading './' as some $refs use that
            mapping[f"./{path.name}"] = schema

        return mapping


# -------------------------
# Validators
# -------------------------

class BaseValidator:
    """Base class for all validators."""

    def __init__(self, schema_cache: Optional[SchemaCache] = None):
        self.schema_cache = schema_cache or SchemaCache()

    def validate(self, *args, **kwargs) -> ValidationResult:
        """Override in subclasses."""
        raise NotImplementedError


class JsonValidator(BaseValidator):
    """Validates JSON files against schemas."""

    def validate_json_file(self, json_path: Path, schema_name: str) -> ValidationResult:
        """Validate a single JSON file against a schema."""
        result = ValidationResult()

        data = load_json(json_path)
        if data is None:
            result.add_error(ValidationError(
                level=ValidationLevel.ERROR,
                category="JSON",
                message="Failed to load JSON file",
                path=json_path
            ))
            return result

        schema = self.schema_cache.get(schema_name)
        if schema is None:
            result.add_error(ValidationError(
                level=ValidationLevel.ERROR,
                category="JSON",
                message=f"Schema '{schema_name}' not found",
                path=json_path
            ))
            return result

        try:
            # Build registry for referencing library to handle external $ref
            resources = []

            # Register all known schemas under both their stored path and
            # a './filename' key since many schemas use relative './name.json' refs.
            all_schemas = self.schema_cache.all_schemas()
            for key, s in all_schemas.items():
                if s is None:
                    continue
                try:
                    resources.append((key, Resource.from_contents(s)))
                except Exception:
                    # skip schemas that cannot be read into a Resource
                    continue
                sid = s.get('$id', '')
                if sid:
                    try:
                        resources.append((sid, Resource.from_contents(s)))
                    except Exception:
                        pass

            # Also ensure the main schema is registered by its $id if present
            main_id = schema.get('$id', '')
            if main_id:
                try:
                    resources.append((main_id, Resource.from_contents(schema)))
                except Exception:
                    pass

            registry = Registry().with_resources(resources)
            validate(data, schema, registry=registry)
        except JsonSchemaValidationError as e:
            result.add_error(ValidationError(
                level=ValidationLevel.ERROR,
                category="JSON",
                message=f"Schema validation failed: {e.message} at {e.json_path}",
                path=json_path
            ))
        except Unresolvable as e:
            result.add_error(ValidationError(
                level=ValidationLevel.ERROR,
                category="JSON",
                message=f"Schema reference error: {e}",
                path=json_path
            ))

        return result


class LogoValidator(BaseValidator):
    """Validates logo files (dimensions and naming)."""

    def validate_logo_file(self, logo_path: Path,
                           logo_name: str = None) -> ValidationResult:
        """Validate logo dimensions and naming convention."""
        result = ValidationResult()

        # Check if logo name contains "/" (should be just filename)
        if logo_name and "/" in logo_name:
            result.add_error(ValidationError(
                level=ValidationLevel.ERROR,
                category="Logo",
                message=f"Logo path '{logo_name}' contains '/' - only use filename",
                path=logo_path.parent
            ))

        if not logo_path.exists():
            result.add_error(ValidationError(
                level=ValidationLevel.ERROR,
                category="Logo",
                message="Logo file not found",
                path=logo_path
            ))
            return result

        # Validate naming convention
        name = logo_path.name
        if not LOGO_NAME_PATTERN.fullmatch(name):
            result.add_error(ValidationError(
                level=ValidationLevel.ERROR,
                category="Logo",
                message=f"Logo name '{name}' must be 'logo.png', 'logo.jpg' or 'logo.svg'",
                path=logo_path
            ))

        # Validate dimensions for raster images (skip SVG which need special handling)
        if not name.endswith('.svg'):
            try:
                with Image.open(logo_path) as img:
                    width, height = img.size

                    if width != height:
                        result.add_error(ValidationError(
                            level=ValidationLevel.ERROR,
                            category="Logo",
                            message=f"Logo must be square (width={width}, height={height})",
                            path=logo_path
                        ))

                    if width < LOGO_MIN_SIZE or height < LOGO_MIN_SIZE:
                        result.add_error(ValidationError(
                            level=ValidationLevel.ERROR,
                            category="Logo",
                            message=f"Logo dimensions too small (minimum {LOGO_MIN_SIZE}x{LOGO_MIN_SIZE})",
                            path=logo_path
                        ))

                    if width > LOGO_MAX_SIZE or height > LOGO_MAX_SIZE:
                        result.add_error(ValidationError(
                            level=ValidationLevel.ERROR,
                            category="Logo",
                            message=f"Logo dimensions too large (maximum {LOGO_MAX_SIZE}x{LOGO_MAX_SIZE})",
                            path=logo_path
                        ))
            except Exception as e:
                result.add_error(ValidationError(
                    level=ValidationLevel.ERROR,
                    category="Logo",
                    message=f"Failed to read image: {str(e)}",
                    path=logo_path
                ))

        return result


class FolderNameValidator(BaseValidator):
    """Validates that folder names match JSON content."""

    def validate_folder_name(self, folder_path: Path, json_file: str,
                             json_key: str) -> ValidationResult:
        """Validate that folder name matches the value in the JSON file."""
        result = ValidationResult()

        json_path = folder_path / json_file
        if not json_path.exists():
            result.add_error(ValidationError(
                level=ValidationLevel.ERROR,
                category="Folder",
                message=f"Missing {json_file}",
                path=folder_path
            ))
            return result

        data = load_json(json_path)
        if data is None:
            return result

        expected_name = cleanse_folder_name(data.get(json_key, ""))
        actual_name = folder_path.name

        if actual_name != expected_name:
            # Check if it's due to illegal characters
            has_illegal_chars = any(
                char in expected_name for char in ILLEGAL_CHARACTERS)

            if not has_illegal_chars:
                result.add_error(ValidationError(
                    level=ValidationLevel.ERROR,
                    category="Folder",
                    message=f"Folder name '{actual_name}' does not match '{json_key}' value '{expected_name}' in {json_file}",
                    path=folder_path
                ))

        return result


class StoreIdValidator(BaseValidator):
    """Validates that store IDs in purchase links are valid."""

    def validate_store_ids(self, data_dir: Path, stores_dir: Path) -> ValidationResult:
        """Validate all store IDs referenced in sizes.json files."""
        result = ValidationResult()

        # Collect valid store IDs
        valid_store_ids = set()
        for store_file in stores_dir.glob("*/store.json"):
            data = load_json(store_file)
            if data and "id" in data:
                valid_store_ids.add(data["id"])

        # Validate references in sizes.json files
        for sizes_file in data_dir.glob("**/sizes.json"):
            sizes_data = load_json(sizes_file)
            if not sizes_data:
                continue

            for size_idx, size in enumerate(sizes_data):
                for link_idx, link in enumerate(size.get("purchase_links", [])):
                    store_id = link.get("store_id")
                    if store_id and store_id not in valid_store_ids:
                        result.add_error(ValidationError(
                            level=ValidationLevel.ERROR,
                            category="StoreID",
                            message=f"Invalid store_id '{store_id}' at $[{size_idx}].purchase_links[{link_idx}]",
                            path=sizes_file
                        ))

        return result


class GTINValidator(BaseValidator):
    """Validates GTIN/EAN fields across data (server-side rules)."""

    GTIN_RE = re.compile(r"^[0-9]{12,13}$")
    EAN_RE = re.compile(r"^[0-9]{13}$")

    def validate_gtin_ean(self, data_dir: Path) -> ValidationResult:
        """Validate GTIN/EAN fields in all sizes.json files."""
        result = ValidationResult()

        for sizes_file in data_dir.glob("**/sizes.json"):
            sizes_data = load_json(sizes_file)
            if not sizes_data:
                continue

            for idx, size in enumerate(sizes_data):
                gtin = size.get("gtin")
                ean = size.get("ean")

                # Optional fields, but if present must match regex
                if gtin is not None:
                    if not isinstance(gtin, str) or not self.GTIN_RE.fullmatch(gtin):
                        result.add_error(ValidationError(
                            level=ValidationLevel.ERROR,
                            category="GTIN",
                            message=f"Invalid gtin at $[{idx}]: must be 12 or 13 digits",
                            path=sizes_file
                        ))

                if ean is not None:
                    if not isinstance(ean, str) or not self.EAN_RE.fullmatch(ean):
                        result.add_error(ValidationError(
                            level=ValidationLevel.ERROR,
                            category="EAN",
                            message=f"Invalid ean at $[{idx}]: must be exactly 13 digits",
                            path=sizes_file
                        ))

                # When both present: if both 13 digits, must match. If gtin is 12, allow ean empty/different.
                if isinstance(gtin, str) and isinstance(ean, str):
                    if len(gtin) == 13 and len(ean) == 13 and gtin != ean:
                        result.add_error(ValidationError(
                            level=ValidationLevel.ERROR,
                            category="GTIN/EAN",
                            message=f"Mismatch at $[{idx}]: gtin and ean are both 13 digits but not equal",
                            path=sizes_file
                        ))

        return result


class MissingFileValidator(BaseValidator):
    """Validates that required JSON files exist."""

    def validate_required_files(self, data_dir: Path,
                                stores_dir: Path) -> ValidationResult:
        """Check for missing required JSON files."""
        result = ValidationResult()

        # Check brand directories
        for brand_dir in data_dir.iterdir():
            if not brand_dir.is_dir():
                continue

            brand_file = brand_dir / "brand.json"
            if not brand_file.exists():
                result.add_error(ValidationError(
                    level=ValidationLevel.ERROR,
                    category="Missing File",
                    message="Missing brand.json",
                    path=brand_dir
                ))

            # Check material directories
            for material_dir in brand_dir.iterdir():
                if not material_dir.is_dir():
                    continue

                material_file = material_dir / "material.json"
                if not material_file.exists():
                    result.add_error(ValidationError(
                        level=ValidationLevel.ERROR,
                        category="Missing File",
                        message="Missing material.json",
                        path=material_dir
                    ))

                # Check filament directories
                for filament_dir in material_dir.iterdir():
                    if not filament_dir.is_dir():
                        continue

                    filament_file = filament_dir / "filament.json"
                    if not filament_file.exists():
                        result.add_error(ValidationError(
                            level=ValidationLevel.ERROR,
                            category="Missing File",
                            message="Missing filament.json",
                            path=filament_dir
                        ))

                    # Check variant directories
                    for variant_dir in filament_dir.iterdir():
                        if not variant_dir.is_dir():
                            continue

                        variant_file = variant_dir / "variant.json"
                        if not variant_file.exists():
                            result.add_error(ValidationError(
                                level=ValidationLevel.ERROR,
                                category="Missing File",
                                message="Missing variant.json",
                                path=variant_dir
                            ))

                        sizes_file = variant_dir / "sizes.json"
                        if not sizes_file.exists():
                            result.add_error(ValidationError(
                                level=ValidationLevel.ERROR,
                                category="Missing File",
                                message="Missing sizes.json",
                                path=variant_dir
                            ))

        # Check store directories
        for store_dir in stores_dir.iterdir():
            if not store_dir.is_dir():
                continue

            store_file = store_dir / "store.json"
            if not store_file.exists():
                result.add_error(ValidationError(
                    level=ValidationLevel.ERROR,
                    category="Missing File",
                    message="Missing store.json",
                    path=store_dir
                ))

        return result
