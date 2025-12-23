"""
Open Filament Database Builder

A build system that crawls the human-readable filament database and exports
it to multiple machine-friendly formats:

- JSON (all.json, per-brand, NDJSON)
- SQLite database with proper relations
- CSV files (normalized)
- Static API (split JSON files for GitHub Pages)

Usage:
    python -m builder.build [options]

Or programmatically:
    from builder.crawler import crawl_data
    from builder.exporters import export_json, export_sqlite, export_csv, export_api

    db, result = crawl_data("data", "stores")
    export_json(db, "dist", "2025.1.0", "2025-01-01T00:00:00Z")
"""

__version__ = "2.0.0"

from .models import (
    Brand,
    Material,
    Filament,
    Variant,
    Size,
    Store,
    PurchaseLink,
    Database,
    SlicerSettings,
    GenericSlicerSettings,
    AllSlicerSettings,
    SlicerIds,
    ColorStandards,
    VariantTraits,
)

from .crawler import crawl_data, DataCrawler

from .exporters import (
    export_json,
    export_sqlite,
    export_csv,
    export_api,
)

__all__ = [
    # Version
    '__version__',
    # Models
    'Brand',
    'Material',
    'Filament',
    'Variant',
    'Size',
    'Store',
    'PurchaseLink',
    'Database',
    'SlicerSettings',
    'GenericSlicerSettings',
    'AllSlicerSettings',
    'SlicerIds',
    'ColorStandards',
    'VariantTraits',
    # Crawler
    'crawl_data',
    'DataCrawler',
    # Exporters
    'export_json',
    'export_sqlite',
    'export_csv',
    'export_api',
]
