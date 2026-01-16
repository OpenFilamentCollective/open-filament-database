"""
Shared serialization utilities for the Open Filament Database builder.

This module provides a single source of truth for converting dataclass entities
to dictionaries, eliminating duplication across exporters.
"""

import json
from dataclasses import fields, is_dataclass
from typing import Any, Optional, Type, get_type_hints, get_origin, get_args, Union


def entity_to_dict(entity: Any, exclude_none: bool = True) -> Optional[dict]:
    """
    Convert a dataclass entity to a dictionary, handling nested dataclasses.

    Args:
        entity: The dataclass instance to convert
        exclude_none: If True, omit fields with None values (default True)

    Returns:
        Dictionary representation of the entity, or None if entity is None
    """
    if entity is None:
        return None
    if is_dataclass(entity) and not isinstance(entity, type):
        result = {}

        # Check if this is a Brand or Store entity (special handling)
        from .models import Brand, Store
        is_brand_or_store = isinstance(entity, (Brand, Store))

        for field_info in fields(entity):
            field_name = field_info.name
            value = getattr(entity, field_name)

            # Skip directory_name for Brand and Store (internal only)
            if is_brand_or_store and field_name == "directory_name":
                continue

            # Rename 'logo' to 'logo_name' for Brand and Store
            if is_brand_or_store and field_name == "logo":
                field_name = "logo_name"

            if value is not None or not exclude_none:
                if is_dataclass(value) and not isinstance(value, type):
                    result[field_name] = entity_to_dict(value, exclude_none)
                elif isinstance(value, list):
                    result[field_name] = [
                        entity_to_dict(v, exclude_none) if is_dataclass(v) and not isinstance(v, type) else v
                        for v in value
                    ]
                else:
                    result[field_name] = value
        return result
    return entity


def get_dataclass_field_names(cls: Type) -> list[str]:
    """
    Get all field names from a dataclass.

    Args:
        cls: The dataclass type

    Returns:
        List of field names in declaration order
    """
    if not is_dataclass(cls):
        raise TypeError(f"{cls} is not a dataclass")
    return [f.name for f in fields(cls)]


def get_dataclass_fields_with_types(cls: Type) -> list[tuple[str, Type]]:
    """
    Get all field names and their types from a dataclass.

    Args:
        cls: The dataclass type

    Returns:
        List of (field_name, field_type) tuples
    """
    if not is_dataclass(cls):
        raise TypeError(f"{cls} is not a dataclass")
    hints = get_type_hints(cls)
    return [(f.name, hints.get(f.name, Any)) for f in fields(cls)]


# Python type to SQLite type mapping
_PYTHON_TO_SQLITE = {
    str: "TEXT",
    int: "INTEGER",
    float: "REAL",
    bool: "INTEGER",  # SQLite has no native bool
}


def _unwrap_optional(python_type: Type) -> Type:
    """Unwrap Optional[X] to get X."""
    origin = get_origin(python_type)
    if origin is Union:
        args = get_args(python_type)
        # Optional[X] is Union[X, None]
        non_none = [a for a in args if a is not type(None)]
        if len(non_none) == 1:
            return non_none[0]
    return python_type


def python_type_to_sqlite(python_type: Type) -> str:
    """
    Map a Python type to its SQLite equivalent.

    Args:
        python_type: The Python type annotation

    Returns:
        SQLite type string (TEXT, INTEGER, REAL)
    """
    # Handle Optional[X]
    unwrapped = _unwrap_optional(python_type)

    # Check direct mapping
    if unwrapped in _PYTHON_TO_SQLITE:
        return _PYTHON_TO_SQLITE[unwrapped]

    # Handle list, dict, and other complex types as JSON TEXT
    origin = get_origin(unwrapped)
    if origin in (list, dict) or is_dataclass(unwrapped):
        return "TEXT"

    # Default to TEXT for unknown types
    return "TEXT"


def serialize_for_csv(value: Any, exclude_none: bool = True) -> str:
    """
    Serialize a value for CSV output.

    Args:
        value: The value to serialize
        exclude_none: If True, return empty string for None

    Returns:
        String representation suitable for CSV
    """
    if value is None:
        return ""
    if isinstance(value, bool):
        return "1" if value else "0"
    if is_dataclass(value) and not isinstance(value, type):
        return json.dumps(entity_to_dict(value, exclude_none), ensure_ascii=False)
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def serialize_for_sqlite(value: Any, exclude_none: bool = True) -> Any:
    """
    Serialize a value for SQLite insertion.

    Args:
        value: The value to serialize
        exclude_none: If True, return None for None (SQLite NULL)

    Returns:
        Value suitable for SQLite parameter binding
    """
    if value is None:
        return None
    if isinstance(value, bool):
        return 1 if value else 0
    if is_dataclass(value) and not isinstance(value, type):
        return json.dumps(entity_to_dict(value, exclude_none), ensure_ascii=False)
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return value
