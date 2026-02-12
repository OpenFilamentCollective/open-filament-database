"""
Shared serialization utilities for the Open Filament Database builder.

Works with plain dict entities — no dataclass introspection needed.
"""

import json
import sqlite3
from typing import Any, Optional


def entity_to_dict(entity: Any, exclude_none: bool = True) -> Optional[dict]:
    """
    Prepare a dict entity for export.

    - Strips 'directory_name' (internal-only field added by crawler for brands/stores)
    - Renames 'logo' to 'logo_name' for entities that have 'directory_name'
    - Optionally strips None values
    """
    if entity is None:
        return None
    if not isinstance(entity, dict):
        return entity

    # Detect brand/store by presence of directory_name (only those entity types have it)
    is_brand_or_store = "directory_name" in entity

    result = {}
    for key, value in entity.items():
        # Skip internal-only field
        if key == "directory_name":
            continue

        # Rename logo -> logo_name for brands and stores
        output_key = key
        if key == "logo" and is_brand_or_store:
            output_key = "logo_name"

        if value is not None or not exclude_none:
            result[output_key] = value

    return result


def serialize_for_csv(value: Any) -> str:
    """Serialize a value for CSV output."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def serialize_for_sqlite(value: Any) -> Any:
    """Serialize a value for SQLite insertion."""
    if value is None:
        return None
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return value


def get_table_columns(cursor: sqlite3.Cursor, table_name: str) -> list[str]:
    """Get column names for a table from the SQLite schema."""
    cursor.execute(f"PRAGMA table_info({table_name})")
    return [row[1] for row in cursor.fetchall()]


def insert_entities(
    cursor: sqlite3.Cursor,
    entities: list[dict],
    table_name: str,
):
    """
    Insert dict entities into SQLite, matching dict keys to table columns.

    Columns in the DDL that don't exist in the entity get NULL.
    Fields in the entity that don't exist in the DDL are silently skipped
    (they still appear in JSON/CSV/API exports).
    """
    if not entities:
        return

    columns = get_table_columns(cursor, table_name)
    placeholders = ", ".join(["?"] * len(columns))
    col_names = ", ".join(columns)
    sql = f"INSERT INTO {table_name} ({col_names}) VALUES ({placeholders})"

    for entity in entities:
        exported = entity_to_dict(entity)
        values = tuple(
            serialize_for_sqlite(exported.get(col))
            for col in columns
        )
        cursor.execute(sql, values)
