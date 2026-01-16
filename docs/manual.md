# Manual Contribution Guide
This guide explains how to manually edit the database files. We recommend reading through this document first, then exploring the `/data` folder for reference examples.

**Note:** Most contributors find the [WebUI](webui.md) easier to use than manual editing. Consider using the WebUI unless you have a specific reason to edit files directly.

## 📁 Project Structure
The database is organized as a structured JSON-based hierarchy inside the `/data` directory, following this pattern:
```
data/
└── [brand-name]/
    ├── brand.json
    ├── [brand-logo].json
    └── [material-type (e.g. PLA, ABS, PETG)]/
        ├── material.json
        └── [filament-name]/
            ├── filament.json
            └── [variant-name]/
                ├── sizes.json
                └── variant.json
```
## 🧾 General Guidelines
- Each **brand** has its own folder under `data/` which contains:
  - A `brand.json` file with brand information
  - The brand's logo image
- Each **material** type (e.g., PLA, PETG, ABS) has its own subfolder inside the brand folder containing a `material.json` file
- Each **filament** (e.g., Bambu Lab's Basic Gradient) has its own subfolder containing a `filament.json` file
- Each **variant** of a filament (e.g., colors like Red, Blue, Black) has its own subfolder with `sizes.json` and `variant.json` files

### 🏷️ Adding a Brand

1. Go to the `data/` directory and create a new folder for your brand
2. Add the brand's logo:
   - Maximum size: 400x400 pixels (SVG files can be any size)
   - Naming: Use lowercase snake_case (e.g., `colorfab.png`)
   - Keep the filename simple
3. Create a `brand.json` file with the following fields:
   - `brand` - The brand name
   - `website` - The brand's website URL
   - `logo` - The filename of the logo (e.g., `colorfab.png`)
   - `origin` - Country of origin (use an empty string `""` if unknown)

### 🧪 Adding a Material Type
1. Navigate to your brand's folder and create a new folder named after the material type
2. Create a `material.json` file with:
   - `material` - The material name (e.g., `"PLA"`, `"PETG"`, `"ABS"`)
   - Optional fields:
     - Default maximum dry temperature
     - Default slicer settings (refer to `schemas/material_schema.json` for details)

### 📦 Adding a Filament
Each filament represents a product line (e.g., "Silk PLA", "Tough PLA"), **not a specific color**.

1. Navigate to your material type folder and create a new folder named after the filament
2. Create a `filament.json` file with:
   - Required fields:
     - Filament name
     - Diameter tolerance (in mm)
     - Filament density
   - Optional fields:
     - Maximum dry temperature
     - Data sheet URL
     - Safety sheet URL
     - Discontinued status (boolean)
     - Slicer IDs and settings (refer to `schemas/filament_schema.json` for details)

### 🎨 Adding a Variant
Navigate to your filament folder and create a new folder named after the variant. Create the following two files:

#### variant.json
Create a `variant.json` file with:
- Required fields:
  - `color_name` - The variant name (usually a color like "Red" or "Black")
  - `color_hex` - Hex color code representing the variant (e.g., `"#FF0000"`)
- Optional fields (see `schemas/variant_schema.json` for details):
  - `discontinued` - Whether the variant is discontinued (boolean)
  - `hex_variants` - Array of alternative hex color codes
  - `color_standards` - Standard color codes (RAL, Pantone, etc.)
  - `traits` - Special properties (e.g., "glow-in-the-dark", "silk")

#### sizes.json
Create a `sizes.json` file containing an array of size objects. Each object includes:
- Required fields:
  - Filament weight (in grams)
  - Filament diameter (in mm, typically `1.75` or `2.85`)
- Optional fields:
  - Empty spool weight
  - Spool core diameter
  - EAN code
  - Internal article number
  - Barcode/NFC/QR identifiers
  - Discontinued status
  - `purchase_links` - Array of purchase links (highly recommended):
    - `store_id` - Reference to a store in the `/stores` directory
    - `url` - Link to the product page
    - `is_affiliate` - Whether this is an affiliate link (boolean)

For detailed schema information, see `schemas/sizes_schema.json`.

### 🏪 Adding a Store
Stores are referenced in purchase links and are stored in the `/stores` directory.

1. Create a new folder in `/stores` using lowercase snake_case (e.g., `amazon_us`, `printed_solid`)
2. Add the store logo:
   - Maximum size: 400x400 pixels (SVG files can be any size)
   - Naming: Use lowercase snake_case matching the folder name (e.g., `amazon_us.png`)
3. Create a `store.json` file with:
   - Required fields:
     - `id` - Store identifier (must match the folder name)
     - `name` - Display name of the store
     - `storefront_url` - URL to the store's homepage
     - `logo` - Filename of the logo image
     - `ships_from` - Array of shipping origin locations (use `[]` if unknown)
     - `ships_to` - Array of shipping destination locations (use `[]` if unknown)
   - Optional fields:
     - `storefront_affiliate_link` - Affiliate link to the storefront

For detailed schema information, see `schemas/store_schema.json`.
