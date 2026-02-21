"""
SQLite exporter for stores only.

Creates a separate database file containing just store information,
making it easier to work with store data independently.
"""

import lzma
import sqlite3
from pathlib import Path

from ..models import Database
from ..serialization import insert_entities


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
    logo_name TEXT NOT NULL,
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

    # Insert stores using PRAGMA-driven column matching
    insert_entities(cursor, db.stores, "store")

    conn.commit()
    conn.close()
    print(f"  Written: {db_path} ({len(db.stores)} stores)")

    # Create compressed version
    db_xz_path = output_path / "stores.db.xz"
    with open(db_path, 'rb') as f_in:
        with lzma.open(db_xz_path, 'wb') as f_out:
            f_out.write(f_in.read())
    print(f"  Written: {db_xz_path}")
