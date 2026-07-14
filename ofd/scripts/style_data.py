"""
Style Data Script - Sort, sanitize, and validate JSON data files.

This script recursively processes all JSON files in the data/ and stores/
directories to ensure consistent formatting, valid data, and correct naming.

Pipeline (runs in order):
1. Fix folder names: renames hyphenated folders to use underscores. If the
   underscore variant already exists, merges the hyphenated folder into it
   (filling gaps, deduplicating sizes) and deletes the hyphenated folder
   only if the merge completed without errors.
2. Load schemas and extract property key orderings.
3. Process each JSON file:
   a. Sanitize data: fix IDs with hyphens, strip whitespace from strings,
      remove empty optional string fields (URLs, identifiers, etc.),
      default sizes[].diameter from 0 to 1.75.
   b. Sort keys according to schema ordering.
4. Warn about keys found in data but not in schema.
5. Validate all files using the ofd-validator (always, unless --dry-run).
6. Enforce 2-space indentation across all JSON files.
"""

import argparse
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from ofd.base import BaseScript, ScriptResult, register_script
from ofd.merge import merge_has_errors, merge_trees
from ofd.validation import ValidationOrchestrator

# The canonical ID pattern from the schemas
ID_PATTERN = re.compile(r"^[a-z0-9+]+(_[a-z0-9+]+)*$")

# Fields where an empty string should be removed entirely
OPTIONAL_STRING_FIELDS = {
    "data_sheet_url",
    "safety_sheet_url",
    "website",
    "storefront_url",
    "source",
    "article_number",
    "barcode_identifier",
    "nfc_identifier",
    "qr_identifier",
    "gtin",
    "ean",
}

# URL fields whose tracking/affiliate query params should be stripped.
URL_FIELDS = {"url", "data_sheet_url", "safety_sheet_url", "storefront_url", "website"}

# Known tracking query-parameter keys (lowercased). Keep in sync with the ofd-validator Rust
# rule (crates/ofd-validator-core/src/validators/url_tracker.rs) and the webui urlSanitizer.ts.
_TRACKING_PARAMS = {
    "tag",
    "linkcode",
    "psc",
    "th",
    "ref",
    "ref_",
    "fbclid",
    "gclid",
    "gclsrc",
    "dclid",
    "msclkid",
    "yclid",
    "twclid",
    "ttclid",
    "igshid",
    "si",
    "mc_cid",
    "mc_eid",
    "_pos",
    "_psq",
    "_ss",
    "_v",
    "_sid",
    "spm",
    "scm",
    "aff",
    "affid",
    "srsltid",
    "gad_source",
    "epik",
    "pk_campaign",
    "pk_kwd",
    # Amazon / marketplace search-result context (identity is the /dp/<ASIN> path)
    "dib",
    "dib_tag",
    "keywords",
    "qid",
    "sr",
    "sprefix",
    "crid",
    "ascsubtag",
    "smid",
    "content-id",
    "qsid",
    "rnid",
    "refinements",
    "_encoding",
    "pldnsite",
}
_TRACKING_PREFIXES = ("utm_", "mc_", "pk_", "pd_rd_", "pf_rd_")
# Hosts where the product identity is entirely in the path, so the whole query is disposable.
_WHOLE_QUERY_HOSTS = re.compile(r"(^|\.)(amazon|ebay)\.[a-z.]+$")
_SHORTLINK_HOSTS = {"a.co", "amzn.to", "amzn.eu"}


def _is_tracking_key(key: str) -> bool:
    k = key.strip().lower()
    return k.startswith(_TRACKING_PREFIXES) or k in _TRACKING_PARAMS


def _is_tracking_fragment(fragment: str) -> bool:
    if "=" not in fragment:
        return False
    return _is_tracking_key(re.split(r"[&=]", fragment, maxsplit=1)[0])


