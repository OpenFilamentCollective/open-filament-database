# Manual Contribution Guide
This guide explains how to manually edit the database files. We recommend reading through this document first, then exploring the `/data` and `/stores` folders for reference examples. The authoritative source for every field is the JSON Schema in [`/schemas`](../schemas) — if anything here disagrees with a schema, the schema wins.

**Note:** Most contributors find the [WebUI](webui.md) easier to use than manual editing. Consider using the WebUI unless you have a specific reason to edit files directly.

## 📁 Project Structure
The database is organized as a structured JSON-based hierarchy inside the `/data` directory, following this pattern:
```
data/
└── [brand-id]/                      # e.g. 22_network, prusament
    ├── brand.json
    ├── logo.(png|jpg|svg)           # exactly this filename
    └── [material-type]/             # e.g. PLA, ABS, PETG (from the material enum)
        ├── material.json
        └── [filament-id]/           # e.g. glow_pla
            ├── filament.json
            └── [variant-id]/        # e.g. luminous_blue
                ├── sizes.json
                └── variant.json
```

Stores live in a parallel tree:
```
stores/
└── [store-id]/                      # e.g. printed_solid
    ├── store.json
    └── logo.(png|jpg|svg)
```

## 🧾 Naming Rules
Every folder name and every `id` field must match the regex `^[a-z0-9+]+(_[a-z0-9+]+)*$` — lowercase letters, digits, and `+`, separated by single underscores. The `id` inside the JSON must match the folder name exactly.

**Logos** must be:
- Named exactly `logo.png`, `logo.jpg`, or `logo.svg` (custom names are rejected by the validator)
- Square (width = height)
- Between **100×100** and **400×400** pixels for raster formats (PNG/JPG)
- A real SVG (root element `<svg>`) for SVG files

## 🏷️ Adding a Brand

1. Create a folder under `data/` named with the brand's `id` (lowercase snake_case, e.g. `bambu_lab`, `prusament`)
2. Add the logo as `logo.png`, `logo.jpg`, or `logo.svg` (see naming rules above)
3. Create `brand.json`:
   ```json
   {
     "id": "bambu_lab",
     "name": "Bambu Lab",
     "website": "https://bambulab.com/",
     "logo": "logo.png",
     "origin": "CN"
   }
   ```

   **Required fields:**
   - `id` — must match the folder name
   - `name` — display name as shown by the manufacturer
   - `website` — the manufacturer's official site
   - `logo` — the logo filename (must be `logo.png`, `logo.jpg`, or `logo.svg`)
   - `origin` — ISO 3166-1 alpha-2 country code (e.g. `US`, `DE`, `CN`), optionally with a region suffix like `US-CA`, **or** the literal string `"Unknown"`. An empty string is **not** valid.

   **Optional:** `source` — free-text note describing where the data came from (e.g. another database).

## 🧪 Adding a Material Type
1. Inside the brand folder, create a folder named after the material type (e.g. `PLA`, `PETG`, `ABS`)
2. Create `material.json`:
   ```json
   { "material": "PLA" }
   ```

   **Required:**
   - `material` — must be one of the values listed in [`schemas/material_types_schema.json`](../schemas/material_types_schema.json) (PLA, PETG, TPU, ABS, ASA, PC, PCTG, PP, PA6, …).

   **Optional:**
   - `material_class` — `"FFF"` (default) or `"SLA"`
   - `default_max_dry_temperature` — integer, °C
   - `default_slicer_settings` — per-slicer profile names and overrides (see [`schemas/material_schema.json`](../schemas/material_schema.json))

## 📦 Adding a Filament
A filament represents a **product line** (e.g. "Silk PLA", "Glow PLA"), **not a single colour**.

1. Inside the material folder, create a folder named with the filament `id` (e.g. `glow_pla`)
2. Create `filament.json`:
   ```json
   {
     "id": "glow_pla",
     "name": "Glow PLA",
     "diameter_tolerance": 0.02,
     "density": 1.24
   }
   ```

   **Required:**
   - `id` — must match the folder name
   - `name` — manufacturer's product-line name
   - `diameter_tolerance` — number, mm (e.g. `0.02` for ±0.02 mm)
   - `density` — number, g/cm³ (default 1.24)

   **Optional** (see [`schemas/filament_schema.json`](../schemas/filament_schema.json) for the full list):
   - Mechanical: `shore_hardness_a`, `shore_hardness_d`, `certifications` (array of strings)
   - Drying / printing temperatures: `max_dry_temperature`, `min_print_temperature`, `max_print_temperature`, `preheat_temperature`, `min_bed_temperature`, `max_bed_temperature`, `min_chamber_temperature`, `max_chamber_temperature`, `chamber_temperature`
   - Hardware: `min_nozzle_diameter`
   - Documents: `data_sheet_url`, `safety_sheet_url`
   - Lifecycle: `discontinued` (boolean)
   - Slicer integration: `slicer_ids` (PrusaSlicer / BambuStudio / OrcaSlicer / Cura native IDs) and `slicer_settings` (per-slicer profile names, IDs, and temperature overrides)

