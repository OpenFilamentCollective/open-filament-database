"""
Error collection and reporting for the Open Filament Database builder.

This module provides a unified error/warning collection system similar to
ofd.validation, allowing all build stages to report issues that are
collected and displayed at the end.
"""

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional


class BuildErrorLevel(Enum):
    ERROR = "ERROR"
    WARNING = "WARNING"


@dataclass
class BuildError:
    """Represents a single build error or warning."""
    level: BuildErrorLevel
    category: str
    message: str
    path: Optional[Path] = None

    def __str__(self) -> str:
        path_str = f" [{self.path}]" if self.path else ""
        return f"{self.level.value} - {self.category}: {self.message}{path_str}"


@dataclass
class BuildResult:
    """Aggregates build errors and warnings across all stages."""
    errors: list[BuildError] = field(default_factory=list)

    def add_error(self, error: BuildError) -> None:
        self.errors.append(error)

    def add_warning(self, category: str, message: str, path: Optional[Path] = None) -> None:
        self.errors.append(BuildError(
            level=BuildErrorLevel.WARNING,
            category=category,
            message=message,
            path=path
        ))

    def add_err(self, category: str, message: str, path: Optional[Path] = None) -> None:
        self.errors.append(BuildError(
            level=BuildErrorLevel.ERROR,
            category=category,
            message=message,
            path=path
        ))

    def merge(self, other: 'BuildResult') -> None:
        """Merge errors from another BuildResult into this one."""
        self.errors.extend(other.errors)

    @property
    def has_errors(self) -> bool:
        return any(e.level == BuildErrorLevel.ERROR for e in self.errors)

    @property
    def error_count(self) -> int:
        return len([e for e in self.errors if e.level == BuildErrorLevel.ERROR])

    @property
    def warning_count(self) -> int:
        return len([e for e in self.errors if e.level == BuildErrorLevel.WARNING])

    def print_summary(self) -> None:
        """Print all errors grouped by category."""
        if not self.errors:
            return

        # Group errors by category
        errors_by_category: dict[str, list[BuildError]] = {}
        for error in self.errors:
            if error.category not in errors_by_category:
                errors_by_category[error.category] = []
            errors_by_category[error.category].append(error)

        # Print errors grouped by category
        for category, errors in sorted(errors_by_category.items()):
            print(f"\n{category} ({len(errors)}):")
            print("-" * 80)
            for error in errors:
                print(f"  {error}")