def strip_tracking_params(url: str) -> str:
    """Remove known tracking/affiliate params (plus an empty '?' and tracking-only fragments)
    from a URL, preserving everything else. Idempotent. Mirrors the ofd-validator Rust rule
    and the webui urlSanitizer.ts.
    """
    if not url:
        return url

    before_frag, frag = (url.split("#", 1) + [None])[:2]
    base, query = (before_frag.split("?", 1) + [None])[:2]

    try:
        host = (urlsplit(base).hostname or "").lower()
    except ValueError:
        host = ""
    drop_all = bool(_WHOLE_QUERY_HOSTS.search(host)) or host in _SHORTLINK_HOSTS

    out = base
    if query is not None and not drop_all:
        kept = [
            pair
            for pair in query.split("&")
            if pair and not _is_tracking_key(pair.split("=", 1)[0])
        ]
        if kept:
            out += "?" + "&".join(kept)

    if frag and not _is_tracking_fragment(frag):
        out += "#" + frag

    return out


@dataclass
class SchemaInfo:
    """Holds key ordering information for a schema."""

    keys: list[str] = field(default_factory=list)
    nested: dict[str, list[str]] = field(default_factory=dict)


@dataclass
class ProcessingStats:
    """Statistics for file processing."""

    files_processed: int = 0
    files_modified: int = 0
    files_skipped: int = 0
    extra_keys_found: int = 0

    def to_dict(self) -> dict[str, int]:
        """Convert to dictionary for JSON serialization."""
        return {
            "files_processed": self.files_processed,
            "files_modified": self.files_modified,
            "files_skipped": self.files_skipped,
            "extra_keys_found": self.extra_keys_found,
        }


def load_json(path: Path) -> dict[str, Any] | None:
    """Load JSON from file with error handling."""
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"Error loading {path}: {e}")
        return None


def save_json(path: Path, data: Any, dry_run: bool) -> None:
    """Save JSON to file with consistent formatting."""
    if dry_run:
        return
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def fix_slug(name: str) -> str:
    """Fix a slug by replacing hyphens with underscores and lowercasing."""
    return name.replace("-", "_").lower().strip()


def sanitize_data(data: Any, schema_name: str) -> tuple[Any, list[str]]:
    """Sanitize a JSON data structure in-place.

    Returns (cleaned_data, list_of_change_descriptions).

    Fixes applied per schema type:
    - All dicts: strip leading/trailing whitespace from string values;
      remove empty-string values for optional fields (URLs, identifiers
      defined in OPTIONAL_STRING_FIELDS); fix 'id' fields containing
      hyphens by replacing with underscores.
    - sizes: default sizes[].diameter from 0 to 1.75; sanitize nested
      purchase_links dicts.
    """
    changes: list[str] = []

    if schema_name == "sizes" and isinstance(data, list):
        for i, size in enumerate(data):
            if not isinstance(size, dict):
                continue
            if size.get("diameter") == 0:
                size["diameter"] = 1.75
                changes.append(f"sizes[{i}].diameter: 0 -> 1.75")
            _sanitize_dict(size, changes, f"sizes[{i}]")
            # Sanitize nested purchase_links
            for j, link in enumerate(size.get("purchase_links", [])):
                if isinstance(link, dict):
                    _sanitize_dict(link, changes, f"sizes[{i}].purchase_links[{j}]")
        return data, changes

    if isinstance(data, dict):
        # Fix ID field
        raw_id = data.get("id")
        if isinstance(raw_id, str) and not ID_PATTERN.match(raw_id):
            fixed = fix_slug(raw_id)
            if ID_PATTERN.match(fixed):
                data["id"] = fixed
                changes.append(f"id: '{raw_id}' -> '{fixed}'")

        _sanitize_dict(data, changes)
        return data, changes

    return data, changes


def _sanitize_dict(data: dict[str, Any], changes: list[str], prefix: str = "") -> None:
    """Sanitize string fields in a dict in-place."""
    dot = f"{prefix}." if prefix else ""
    keys_to_remove = []

    for key, value in data.items():
        if not isinstance(value, str):
            continue

        # Strip whitespace
        stripped = value.strip()
        if stripped != value:
            data[key] = stripped
            changes.append(f"{dot}{key}: stripped whitespace")
            value = stripped

        # Strip tracking/affiliate params from URL fields
        if key in URL_FIELDS and value:
            cleaned = strip_tracking_params(value)
            if cleaned != value:
                data[key] = cleaned
                changes.append(f"{dot}{key}: stripped tracking parameters")
                value = cleaned

        # Remove empty optional strings
        if value == "" and key in OPTIONAL_STRING_FIELDS:
            keys_to_remove.append(key)
            changes.append(f"{dot}{key}: removed empty string")

    for key in keys_to_remove:
        del data[key]


