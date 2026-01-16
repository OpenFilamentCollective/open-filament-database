"""
OFD Validation Module.

This module provides comprehensive validation for the Open Filament Database.
"""

from .types import (
    ValidationLevel,
    ValidationError,
    ValidationResult,
    ValidationTask,
)

from .validators import (
    SchemaCache,
    BaseValidator,
    JsonValidator,
    LogoValidator,
    FolderNameValidator,
    StoreIdValidator,
    GTINValidator,
    MissingFileValidator,
    load_json,
    cleanse_folder_name,
    ILLEGAL_CHARACTERS,
    LOGO_MIN_SIZE,
    LOGO_MAX_SIZE,
)

from .orchestrator import (
    ValidationOrchestrator,
    collect_json_validation_tasks,
    collect_logo_validation_tasks,
    collect_folder_validation_tasks,
)

__all__ = [
    # Types
    'ValidationLevel',
    'ValidationError',
    'ValidationResult',
    'ValidationTask',
    # Validators
    'SchemaCache',
    'BaseValidator',
    'JsonValidator',
    'LogoValidator',
    'FolderNameValidator',
    'StoreIdValidator',
    'GTINValidator',
    'MissingFileValidator',
    # Orchestrator
    'ValidationOrchestrator',
    # Utilities
    'load_json',
    'cleanse_folder_name',
    # Task collectors
    'collect_json_validation_tasks',
    'collect_logo_validation_tasks',
    'collect_folder_validation_tasks',
    # Constants
    'ILLEGAL_CHARACTERS',
    'LOGO_MIN_SIZE',
    'LOGO_MAX_SIZE',
]
