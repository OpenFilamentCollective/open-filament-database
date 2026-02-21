"""
OFD Validation Module.

Thin wrapper around the ofd_validator Rust package, providing a
ValidationOrchestrator class that preserves the existing API while
delegating all validation logic to ofd-validator.
"""

from pathlib import Path
from typing import Optional

from ofd_validator import (
    ValidationLevel,
    ValidationError,
    ValidationResult,
    validate_all as _validate_all,
    validate_json_files as _validate_json_files,
    validate_logo_files as _validate_logo_files,
    validate_folder_names as _validate_folder_names,
    validate_store_ids as _validate_store_ids,
    validate_gtin_ean as _validate_gtin_ean,
)

try:
    from ofd_validator import validate_all_with_changes as _validate_all_with_changes
except ImportError:
    _validate_all_with_changes = None


class ValidationOrchestrator:
    """Orchestrates all validation tasks using the ofd-validator Rust package."""

    def __init__(self, data_dir: Path = Path("./data"),
                 stores_dir: Path = Path("./stores"),
                 max_workers: Optional[int] = None,
                 **_kwargs):
        self.data_dir = str(data_dir)
        self.stores_dir = str(stores_dir)
        self.max_workers = max_workers

    def validate_json_files(self) -> ValidationResult:
        """Validate all JSON files against schemas."""
        return _validate_json_files(self.data_dir, self.stores_dir,
                                    max_workers=self.max_workers)

    def validate_logo_files(self) -> ValidationResult:
        """Validate all logo files."""
        return _validate_logo_files(self.data_dir, self.stores_dir,
                                    max_workers=self.max_workers)

    def validate_folder_names(self) -> ValidationResult:
        """Validate all folder names."""
        return _validate_folder_names(self.data_dir, self.stores_dir,
                                      max_workers=self.max_workers)

    def validate_store_ids(self) -> ValidationResult:
        """Validate store IDs."""
        return _validate_store_ids(self.data_dir, self.stores_dir)

    def validate_gtin(self) -> ValidationResult:
        """Validate GTIN/EAN rules."""
        return _validate_gtin_ean(self.data_dir)

    def validate_all(self, changes_json: Optional[str] = None) -> ValidationResult:
        """Run all validations, optionally with pending changes applied."""
        if changes_json and _validate_all_with_changes is not None:
            return _validate_all_with_changes(
                self.data_dir, self.stores_dir, changes_json,
                max_workers=self.max_workers)
        return _validate_all(self.data_dir, self.stores_dir,
                             max_workers=self.max_workers)


__all__ = [
    'ValidationLevel',
    'ValidationError',
    'ValidationResult',
    'ValidationOrchestrator',
]