def fix_folder_names(root_dir: Path, dry_run: bool) -> list[str]:
    """Fix folders containing hyphens: rename or merge into underscore variant.

    Walks bottom-up so child renames happen before parent renames.
    If the underscore target does not exist, the folder is simply renamed.
    If the target already exists, the source is merged into it using
    merge_trees (existing data wins, sizes deduplicated). The source is
    only deleted if the merge had no errors (no skipped/unreadable files).

    Returns a list of action descriptions.
    """
    actions: list[str] = []
    if not root_dir.exists():
        return actions

    # Collect all dirs with hyphens, deepest first
    hyphenated: list[Path] = []
    for dirpath in sorted(root_dir.rglob("*"), reverse=True):
        if dirpath.is_dir() and "-" in dirpath.name:
            hyphenated.append(dirpath)

    for folder in hyphenated:
        fixed_name = fix_slug(folder.name)
        if not ID_PATTERN.match(fixed_name):
            continue
        new_path = folder.parent / fixed_name
        if new_path.exists():
            # Target exists — merge source into target, then delete source
            merge_actions = merge_trees(new_path, folder, dry_run=dry_run)
            for ma in merge_actions:
                actions.append(f"  {fixed_name}/: {ma}")
            if dry_run:
                actions.append(f"Would merge & delete: {folder.name} -> {fixed_name}")
            elif merge_has_errors(merge_actions):
                actions.append(f"NOT deleted: {folder.name} (merge had errors, review above)")
            else:
                import shutil

                shutil.rmtree(folder)
                actions.append(f"Merged & deleted: {folder.name} -> {fixed_name}")
        else:
            if dry_run:
                actions.append(f"Would rename: {folder.name} -> {fixed_name}")
            else:
                folder.rename(new_path)
                actions.append(f"Renamed: {folder.name} -> {fixed_name}")

    return actions


def load_schemas(schemas_dir: Path) -> dict[str, dict[str, Any]]:
    """Load all JSON schemas from the schemas directory."""
    schemas = {}

    if not schemas_dir.exists():
        print(f"Error: {schemas_dir} directory not found")
        return schemas

    for schema_file in schemas_dir.glob("*.json"):
        try:
            with open(schema_file, encoding="utf-8") as f:
                schemas[schema_file.stem] = json.load(f)
        except json.JSONDecodeError as e:
            print(f"Error parsing {schema_file.name}: {e}")

    return schemas


def get_property_order(schema: dict[str, Any]) -> list[str]:
    """Extract the order of properties from a JSON schema."""
    if "properties" in schema:
        return list(schema["properties"].keys())
    return []


def extract_nested_schemas(schema: dict[str, Any]) -> dict[str, list[str]]:
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


def build_key_order_map(schemas_dir: Path) -> dict[str, SchemaInfo]:
    """Build a mapping of schema names to their key orderings."""
    schemas = load_schemas(schemas_dir)
    key_order_map = {}

    for schema_name, schema_content in schemas.items():
        clean_name = schema_name.replace("_schema", "")

        if schema_content.get("type") == "array" and "items" in schema_content:
            items_schema = schema_content["items"]
            keys = get_property_order(items_schema)
            nested = extract_nested_schemas(items_schema)
        else:
            keys = get_property_order(schema_content)
            nested = extract_nested_schemas(schema_content)

        key_order_map[clean_name] = SchemaInfo(keys=keys, nested=nested)

    return key_order_map


