"""
SQLite exporter that creates a relational database with proper schema.

Uses dataclass introspection for INSERT statements, making it resilient to
field additions/removals in the models.
"""

import json
import lzma
import sqlite3
from dataclasses import fields
from pathlib import Path
from typing import Type

from ..models import (
    Database, Brand, Material, Filament, Variant, Size, Store, PurchaseLink
)
from ..serialization import entity_to_dict, serialize_for_sqlite


# =============================================================================
# Schema DDL - Defines table structure, indexes, and views
# =============================================================================

SCHEMA_DDL = """
PRAGMA foreign_keys = ON;

-- Metadata table
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Brand table
CREATE TABLE IF NOT EXISTS brand (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    website TEXT NOT NULL,
    logo TEXT NOT NULL,
    origin TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_brand_name ON brand(name);

-- Material table (at brand level)
CREATE TABLE IF NOT EXISTS material (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brand(id) ON DELETE CASCADE,
    material TEXT NOT NULL,
    slug TEXT,
    default_max_dry_temperature INTEGER,
    default_slicer_settings TEXT  -- JSON
);
CREATE INDEX IF NOT EXISTS ix_material_brand ON material(brand_id);
CREATE INDEX IF NOT EXISTS ix_material_type ON material(material);

-- Filament table
CREATE TABLE IF NOT EXISTS filament (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brand(id) ON DELETE CASCADE,
    material_id TEXT NOT NULL REFERENCES material(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    material TEXT NOT NULL,
    density REAL NOT NULL,
    diameter_tolerance REAL NOT NULL,
    max_dry_temperature INTEGER,
    data_sheet_url TEXT,
    safety_sheet_url TEXT,
    discontinued INTEGER NOT NULL DEFAULT 0,
    slicer_ids TEXT,  -- JSON
    slicer_settings TEXT  -- JSON
);
CREATE INDEX IF NOT EXISTS ix_filament_brand ON filament(brand_id);
CREATE INDEX IF NOT EXISTS ix_filament_material ON filament(material_id);
CREATE INDEX IF NOT EXISTS ix_filament_slug ON filament(slug);

-- Variant table
CREATE TABLE IF NOT EXISTS variant (
    id TEXT PRIMARY KEY,
    filament_id TEXT NOT NULL REFERENCES filament(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    color_name TEXT NOT NULL,
    color_hex TEXT NOT NULL,
    hex_variants TEXT,  -- JSON array
    color_standards TEXT,  -- JSON
    traits TEXT,  -- JSON
    discontinued INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_variant_filament ON variant(filament_id);
CREATE INDEX IF NOT EXISTS ix_variant_slug ON variant(slug);
CREATE INDEX IF NOT EXISTS ix_variant_color ON variant(color_name);

-- Size table (spool size/SKU)
CREATE TABLE IF NOT EXISTS size (
    id TEXT PRIMARY KEY,
    variant_id TEXT NOT NULL REFERENCES variant(id) ON DELETE CASCADE,
    filament_weight INTEGER NOT NULL,
    diameter REAL NOT NULL,
    empty_spool_weight INTEGER,
    spool_core_diameter REAL,
    gtin TEXT,
    article_number TEXT,
    barcode_identifier TEXT,
    nfc_identifier TEXT,
    qr_identifier TEXT,
    discontinued INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_size_variant ON size(variant_id);
CREATE INDEX IF NOT EXISTS ix_size_gtin ON size(gtin);
CREATE INDEX IF NOT EXISTS ix_size_weight ON size(filament_weight);

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

-- Purchase link table
CREATE TABLE IF NOT EXISTS purchase_link (
    id TEXT PRIMARY KEY,
    size_id TEXT NOT NULL REFERENCES size(id) ON DELETE CASCADE,
    store_id TEXT NOT NULL REFERENCES store(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    spool_refill INTEGER NOT NULL DEFAULT 0,
    ships_from TEXT,  -- JSON array (override)
    ships_to TEXT  -- JSON array (override)
);
CREATE INDEX IF NOT EXISTS ix_purchase_link_size ON purchase_link(size_id);
CREATE INDEX IF NOT EXISTS ix_purchase_link_store ON purchase_link(store_id);

-- Useful views
CREATE VIEW IF NOT EXISTS v_full_variant AS
SELECT
    v.id AS variant_id,
    v.color_name,
    v.color_hex,
    v.slug AS variant_slug,
    f.id AS filament_id,
    f.name AS filament_name,
    f.slug AS filament_slug,
    f.material,
    f.density,
    f.diameter_tolerance,
    b.id AS brand_id,
    b.name AS brand_name,
    b.slug AS brand_slug
FROM variant v
JOIN filament f ON v.filament_id = f.id
JOIN brand b ON f.brand_id = b.id;

CREATE VIEW IF NOT EXISTS v_full_size AS
SELECT
    s.id AS size_id,
    s.filament_weight,
    s.diameter,
    s.gtin,
    v.id AS variant_id,
    v.color_name,
    v.color_hex,
    f.id AS filament_id,
    f.name AS filament_name,
    f.material,
    b.id AS brand_id,
    b.name AS brand_name
FROM size s
JOIN variant v ON s.variant_id = v.id
JOIN filament f ON v.filament_id = f.id
JOIN brand b ON f.brand_id = b.id;

CREATE VIEW IF NOT EXISTS v_purchase_offers AS
SELECT
    pl.id AS purchase_link_id,
    pl.url,
    pl.spool_refill,
    st.id AS store_id,
    st.name AS store_name,
    st.storefront_url,
    COALESCE(pl.ships_from, st.ships_from) AS ships_from,
    COALESCE(pl.ships_to, st.ships_to) AS ships_to,
    s.id AS size_id,
    s.filament_weight,
    s.diameter,
    s.gtin,
    v.color_name,
    v.color_hex,
    f.name AS filament_name,
    f.material,
    b.name AS brand_name
FROM purchase_link pl
JOIN store st ON pl.store_id = st.id
JOIN size s ON pl.size_id = s.id
JOIN variant v ON s.variant_id = v.id
JOIN filament f ON v.filament_id = f.id
JOIN brand b ON f.brand_id = b.id;
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

def export_sqlite(db: Database, output_dir: str, version: str, generated_at: str):
    """Export database to SQLite format."""
    output_path = Path(output_dir) / "sqlite"
    output_path.mkdir(parents=True, exist_ok=True)

    db_path = output_path / "filaments.db"

    # Remove existing database
    if db_path.exists():
        db_path.unlink()

    # Create database
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # Create schema
    cursor.executescript(SCHEMA_DDL)

    # Insert metadata
    cursor.execute("INSERT INTO meta (key, value) VALUES (?, ?)", ("version", version))
    cursor.execute("INSERT INTO meta (key, value) VALUES (?, ?)", ("generated_at", generated_at))

    # Insert all entities using introspection
    insert_entities(cursor, db.brands, Brand, "brand")
    insert_entities(cursor, db.materials, Material, "material")
    insert_entities(cursor, db.filaments, Filament, "filament")
    insert_entities(cursor, db.variants, Variant, "variant")
    insert_entities(cursor, db.sizes, Size, "size")
    insert_entities(cursor, db.stores, Store, "store")
    insert_entities(cursor, db.purchase_links, PurchaseLink, "purchase_link")

    conn.commit()
    conn.close()
    print(f"  Written: {db_path}")

    # Create compressed version
    db_xz_path = output_path / "filaments.db.xz"
    with open(db_path, 'rb') as f_in:
        with lzma.open(db_xz_path, 'wb') as f_out:
            f_out.write(f_in.read())
    print(f"  Written: {db_xz_path}")
