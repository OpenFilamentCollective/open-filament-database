"""
SQLite exporter that creates a relational database with proper schema.

Uses PRAGMA table_info for INSERT statements, making it resilient to
dict-based entities with varying fields.
"""

import lzma
import sqlite3
from pathlib import Path

from ..models import Database
from ..serialization import insert_entities


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
    logo_name TEXT NOT NULL,
    origin TEXT NOT NULL,
    source TEXT
);
CREATE INDEX IF NOT EXISTS ix_brand_name ON brand(name);

-- Material table (at brand level)
CREATE TABLE IF NOT EXISTS material (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL REFERENCES brand(id) ON DELETE CASCADE,
    material TEXT NOT NULL,
    slug TEXT,
    material_class TEXT NOT NULL DEFAULT 'FFF',
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
    shore_hardness_a INTEGER,
    shore_hardness_d INTEGER,
    certifications TEXT,  -- JSON array
    max_dry_temperature INTEGER,
    min_print_temperature INTEGER,
    max_print_temperature INTEGER,
    preheat_temperature INTEGER,
    min_bed_temperature INTEGER,
    max_bed_temperature INTEGER,
    min_chamber_temperature INTEGER,
    max_chamber_temperature INTEGER,
    chamber_temperature INTEGER,
    min_nozzle_diameter REAL,
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
    name TEXT NOT NULL,
    color_hex TEXT NOT NULL,
    hex_variants TEXT,  -- JSON array
    color_standards TEXT,  -- JSON
    traits TEXT,  -- JSON
    discontinued INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_variant_filament ON variant(filament_id);
CREATE INDEX IF NOT EXISTS ix_variant_slug ON variant(slug);
CREATE INDEX IF NOT EXISTS ix_variant_name ON variant(name);

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
    logo_name TEXT NOT NULL,
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
    v.name,
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
    v.name,
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
    v.name,
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

    # Insert all entities using PRAGMA-driven column matching
    insert_entities(cursor, db.brands, "brand")
    insert_entities(cursor, db.materials, "material")
    insert_entities(cursor, db.filaments, "filament")
    insert_entities(cursor, db.variants, "variant")
    insert_entities(cursor, db.sizes, "size")
    insert_entities(cursor, db.stores, "store")
    insert_entities(cursor, db.purchase_links, "purchase_link")

    conn.commit()
    conn.close()
    print(f"  Written: {db_path}")

    # Create compressed version
    db_xz_path = output_path / "filaments.db.xz"
    with open(db_path, 'rb') as f_in:
        with lzma.open(db_xz_path, 'wb') as f_out:
            f_out.write(f_in.read())
    print(f"  Written: {db_xz_path}")