## 🎨 Adding a Variant
A variant represents a single colour or finish of a filament.

Inside the filament folder, create a folder named with the variant `id` (e.g. `luminous_blue`) and add two files:

### variant.json
```json
{
  "id": "luminous_blue",
  "name": "Luminous Blue",
  "color_hex": "#00BFFF",
  "traits": {
    "glow": true
  }
}
```

**Required:**
- `id` — must match the folder name
- `name` — the manufacturer's colour name
- `color_hex` — a `#RRGGBB` hex string, **or** an array of such strings for multi-colour filaments (gradient, dual-colour, etc.)

**Optional** (full list in [`schemas/variant_schema.json`](../schemas/variant_schema.json)):
- `discontinued` — boolean
- `hex_variants` — array of alternative `#RRGGBB` codes the filament is known to report (e.g. via NFC)
- `color_standards` — object with any of `ral`, `ncs`, `pantone`, `bs`, `munsell`
- `traits` — **an object** mapping trait names to booleans, **not** an array of strings. Available traits include `silk`, `matte`, `glow`, `translucent`, `transparent`, `recycled`, `biodegradable`, `abrasive`, `glitter`, `iridescent`, `temperature_color_change`, `gradual_color_change`, `coextruded`, the `contains_*` family (carbon, glass, wood, metal, …), the `imitates_*` family, `esd_safe`, `self_extinguishing`, and many more. See the schema for the complete enumeration.

### sizes.json
A JSON **array** of one or more size objects. At minimum:
```json
[
  { "filament_weight": 1000, "diameter": 1.75 }
]
```

**Required per entry:**
- `filament_weight` — number, grams (default 1000)
- `diameter` — number, mm (typically `1.75` or `2.85`)

**Optional per entry:**
- Spool geometry: `empty_spool_weight`, `spool_core_diameter`, `container_width`, `container_outer_diameter`, `container_hole_diameter`
- Identifiers: `gtin` (GTIN-12 or GTIN-13 — preferred), `ean` (deprecated alias for `gtin`), `article_number`, `barcode_identifier`, `nfc_identifier`, `qr_identifier`
- `spool_refill` — boolean; mark the size as a refill for a reusable spool
- `discontinued` — boolean
- `purchase_links` — array of purchase entries:
  - `store_id` — required; must match a folder under `/stores`
  - `url` — required; product page URL
  - `ships_from` / `ships_to` — optional per-link override (string or array of country codes)

> **Note:** there is no `is_affiliate` field on purchase links. Affiliate handling is implicit in the store entry and the URL itself.

## 🏪 Adding a Store
Stores are referenced by `purchase_links[].store_id` and live under `/stores`.

1. Create a folder under `/stores/` using the store `id` (e.g. `printed_solid`)
2. Add the logo as `logo.png`, `logo.jpg`, or `logo.svg` (same rules as brand logos)
3. Create `store.json`:
   ```json
   {
     "id": "printed_solid",
     "name": "Printed Solid",
     "storefront_url": "https://www.printedsolid.com/",
     "logo": "logo.png",
     "ships_from": "US",
     "ships_to": ["US", "CA"]
   }
   ```

   **Required:**
   - `id` — must match the folder name
   - `name` — display name
   - `storefront_url` — homepage URL
   - `logo` — `logo.png`, `logo.jpg`, or `logo.svg`
   - `ships_from` — country code string or array of country codes (e.g. `"US"` or `["US", "CA"]`). Use an empty array `[]` if unknown.
   - `ships_to` — same shape as `ships_from`. Use `[]` if unknown.

   **Optional:** `source` — free-text data-source note.

   > **Note:** there is no `storefront_affiliate_link` field in the store schema.

For full schema details, see [`schemas/store_schema.json`](../schemas/store_schema.json).
