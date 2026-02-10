"""
SQLite exporter for stores only.

Creates a separate database file containing just store information,
making it easier to work with store data independently.
"""

import lzma
import sqlite3
from dataclasses import fields
from pathlib import Path
from typing import Type

from ..models import Database, Store
from ..serialization import serialize_for_sqlite


# =============================================================================
# Schema DDL - Stores database schema
# =============================================================================

STORES_SCHEMA_DDL = """
PRAGMA foreign_keys = ON;

-- Metadata table
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Store table
CREATE TABLE IF NOT EXISTS store (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    storefront_url TEXT NOT NULL,
    logo TEXT NOT NULL,
    ships_from TEXT NOT NULL,  -- JSON array
    ships_to TEXT NOT NULL  -- JSON array
);
CREATE INDEX IF NOT EXISTS ix_store_name ON store(name);
CREATE INDEX IF NOT EXISTS ix_store_slug ON store(slug);

-- Store shipping regions view (for easier querying)
CREATE VIEW IF NOT EXISTS v_store_shipping AS
SELECT
    id,
    name,
    slug,
    storefront_url,
    ships_from,
    ships_to
FROM store;
"""


# =============================================================================
# Dynamic Insert Generation
# =============================================================================

def insert_entities(
    cursor: sqlite3.Cursor,
    entities: list,
    entity_class: Type,
    table_name: str
):
    """
    Insert entities into SQLite using dataclass introspection.

    Args:
        cursor: SQLite cursor
        entities: List of dataclass instances
        entity_class: The dataclass type
        table_name: Target table name
    """
    if not entities:
        return

    from ..models import Brand, Store

    # Get field names, excluding directory_name for Brand and Store
    field_names = [
        f.name for f in fields(entity_class)
        if not (entity_class in (Brand, Store) and f.name == "directory_name")
    ]
    placeholders = ", ".join(["?"] * len(field_names))
    columns = ", ".join(field_names)

    sql = f"INSERT INTO {table_name} ({columns}) VALUES ({placeholders})"

    for entity in entities:
        values = tuple(
            serialize_for_sqlite(getattr(entity, name))
            for name in field_names
        )
        cursor.execute(sql, values)


# =============================================================================
# Main Export Function
# =============================================================================

def export_sqlite_stores(db: Database, output_dir: str, version: str, generated_at: str):
    """Export stores to a separate SQLite database."""
    output_path = Path(output_dir) / "sqlite"
    output_path.mkdir(parents=True, exist_ok=True)

    db_path = output_path / "stores.db"

    # Remove existing database
    if db_path.exists():
        db_path.unlink()

    # Create database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Create schema
    cursor.executescript(STORES_SCHEMA_DDL)

    # Insert metadata
    cursor.execute("INSERT INTO meta (key, value) VALUES (?, ?)", ("version", version))
    cursor.execute("INSERT INTO meta (key, value) VALUES (?, ?)", ("generated_at", generated_at))
    cursor.execute("INSERT INTO meta (key, value) VALUES (?, ?)", ("store_count", str(len(db.stores))))

    # Insert stores
    insert_entities(cursor, db.stores, Store, "store")

    conn.commit()
    conn.close()
    print(f"  Written: {db_path} ({len(db.stores)} stores)")

    # Create compressed version
    db_xz_path = output_path / "stores.db.xz"
    with open(db_path, 'rb') as f_in:
        with lzma.open(db_xz_path, 'wb') as f_out:
            f_out.write(f_in.read())
    print(f"  Written: {db_xz_path}")
