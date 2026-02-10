"""
Open Filament Database CLI

A unified command-line interface for the Open Filament Database project.

Usage:
    uv run -m ofd <command> [options]
    python -m ofd <command> [options]

Commands:
    validate    - Validate data files against schemas
    build       - Build database exports (JSON, SQLite, CSV, API)
    serve       - Start development server with CORS
    script      - Run utility scripts (style_data, etc.)
"""

__version__ = "1.0.0"
