"""
Validation types for OFD CLI.

This module contains the core data types used throughout the validation system.
"""

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional


class ValidationLevel(Enum):
    """Severity level of a validation error."""
    ERROR = "ERROR"
    WARNING = "WARNING"


@dataclass
class ValidationError:
    """Represents a single validation error."""
    level: ValidationLevel
    category: str
    message: str
    path: Optional[Path] = None

    def __str__(self) -> str:
        path_str = f" [{self.path}]" if self.path else ""
        return f"{self.level.value} - {self.category}: {self.message}{path_str}"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'level': self.level.value,
            'category': self.category,
            'message': self.message,
            'path': str(self.path) if self.path else None
        }


@dataclass
class ValidationResult:
    """Aggregates validation errors."""
    errors: List[ValidationError] = field(default_factory=list)

    def add_error(self, error: ValidationError) -> None:
        """Add a validation error."""
        self.errors.append(error)

    def merge(self, other: 'ValidationResult') -> None:
        """Merge another ValidationResult into this one."""
        self.errors.extend(other.errors)

    @property
    def is_valid(self) -> bool:
        """Check if there are no ERROR-level issues."""
        return not any(e.level == ValidationLevel.ERROR for e in self.errors)

    @property
    def error_count(self) -> int:
        """Count of ERROR-level issues."""
        return len([e for e in self.errors if e.level == ValidationLevel.ERROR])

    @property
    def warning_count(self) -> int:
        """Count of WARNING-level issues."""
        return len([e for e in self.errors if e.level == ValidationLevel.WARNING])

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'errors': [e.to_dict() for e in self.errors],
            'error_count': self.error_count,
            'warning_count': self.warning_count,
            'is_valid': self.is_valid
        }


@dataclass
class ValidationTask:
    """Represents a validation task to be executed."""
    task_type: str
    name: str
    path: Path
    extra_data: Optional[Dict[str, Any]] = None
