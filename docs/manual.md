# Manual Contribution Guide
This guide explains how to manually edit the database files. We recommend reading through this document first, then exploring the `/data` and `/stores` folders for reference examples. The authoritative source for every field is the JSON Schema in [`/schemas`](../schemas) — if anything here disagrees with a schema, the schema wins.

**Note:** Most contributors find the [WebUI](webui.md) easier to use than manual editing — the hosted instance at <http://openfilamentdatabase.org/> needs no setup and opens a pull request for you. Consider using the WebUI unless you have a specific reason to edit files directly.

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

## 🔑 Canonical UUIDs — leave them empty
Every entity (brand, material, filament, variant, and each spool in `sizes.json`) also has a **canonical UUID**: a stable, random `uuid` field that is *not* derived from the slug, so it never changes when a name or folder is renamed.

**You never write this field by hand.** When you add or edit data — manually or via the WebUI — simply omit `uuid` (or leave it empty). Continuous integration assigns a UUID to every new entry automatically when your pull request is merged. The `id`/folder-name slug is still what you set and what other files reference; the `uuid` is an additional identifier managed for you.

**Never rename by deleting and re-creating.** A UUID only survives a rename if the existing files (with their `uuid` fields) are moved — a deleted-and-recreated entity, and every variant and spool under it, comes back with *new* UUIDs, breaking every external reference. Pull requests are checked for this (see [UUID continuity](validation.md#canonical-uuids)).

If you're working locally and want to preview or manage these IDs, use the [`ofd uuid`](validation.md#canonical-uuids) commands (e.g. `ofd uuid assign`, `ofd uuid find <uuid>`).

### Moved / former UUIDs (`moved_from`)
When data is merged or moved, one entity's `uuid` can be retired in favour of another's. To keep old references working, the surviving entity carries an optional **`moved_from`** array listing the former UUIDs that now resolve to it — so a consumer that stored the old UUID can still find the current entity (`ofd uuid find <old-uuid>` redirects to it, and the build emits an `api/v1/uuid-index.json` redirect map for offline consumers).

**You never write `moved_from` by hand either.** It is managed by tooling: the `merge_data` / `deduplicate_data` scripts record a deleted entity's UUID onto its survivor automatically, and `ofd uuid check` enforces that every `moved_from` entry is a valid, unique UUID that doesn't collide with a live one.

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
   - `website` — the manufacturer's official site. If it also publishes on other domains, such as a separate shop or blog, use a list with the main site first: `["https://prusament.com/", "https://www.prusa3d.com/"]`. Sources on any of them count as the brand's own.
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
   - Print speed: `min_print_speed`, `max_print_speed` (mm/s), `max_volumetric_speed` (mm³/s)
   - Cooling: `min_fan_speed`, `max_fan_speed` — part cooling fan, integer percent 0–100
   - Drying: `dry_temperature` (°C, the recommended value) and `dry_time` (hours)
   - `enclosure` — one of `required`, `recommended`, `not_needed`
   - Hardware: `min_nozzle_diameter`
   - Documents: `data_sheet_url`, `safety_sheet_url`
   - Lifecycle: `discontinued` (boolean)
   - Slicer integration: `slicer_ids` (PrusaSlicer / BambuStudio / OrcaSlicer / Cura native IDs) and `slicer_settings` (per-slicer profile names, IDs, and temperature overrides)
   - Sustainability: `sustainability` — sourced recycled / bio-based content, carbon footprints and relative claims. See [🌱 Sustainability data](#-sustainability-data); every figure needs a source.
   - Mechanical data: `mechanical` — sourced tensile, flexural, impact and heat deflection values from the data sheet, per print direction. See [🔩 Mechanical data](#-mechanical-data); every value needs a source.

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
- `transmission_distance` — number, mm; the transmission distance (TD) used for HueForge prints and lithophanes. Use the manufacturer's published value where available
- `color_standards` — object with any of `ral`, `ncs`, `pantone`, `bs`, `munsell`
- `sustainability` — overrides the filament's `sustainability` **per field** (see [🌱 Sustainability data](#-sustainability-data))
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
- `spool_refill` — (deprecated) boolean; use `container_material: refill` instead
- `container_material` — one of `plastic`, `cardboard`, `mixed` (e.g. a cardboard core with plastic sides), `refill`; what the container is made of
- `container_details` — sourced details about this size's spool or packaging: `recycled_pct`, `pct_qualifier`, `certifications` (e.g. `["FSC"]`), `notes`, plus the source fields described in [🌱 Sustainability data](#-sustainability-data). Per size, because some brands use cardboard spools on certain sizes only.
- `discontinued` — boolean
- `purchase_links` — array of purchase entries:
  - `store_id` — required; must match a folder under `/stores`
  - `url` — required; product page URL
  - `ships_from` / `ships_to` — optional per-link override (string or array of country codes)

> **Note:** there is no `is_affiliate` field on purchase links. Affiliate handling is implicit in the store entry and the URL itself.

## 🌱 Sustainability data
Sustainability figures are used to calculate the CO₂ footprint of prints, and they get copied into consumer-facing material. So they follow stricter rules than the rest of the database.

### The rules
1. **Copy, never compute.** Every number must appear in the source exactly as entered. Never derive, average, convert units or estimate. If the unit or scope is unclear, use `unknown`; never guess.
2. **Every entry needs a source**: `source_url`, `source_quote` (verbatim text that contains the number; `5.85` and `5,85` both match) and `retrieved` (the date you read it, `YYYY-MM-DD`). No source, no entry.
3. **Primary sources first**: the brand's own site, PDF, blog or declaration. A retailer or press copy of the brand's text is allowed only when the original can't be reached; mark it `source_type: "secondary"`.
4. **Never store** offsets or tree planting, "carbon neutral" / "climate neutral" / "CO₂ neutral", "eco-friendly", "most sustainable", or biodegradability marketing. The EU Empowering Consumers Directive bans offset-based and generic green claims, and these fields end up in consumer marketing. The schema has nowhere to put them on purpose.
5. **No estimates in `data/`.** Generic per-material defaults are a different kind of data and live in [`reference/`](../reference), never in a brand's filament.
6. **Recycled content needs the trait.** `recycled_content.pct > 0` requires `traits.recycled: true` on the affected variants (an error otherwise). The reverse only warns, and only once the filament or variant has a `sustainability` block.

`ofd validate` enforces rules 2, 6 and the number-in-quote part of rule 1, and rejects percentages outside 0–100 and dates in the future.

### Where it goes
`sustainability` can sit on `filament.json` and on `variant.json`. A variant overrides the filament **per field**: if a variant sets `recycled_content`, that replaces the filament's `recycled_content`; if it sets `carbon_footprints`, that array replaces the filament's array as a whole. Fields the variant doesn't set are inherited. If the filament's footprint doesn't apply to a variant and there is no figure for it (a composite colour, say), set `"carbon_footprints": []` on the variant to clear it. Spool and packaging details go on each size in `sizes.json` as `container_details`.

```json
"sustainability": {
  "recycled_content": {
    "pct": 100, "pct_qualifier": "exact",
    "type": "post_industrial", "evidence": "supplier_declaration",
    "source_type": "primary",
    "source_url": "https://blog.prusa3d.com/introducing-prusament-pla-recycled_59116/",
    "source_quote": "…100 % of recycled Prusament PLA materials…",
    "retrieved": "2026-10-21"
  },
  "carbon_footprints": [{
    "value_kg_co2e": 5.85, "declared_unit": "per_kg_filament",
    "boundary": "filament_cradle_to_gate", "packaging_included": "unknown",
    "biogenic_carbon": "unknown", "recycled_allocation": "not_applicable",
    "method": "lca", "tool": "SimaPro 9.3.0.2", "verification": "none",
    "publicly_available": true, "published": "2022-03-17",
    "source_type": "primary", "source_url": "https://blog.prusa3d.com/…",
    "source_quote": "The results show 5.85 kg of CO2 with 1kg of pure Prusament PETG",
    "retrieved": "2026-10-21"
  }]
}
```

### Field guide
| Field | Values | Meaning |
|---|---|---|
| `recycled_content.pct` | 0–100 or `null` | `null` when the source says "recycled" but gives no number |
| `pct_qualifier` | `exact`, `up_to`, `at_least` | "up to 89%" is `up_to`, "90–100%" is `at_least` 90 |
| `recycled_content.type` | `post_industrial`, `post_consumer`, `mixed`, `unknown` | Manufacturing scrap vs. used products. Use `unknown` when sources conflict, and quote both in `notes` |
| `evidence` | `iso_14021`, `third_party_certified`, `supplier_declaration`, `marketing` | `iso_14021` only when the source cites ISO 14021; GRS/RCS/SCS certificates are `third_party_certified` |
| `bio_based_content.method` | `astm_d6866`, `en_16785`, `declared` | Bio-based **pigments or additives are not bio-based content** |
| `declared_unit` | `per_kg_filament`, `per_spool_as_sold`, `unknown` | What the number refers to. Use `unknown` if the source doesn't say "per kg" |
| `boundary` | see below | Which life-cycle stages the number covers |
| `packaging_included` | `yes`, `no`, `unknown` | Whether spool, box and bag are inside the number |
| `biogenic_carbon` | `included`, `excluded`, `reported_separately`, `unknown` | How carbon absorbed by plants is counted |
| `recycled_allocation` | `cut_off`, `burden_free_scrap`, `other`, `unknown`, `not_applicable` | How recycled input is credited; `not_applicable` for virgin material |
| `method` | `epd`, `iso_14067`, `lca`, `declaration` | `declaration` is a figure with no published study behind it |
| `standard` | free text or `null` | **Only** when the source names one, e.g. "ISO 14067" |
| `verification` | `none`, `peer_review`, `third_party`, `epd_registered` | Independent review of the study |
| `publicly_available` | boolean | `false` when the study is "available on request" |
| `relative_claims[].baseline` | free text | Verbatim, e.g. "generic PET filament" |

**Boundaries:**
- `resin_cradle_to_gate`: making the raw plastic only, before it becomes filament.
- `filament_cradle_to_gate`: from raw materials up to filament leaving the factory.
- `cradle_to_customer`: also includes delivery to the buyer.
- `cradle_to_grave`: the full life cycle, including end of life.

**Relative claims** (`relative_claims`) are for brands that only publish "X% lower than …". Store the percentage and the baseline exactly as written, and never turn them into an absolute number.

### Valid sources
- ✅ The brand's product page, datasheet, sustainability page, blog post, LCA report or EPD
- ✅ A retailer or press copy of the brand's own text, **only** when the original is gone (`source_type: "secondary"`)
- ❌ A company-wide footprint (e.g. an ISO 14064-1 corporate report) as a product figure
- ❌ Figures you calculated, averaged or converted
- ❌ Anything from the "never store" list above

Checked a brand and found nothing? Record that in [`docs/sustainability-sources.md`](sustainability-sources.md). A negative result is useful too.

## 🔩 Mechanical data
Data sheets give stiffness, strength, impact and heat values, often **per print direction**: a part is weaker across its layers than along them. `mechanical` keeps those values with their source, so CAD, simulation and slicer tools can use them.

### The rules
1. **Copy, never compute.** Enter each value in the unit the sheet uses: a sheet in psi stays in psi, and `3.86 GPa` is never entered as `3860 MPa`. Never average, convert or estimate.
2. **Every entry needs a source**: `source_url`, `source_quote` and `retrieved`, as for [sustainability data](#-sustainability-data). The quote is the sheet's row, verbatim, and must contain the value (and `plus_minus`, if set). `5.85` matches `5,85`. In `MPa`, `psi`, `ksi` and `J/m`, where values of 1000 and up are common, `7250` also matches `7,250`; in other units a comma is a decimal comma, so `2,350 GPa` is `2.35`.
3. **Primary sources first**: the brand's own data sheet (TDS) or product page. Mark a retailer copy `source_type: "secondary"`.
4. **One entry per value**: one for X-Y, one for Z, one for dry and one for conditioned. If the sheet gives a range or a footnote, quote it and explain it in `notes`.
5. **No generic values in `data/`.** Typical values for a material type (PLA, PETG...) are not a brand's data.

`ofd validate` checks the sources, the value in the quote, dates in the future and that the unit fits the property (errors). It warns about a print direction on moulded bars and about repeated entries (same property, direction, condition, standard, unit and specimen).

On a pull request, the `Sustainability sources` check also checks every new or changed mechanical value against its source, and a PR that touches mechanical data never merges automatically. See [automated review](automated-review.md#sustainability-data).

### Where it goes
`mechanical` is an array on `filament.json`. Variants don't override it: a data sheet covers the product line.

```json
"mechanical": [
  {
    "property": "tensile_modulus", "direction": "XY",
    "value": 3860, "plus_minus": 230, "unit": "MPa",
    "standard": "ISO 527", "condition": "dry",
    "specimen": {"process": "printed", "infill_percent": 100, "print_temperature": 290,
                 "conditioning": "annealed and dried at 80 °C for 12 h"},
    "source_type": "primary",
    "source_url": "https://store.bblcdn.com/7166b20bc68f4c87b32c972b856eeb4b.pdf",
    "source_quote": "Young's Modulus (X-Y) ISO 527, GB/T 1040 3860 ± 230 MPa",
    "retrieved": "2026-11-08"
  }
]
```

The sheet's Z row (`2180 ± 130 MPa`) is a second entry with `"direction": "Z"` and its own quote.

### Field guide
| Field | Values | Meaning |
|---|---|---|
| `property` | `tensile_modulus`, `tensile_strength`, `yield_strength`, `elongation_at_break`, `flexural_modulus`, `flexural_strength`, `impact_strength`, `impact_strength_notched`, `heat_deflection_045`, `heat_deflection_18`, `vicat_softening` | What was measured. `heat_deflection_045` / `_18` are HDT at 0.45 / 1.8 MPa. Young's modulus is `tensile_modulus` |
| `direction` | `XY`, `XZ`, `Z`, `unknown` | `XY`: bars printed flat (along the layers). `XZ`: on edge. `Z`: upright (across the layers). `unknown` when the sheet gives none, and for moulded bars |
| `value`, `plus_minus` | numbers | As written. `plus_minus` is the "±" spread, or `null` |
| `unit` | `MPa`, `GPa`, `psi`, `ksi`, `%`, `kJ/m2`, `J/m`, `ft-lb/in`, `°C`, `°F` | Must fit the property: moduli and strengths in `MPa`, `GPa`, `psi` or `ksi`; elongation in `%`; impact in `kJ/m2` (ISO 179 / 180), `J/m` or `ft-lb/in` (ASTM D256); heat in `°C` or `°F` |
| `standard` | free text or `null` | **Only** when the sheet names one, e.g. "ISO 527" or "ASTM D638" |
| `condition` | `dry`, `conditioned` | Moisture state at test time, when the sheet gives it (common for nylons) |
| `specimen` | object | How the bars were made: `process` (`printed`, `moulded`, `unknown`), `printer`, `nozzle_diameter`, `layer_height`, `infill_percent`, `perimeters`, `raster_angle`, `print_temperature`, `bed_temperature`, `chamber_temperature`, `print_speed`, `conditioning` (e.g. "annealed at 80 °C for 12 h"). Leave out what the sheet doesn't say |

### Valid sources
- ✅ The brand's technical data sheet (TDS) or product page
- ✅ A retailer copy of the brand's sheet, **only** when the original is gone (`source_type: "secondary"`)
- ❌ Your own test results, or values from a review or forum
- ❌ Values you converted, averaged or read off a chart

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
