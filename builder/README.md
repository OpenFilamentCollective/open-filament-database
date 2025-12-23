# Open Filament Database Builder

This is the build system that transforms the human-readable filament database into multiple machine-friendly formats.

## Quick Start

```bash
# Run the builder from the project root
python -m builder.build

# Or with options
python -m builder.build --version 2025.12.0 --output-dir dist
```

## Output Formats

The builder generates the following formats in the `dist/` directory:

### 1. JSON (`dist/json/`)

- **`all.json`** - Complete dataset in one file
- **`all.json.gz`** - Gzip compressed version
- **`all.ndjson`** - Newline-delimited JSON for streaming
- **`brands/`** - Per-brand JSON files
  - `index.json` - Brand listing
  - `{brand-slug}.json` - Individual brand data

### 2. SQLite (`dist/sqlite/`)

- **`filaments.db`** - Relational database
- **`filaments.db.xz`** - XZ compressed version

The SQLite database includes:
- Full relational schema with foreign keys
- Indexes for common queries
- Pre-built views: `v_full_variant`, `v_full_size`, `v_purchase_offers`

### 3. CSV (`dist/csv/`)

- `brands.csv`
- `materials.csv`
- `filaments.csv`
- `variants.csv`
- `sizes.csv`
- `stores.csv`
- `purchase_links.csv`

### 4. Static API (`dist/api/v1/`)

A GitHub Pages-friendly hierarchical API structure:

```
api/v1/
├── index.json                    # Root with stats and endpoints
├── brands/
│   ├── index.json                # All brands with paths
│   └── {brand-slug}/
│       ├── index.json            # Brand details + materials list
│       └── materials/
│           └── {material-slug}/
│               ├── index.json    # Material details + filaments list
│               └── filaments/
│                   └── {filament-slug}/
│                       ├── index.json           # Filament details + variants list
│                       └── variants/
│                           └── {variant-slug}.json  # Variant + sizes + purchase links
├── stores/
│   ├── index.json                # All stores
│   └── {store-slug}.json         # Individual store details
└── schemas/
    ├── index.json                # Schema listing
    └── *.json                    # JSON Schema files
```

The API follows the native data directory hierarchy:
- Brand → Material → Filament → Variant → Sizes (with purchase links)

## Command Line Options

```
python -m builder.build [options]

Options:
  --output-dir, -o DIR    Output directory (default: dist)
  --data-dir, -d DIR      Data directory (default: data)
  --stores-dir, -s DIR    Stores directory (default: stores)
  --version, -v VERSION   Dataset version (default: auto-generated)
  --skip-json             Skip JSON export
  --skip-sqlite           Skip SQLite export
  --skip-csv              Skip CSV export
  --skip-api              Skip static API export
```

## Programmatic Usage

```python
from builder import crawl_data, export_json, export_sqlite, export_csv, export_api

# Crawl the data
db, result = crawl_data("data", "stores")

# Export to various formats
version = "2025.12.0"
generated_at = "2025-12-22T12:00:00Z"

export_json(db, "dist", version, generated_at)
export_sqlite(db, "dist", version, generated_at)
export_csv(db, "dist", version, generated_at)
export_api(db, "dist", version, generated_at, schemas_dir="schemas")
```

## Data Model

### Entities

| Entity | Description |
|--------|-------------|
| `Brand` | Filament manufacturer (e.g., Prusament, Polymaker) |
| `Material` | Material type at brand level (PLA, PETG, ABS, etc.) |
| `Filament` | Product line (e.g., "Prusament PLA") |
| `Variant` | Color/finish variant (e.g., "Galaxy Black") |
| `Size` | Specific SKU (e.g., 1kg spool, 1.75mm diameter) |
| `Store` | Retail store |
| `PurchaseLink` | Link to buy a specific size at a store |

### Relationships

```
Brand (1) ←── (N) Material (1) ←── (N) Filament (1) ←── (N) Variant (1) ←── (N) Size
                                                                                  │
                                                                                  ↓
                                                                         PurchaseLink ──→ Store
```

## Directory Structure

```
builder/
├── __init__.py           # Package exports
├── build.py              # Main build script
├── models.py             # Data models (dataclasses)
├── utils.py              # Utility functions
├── crawler.py            # Data directory crawler
├── serialization.py      # Entity serialization
├── exporters/
│   ├── __init__.py
│   ├── json_exporter.py  # JSON/NDJSON export
│   ├── sqlite_exporter.py # SQLite export
│   ├── csv_exporter.py   # CSV export
│   └── api_exporter.py   # Static API export
└── README.md             # This file
```

## Example Queries

### SQLite

```sql
-- Find all PLA filaments
SELECT b.name AS brand, f.name AS filament, v.color_name
FROM filament f
JOIN brand b ON b.id = f.brand_id
JOIN material m ON m.id = f.material_id
JOIN variant v ON v.filament_id = f.id
WHERE m.material = 'PLA'
ORDER BY b.name, f.name;

-- Using the pre-built view
SELECT * FROM v_full_size WHERE material = 'PETG' LIMIT 10;

-- Count filaments per brand
SELECT b.name, COUNT(f.id) as filaments
FROM brand b
LEFT JOIN filament f ON f.brand_id = b.id
GROUP BY b.id
ORDER BY filaments DESC;
```

### Python (with JSON)

```python
import json

with open('dist/json/all.json') as f:
    data = json.load(f)

# Find all Prusament filaments
prusament = next(b for b in data['brands'] if b['name'] == 'Prusament')
filaments = [f for f in data['filaments'] if f['brand_id'] == prusament['id']]
print(f"Prusament has {len(filaments)} filaments")
```

### JavaScript (with Static API)

```javascript
// Fetch brand list
const brandsRes = await fetch('https://example.com/api/v1/brands/index.json');
const { brands } = await brandsRes.json();

// Fetch specific brand with materials
const prusament = await fetch('https://example.com/api/v1/brands/prusament/index.json')
  .then(r => r.json());

console.log(`Prusament has ${prusament.materials.length} material types`);
```

## CI/CD

The build runs automatically via GitHub Actions when:
- Changes are pushed to `main` branch affecting `data/`, `stores/`, `builder/`, or `schemas/`
- Manual workflow dispatch

On each build:
1. Data is crawled and normalized
2. All export formats are generated
3. Static API is deployed to GitHub Pages
4. Release is created with downloadable artifacts
