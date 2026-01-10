# Manually contributing to the database!
Below is much of the important information regarding how to contribute, in general we reommend reading through this document and then taking a look in the `/data` folder for reference \:D

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
- Each **brand** has it's own folder under `data/` which contains:
  - A brand.json file that contains data about the brand
  - The brands logo
- Each **material** type (e.g., PLA, PETG, ABS) has it's own subfolder inside the **brand** folder which contains a material.json file about it.
- Each **filament** (e.g. Bambu Lab's Basic Gradient) has it's own subfolder, it contains a filament.json file about it.
- Each **variant** of the **filament** (e.g. colours) has it's own subfolder with a sizes.json and variant.json files

### 🏷️ Adding a Brand

- Go to the `data/` directory and create a new folder for your brand.
- Add the logo of your brand, it should:
  - Max be 400x400, unless it's an svg.
  - Named with lowercase snakecase.
  - Be simple (e.g. "colorfab.png")
- Create a `brand.json` for your brand. The file should include:
  - Brand name, using the `brand` key
  - Website URL, using the `website` key
  - The name of the logo file, using the `logo` key
  - Country of origin (or an empty string), using the `origin` key

### 🧪 Adding a Material Type
- Go to your brands folder and create a new folder named after your material type.
- Create a `material.json` file. It should include:
  - The material name (e.g., PLA, PETG), using the `material` 
  - Optionally you can also include the following keys:
    - The default max dry temperature
    - The default slicer settings, refer to the schema for info about this in `schemas/material_schema.json`.

### 📦 Adding a Filament
Each filament represents a product line (e.g., "Silk PLA", "Tough PLA", etc.), **not a specific color**.

- Go to your material type folder and create a new folder named after your filament.
- Create a `filament.json` file, It should include:
  - The filaments name
  - The diameter tolerance in mm
  - The density of the filament
  - Optionally you can also include the following keys:
    - The max dry temperature
    - A URL to the data sheet
    - A URL to the safety sheet
    - Whether it is discontinued or not
    - The slicer ids and slicer settings, you should refer to the schema for info about this in `schemas/filament_schema.json`.

### 🎨 Adding a Variant
- Go to your filament folder and create a new folder named after your variant, it includes the following two files.
#### Variant.json
- Create a `variant.json` file, It should include:
  - A color name, in reality this is just your variant name but most variants are colours.
  - A color hex, this hex code defines the colour of your variant.
  - Optionally you can also include one or more of the following but we suggest you refer to the schema at `schemas/variant_schema.json` for more detail if you need to define these:
    - Whether it is discontinued or not.
    - A hex variants array which defines alternative color codes.
    - The color standards of the variant.
    - The traits of this variant.

#### Sizes.json
- Create a `sizes.json` file, It should include an array of objects that each define the following:
  - The variants filament weight.
  - The variants diameter.
  - Optionally you can also include the following keys:
    - The empty spool weight.
    - The spool core diameter.
    - The ean of this variant.
    - The internal article number.
    - The barcode identifier.
    - The nfc identifier.
    - The qr identifier.
    - Whether or not it is discontinued.
    - An array of purchase links, this is highly recommended and mostly just includes the following few traits, for more detail please refer to the schema in `schemas/sizes_schema.json`.
      - A store id, mostly this'll be a string that refers to a store inside `/stores` directory.
      - A url to the shop page, preferably this'll be the exact variant but the general filament page works in a pinch.
      - Whether or not it is an affiliate link.

### 🏪 Adding a Store
Stores are referenced in purchase links and live in the `/stores` directory.

- Create a new folder in `/stores` named after your store (use lowercase with underscores for the folder name, e.g., `my_store`).
- Add the store logo, it should:
  - Max be 400x400, unless it's an svg.
  - Named with lowercase snakecase (e.g. "my_store.png").
- Create a `store.json` file. It should include:
  - `id` - The store identifier (should match the folder name)
  - `name` - The display name of the store
  - `storefront_url` - The URL to the store's homepage
  - `logo` - The filename of the logo image
  - `ships_from` - An array of locations the store ships from (can be empty)
  - `ships_to` - An array of locations the store ships to (can be empty)
  - Optionally: `storefront_affiliate_link` - An affiliate link to the storefront

For more details, refer to the schema in `schemas/store_schema.json`.