def sort_json_keys(data: Any, schema_info: SchemaInfo, extra_keys: set[str]) -> Any:
    """Recursively sort JSON keys according to schema ordering."""
    if isinstance(data, dict):
        ordered = {}
        remaining_keys = set(data.keys())

        for key in schema_info.keys:
            if key in data:
                value = data[key]

                if key in schema_info.nested:
                    nested_info = SchemaInfo(
                        keys=schema_info.nested[key], nested=schema_info.nested
                    )

                    if isinstance(value, list):
                        value = [
                            sort_json_keys(item, nested_info, extra_keys)
                            if isinstance(item, dict)
                            else item
                            for item in value
                        ]
                    else:
                        value = sort_json_keys(value, nested_info, extra_keys)
                elif isinstance(value, dict):
                    value = sort_json_keys(value, SchemaInfo(), extra_keys)
                elif isinstance(value, list):
                    value = [
                        sort_json_keys(item, schema_info, extra_keys)
                        if isinstance(item, dict)
                        else item
                        for item in value
                    ]

                ordered[key] = value
                remaining_keys.remove(key)

        if remaining_keys:
            extra_keys.update(remaining_keys)
            for key in sorted(remaining_keys):
                value = data[key]
                if isinstance(value, dict):
                    value = sort_json_keys(value, SchemaInfo(), extra_keys)
                elif isinstance(value, list):
                    value = [
                        sort_json_keys(item, SchemaInfo(), extra_keys)
                        if isinstance(item, dict)
                        else item
                        for item in value
                    ]
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
    """Sort, sanitize, merge, and validate JSON data files.

    Fixes folder names (merging duplicates), sanitizes field values,
    sorts keys per schema, and validates via ofd-validator.
    """

    name = "style_data"
    description = "Sort, sanitize, and validate data files (keys, IDs, folders, empty fields)"

    def configure_parser(self, parser: argparse.ArgumentParser) -> None:
        """Add script-specific arguments."""
        parser.add_argument(
            "--dry-run", action="store_true", help="Preview changes without modifying files"
        )
        parser.add_argument(
            "--fix-indent-only",
            action="store_true",
            help="Only fix indentation to 2 spaces across all JSON files (skip sorting)",
        )
        parser.add_argument(
            "--format-stdin",
            action="store_true",
            help="Read JSON from stdin, sort keys per schema, output styled JSON to stdout",
        )
        parser.add_argument(
            "--schema-type",
            type=str,
            choices=["brand", "material", "filament", "variant", "store", "sizes"],
            help="Schema type to use when formatting stdin (required with --format-stdin)",
        )

    def _fix_json_indentation(self, file_path: Path, dry_run: bool, stats: ProcessingStats) -> bool:
        """Fix indentation of a JSON file to use 2 spaces."""
        data = load_json(file_path)
        if data is None:
            stats.files_skipped += 1
            return False

        try:
            with open(file_path, encoding="utf-8") as f:
                original_content = f.read()
        except OSError as e:
            self.log(f"Error reading {file_path}: {e}")
            stats.files_skipped += 1
            return False

        new_content = json.dumps(data, indent=2, ensure_ascii=False) + "\n"

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
                    with open(file_path, "w", encoding="utf-8") as f:
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

        json_files = list(self.project_root.rglob("*.json"))

        excluded_dirs = {"node_modules", ".git", "dist", "build", ".venv", "venv"}
        json_files = [f for f in json_files if not any(part in excluded_dirs for part in f.parts)]

        for json_file in sorted(json_files):
            self._fix_json_indentation(json_file, dry_run, stats)

        return stats

    def run(self, args: argparse.Namespace) -> ScriptResult:
        """Execute the style_data script."""
        dry_run = getattr(args, "dry_run", False)
        fix_indent_only = getattr(args, "fix_indent_only", False)
        format_stdin = getattr(args, "format_stdin", False)
        schema_type = getattr(args, "schema_type", None)

        # Handle --format-stdin mode: read JSON from stdin, sort keys, output to stdout
        if format_stdin:
            # Disable json_mode so main() doesn't append result dict to stdout
            self.json_mode = False

            if not schema_type:
                return ScriptResult(
                    success=False, message="--schema-type is required with --format-stdin"
                )

            import sys

            try:
                input_data = json.loads(sys.stdin.read())
            except json.JSONDecodeError as e:
                return ScriptResult(success=False, message=f"Invalid JSON input: {e}")

            key_order_map = build_key_order_map(self.schemas_dir)
            if schema_type not in key_order_map:
                return ScriptResult(success=False, message=f"Unknown schema type: {schema_type}")

            extra_keys: set[str] = set()
            styled = sort_json_keys(input_data, key_order_map[schema_type], extra_keys)
            # Output styled JSON with 2-space indent (matching repo convention) + trailing newline
            print(json.dumps(styled, indent=2, ensure_ascii=False))

            return ScriptResult(
                success=True,
                message="Formatted successfully",
                data={"extra_keys": sorted(extra_keys)} if extra_keys else {},
            )

        if dry_run:
            self.log("=== DRY RUN MODE - No files will be modified ===\n")

        # Handle --fix-indent-only mode
        if fix_indent_only:
            self.emit_progress("fixing_indentation", 0, "Fixing indentation for all JSON files...")
            total_stats = self._fix_all_json_indentation(dry_run)
            self.emit_progress("fixing_indentation", 100, "Indentation fixes complete")

            self.log(f"\n{'=' * 60}")
            self.log("DRY RUN SUMMARY - INDENTATION FIX" if dry_run else "INDENTATION FIX SUMMARY")
            self.log("=" * 60)
            self.log(f"Files processed: {total_stats.files_processed}")
            self.log(f"Files modified: {total_stats.files_modified}")
            self.log(f"Files skipped: {total_stats.files_skipped}")
            self.log("\nDone!")

            return ScriptResult(
                success=True,
                message="Indentation fix complete",
                data={
                    "dry_run": dry_run,
                    "mode": "fix_indent_only",
                    "stats": total_stats.to_dict(),
                },
            )

        # Step 1: Fix folder names (hyphens → underscores)
        self.emit_progress("fixing_folders", 0, "Fixing folder names...")
        self.log("Fixing folder names...")
        folder_renames: list[str] = []
        for directory in [self.data_dir, self.stores_dir]:
            folder_renames.extend(fix_folder_names(directory, dry_run))
        for rename in folder_renames:
            self.log(f"  {rename}")
        if not folder_renames:
            self.log("  No folder renames needed")
        self.emit_progress("fixing_folders", 100, "Folder names fixed")

        # Step 2: Build key order mapping from schemas
        self.emit_progress("loading_schemas", 0, "Loading schemas...")
        self.log("\nLoading schemas...")
        key_order_map = build_key_order_map(self.schemas_dir)
        self.emit_progress("loading_schemas", 100, f"Loaded {len(key_order_map)} schemas")
        self.log(f"Loaded {len(key_order_map)} schemas\n")

        # Step 3: Process (sanitize + sort) data directory
        data_stats = ProcessingStats()
        if self.data_dir.exists():
            self.emit_progress("sorting_data", 0, "Processing data directory...")
            data_stats = self._process_data_directory(key_order_map, dry_run)
            self.emit_progress("sorting_data", 100, "Data directory processing complete")
        else:
            self.log(f"Data directory not found: {self.data_dir}")

        # Step 4: Process (sanitize + sort) stores directory
        stores_stats = ProcessingStats()
        if self.stores_dir.exists():
            self.emit_progress("sorting_stores", 0, "Processing stores directory...")
            stores_stats = self._process_stores_directory(key_order_map, dry_run)
            self.emit_progress("sorting_stores", 100, "Stores directory processing complete")
        else:
            self.log(f"Stores directory not found: {self.stores_dir}")

        # Merge statistics
        total_stats = ProcessingStats(
            files_processed=data_stats.files_processed + stores_stats.files_processed,
            files_modified=data_stats.files_modified + stores_stats.files_modified,
            files_skipped=data_stats.files_skipped + stores_stats.files_skipped,
            extra_keys_found=data_stats.extra_keys_found + stores_stats.extra_keys_found,
        )

        # Step 5: Always validate after styling (unless dry-run)
        validation_data = None
        if not dry_run:
            self.emit_progress("validation", 0, "Running validation...")
            self.log(f"\n{'=' * 60}")
            self.log("VALIDATING FILES")
            self.log("=" * 60)

            orchestrator = ValidationOrchestrator(
                self.data_dir, self.stores_dir, progress_mode=self.progress_mode
            )
            validation_result = orchestrator.validate_all()
            self.emit_progress("validation", 100, "Validation complete")
            validation_data = validation_result.to_dict()

            if not validation_result.is_valid:
                self.log(f"\nValidation failed: {validation_result.error_count} error(s)")
                for error in validation_result.errors:
                    self.log(f"  {error}")

                return ScriptResult(
                    success=False,
                    message=f"Validation failed: {validation_result.error_count} errors",
                    data={
                        "dry_run": dry_run,
                        "stats": total_stats.to_dict(),
                        "folder_renames": folder_renames,
                        "validation": validation_data,
                    },
                )
            else:
                self.log("Validation passed!")

        # Summary
        self.log(f"\n{'=' * 60}")
        self.log("DRY RUN SUMMARY" if dry_run else "STYLING SUMMARY")
        self.log("=" * 60)
        if folder_renames:
            self.log(
                f"Folders renamed: {len([r for r in folder_renames if not r.startswith('SKIP')])}"
            )
        self.log(f"Files processed: {total_stats.files_processed}")
        self.log(f"Files modified: {total_stats.files_modified}")
        self.log(f"Files skipped: {total_stats.files_skipped}")
        if total_stats.extra_keys_found > 0:
            self.log(f"Extra keys found: {total_stats.extra_keys_found}")
        self.log("\nDone!")

        result_data: dict[str, Any] = {"dry_run": dry_run, "stats": total_stats.to_dict()}
        if folder_renames:
            result_data["folder_renames"] = folder_renames
        if validation_data:
            result_data["validation"] = validation_data

        return ScriptResult(success=True, message="Styling complete", data=result_data)

    def _process_json_file(
        self,
        file_path: Path,
        schema_name: str,
        key_order_map: dict[str, SchemaInfo],
        dry_run: bool,
        stats: ProcessingStats,
    ) -> bool:
        """Process a single JSON file: sanitize data, then sort keys."""
        data = load_json(file_path)
        if data is None:
            stats.files_skipped += 1
            return False

        if schema_name not in key_order_map:
            self.log(f"  Warning: No schema found for {schema_name}")
            stats.files_skipped += 1
            return False

        # Sanitize data (fix IDs, empty strings, defaults)
        data, sanitize_changes = sanitize_data(data, schema_name)
        for change in sanitize_changes:
            try:
                rel_path = file_path.relative_to(self.project_root)
            except ValueError:
                rel_path = file_path
            if dry_run:
                self.log(f"  Would fix {rel_path}: {change}")
            else:
                self.log(f"  Fixed {rel_path}: {change}")

        # Sort keys according to schema
        schema_info = key_order_map[schema_name]
        extra_keys: set[str] = set()

        sorted_data = sort_json_keys(data, schema_info, extra_keys)

        if extra_keys:
            self.log(f"  Warning: Extra keys in {file_path.name}: {sorted(extra_keys)}")
            stats.extra_keys_found += len(extra_keys)

        original_json = json.dumps(data, ensure_ascii=False, sort_keys=False)
        sorted_json = json.dumps(sorted_data, ensure_ascii=False, sort_keys=False)

        stats.files_processed += 1

        modified = bool(sanitize_changes) or (original_json != sorted_json)
        if modified:
            if dry_run:
                self.log(f"  Would sort: {file_path.name}")
            else:
                self.log(f"  Sorted: {file_path.name}")
            save_json(file_path, sorted_data, dry_run)
            stats.files_modified += 1
            return True

        return False

    def _process_data_directory(
        self, key_order_map: dict[str, SchemaInfo], dry_run: bool
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
                    self._process_json_file(
                        material_file, "material", key_order_map, dry_run, stats
                    )

                for filament_dir in sorted(material_dir.iterdir()):
                    if not filament_dir.is_dir():
                        continue

                    filament_file = filament_dir / "filament.json"
                    if filament_file.exists():
                        self._process_json_file(
                            filament_file, "filament", key_order_map, dry_run, stats
                        )

                    for variant_dir in sorted(filament_dir.iterdir()):
                        if not variant_dir.is_dir():
                            continue

                        variant_file = variant_dir / "variant.json"
                        if variant_file.exists():
                            self._process_json_file(
                                variant_file, "variant", key_order_map, dry_run, stats
                            )

                        sizes_file = variant_dir / "sizes.json"
                        if sizes_file.exists():
                            self._process_json_file(
                                sizes_file, "sizes", key_order_map, dry_run, stats
                            )

        return stats

    def _process_stores_directory(
        self, key_order_map: dict[str, SchemaInfo], dry_run: bool
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
