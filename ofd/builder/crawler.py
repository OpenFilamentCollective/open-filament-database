"""
Data crawler that scans the canonical data structure and builds normalized entities.

Entities are plain dicts — source JSON fields pass through as-is, with only
computed fields (UUIDs, slugs, foreign keys) overlaid on top.
"""

import json
from pathlib import Path

from .errors import BuildResult
from .models import Database
from .utils import (
    generate_brand_id, generate_material_id, generate_filament_id,
    generate_variant_id, generate_size_id, generate_store_id,
    generate_purchase_link_id, normalize_color_hex, slugify, ensure_list
)


class DataCrawler:
    """Crawls the data directory structure and builds normalized database."""

    def __init__(self, data_dir: str, stores_dir: str):
        self.data_dir = Path(data_dir)
        self.stores_dir = Path(stores_dir)
        self.db = Database()
        self._result = BuildResult()

        # Caches for deduplication
        self._brand_cache: dict[str, str] = {}  # name -> id
        self._material_cache: dict[str, str] = {}  # brand_id:material -> id
        self._store_cache: dict[str, str] = {}  # original_id -> uuid

    def crawl(self) -> tuple[Database, BuildResult]:
        """Crawl all data and return the populated database and any errors."""
        print("Starting data crawl...")

        # Crawl stores first (so we can validate purchase links)
        self._crawl_stores_directory()

        # Crawl main data directory (brands/materials/products/variants)
        self._crawl_data_directory()

        # Print summary
        print(f"\nCrawl complete!")
        print(f"  Brands: {len(self.db.brands)}")
        print(f"  Materials: {len(self.db.materials)}")
        print(f"  Filaments: {len(self.db.filaments)}")
        print(f"  Variants: {len(self.db.variants)}")
        print(f"  Sizes: {len(self.db.sizes)}")
        print(f"  Stores: {len(self.db.stores)}")
        print(f"  Purchase Links: {len(self.db.purchase_links)}")

        return self.db, self._result

    def _crawl_stores_directory(self):
        """Crawl the stores/ directory."""
        if not self.stores_dir.exists():
            self._result.add_warning("Directory", "Stores directory does not exist", self.stores_dir)
            return

        for store_dir in sorted(self.stores_dir.iterdir()):
            if not store_dir.is_dir():
                continue
            if store_dir.name.startswith('.'):
                continue

            self._process_store_directory(store_dir)

    def _process_store_directory(self, store_dir: Path):
        """Process a store directory."""
        store_json = store_dir / "store.json"
        if not store_json.exists():
            return

        try:
            with open(store_json, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            self._result.add_warning("JSON Parse", f"Failed to parse: {e}", store_json)
            return

        # Get the original ID from the JSON (required field)
        original_id = data.get("id")
        if not original_id:
            self._result.add_warning("Missing Field", "Store missing 'id' field", store_json)
            return

        store_id = generate_store_id(original_id)

        # Start with all source data, overlay computed fields
        store = {
            **data,
            "id": store_id,
            "name": data.get("name", store_dir.name),
            "slug": slugify(data.get("name", store_dir.name)),
            "directory_name": store_dir.name,  # internal, stripped on export
            "storefront_url": data.get("storefront_url", ""),
            "logo": data.get("logo", ""),
            "ships_from": ensure_list(data.get("ships_from", [])),
            "ships_to": ensure_list(data.get("ships_to", [])),
        }

        self.db.stores.append(store)
        self._store_cache[original_id] = store_id

    def _crawl_data_directory(self):
        """Crawl the data/ directory for brands, products, variants."""
        if not self.data_dir.exists():
            self._result.add_warning("Directory", "Data directory does not exist", self.data_dir)
            return

        # Each subdirectory of data/ is a brand
        for brand_dir in sorted(self.data_dir.iterdir()):
            if not brand_dir.is_dir():
                continue
            if brand_dir.name.startswith('.'):
                continue

            self._process_brand_directory(brand_dir)

    def _process_brand_directory(self, brand_dir: Path):
        """Process a brand directory."""
        brand_name = brand_dir.name

        # Load brand.json
        brand_json = brand_dir / "brand.json"
        if not brand_json.exists():
            self._result.add_warning("Missing File", "Missing brand.json", brand_dir)
            return

        try:
            with open(brand_json, 'r', encoding='utf-8') as f:
                brand_data = json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            self._result.add_warning("JSON Parse", f"Failed to parse: {e}", brand_json)
            return

        # Create brand
        brand_id = generate_brand_id(brand_name)

        brand = {
            **brand_data,
            "id": brand_id,
            "name": brand_data.get("name", brand_name),
            "slug": slugify(brand_name),
            "directory_name": brand_name,  # internal, stripped on export
            "website": brand_data.get("website", ""),
            "logo": brand_data.get("logo", ""),
            "origin": brand_data.get("origin", "Unknown"),
        }

        self.db.brands.append(brand)
        self._brand_cache[brand_name] = brand_id

        # Each subdirectory is a material type
        for material_dir in sorted(brand_dir.iterdir()):
            if not material_dir.is_dir():
                continue
            if material_dir.name.startswith('.'):
                continue

            self._process_material_directory(material_dir, brand_id)

    def _process_material_directory(self, material_dir: Path, brand_id: str):
        """Process a material directory under a brand."""
        material_name = material_dir.name

        # Load material.json if exists
        material_json = material_dir / "material.json"
        material_data = {}
        if material_json.exists():
            try:
                with open(material_json, 'r', encoding='utf-8') as f:
                    material_data = json.load(f)
            except (json.JSONDecodeError, IOError) as e:
                self._result.add_warning("JSON Parse", f"Failed to parse: {e}", material_json)

        # Create material
        material_id = generate_material_id(brand_id, material_name)
        cache_key = f"{brand_id}:{material_name}"

        if cache_key not in self._material_cache:
            # Pass through all source data, overlay computed fields
            material = {
                **material_data,
                "id": material_id,
                "brand_id": brand_id,
                "material": material_data.get("material", material_name),
                "slug": slugify(material_name),
                "material_class": material_data.get("material_class", "FFF"),
            }

            self.db.materials.append(material)
            self._material_cache[cache_key] = material_id

        # Each subdirectory is a filament line
        for filament_dir in sorted(material_dir.iterdir()):
            if not filament_dir.is_dir():
                continue
            if filament_dir.name.startswith('.'):
                continue

            self._process_filament_directory(filament_dir, brand_id, material_id, material_name)

    def _process_filament_directory(
        self, filament_dir: Path, brand_id: str, material_id: str, material_name: str
    ):
        """Process a filament directory."""
        # Load filament.json
        filament_json = filament_dir / "filament.json"
        if not filament_json.exists():
            self._result.add_warning("Missing File", "Missing filament.json", filament_dir)
            return

        try:
            with open(filament_json, 'r', encoding='utf-8') as f:
                filament_data = json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            self._result.add_warning("JSON Parse", f"Failed to parse: {e}", filament_json)
            return

        # Generate filament ID using OFD standard algorithm
        filament_name = filament_data.get("name", filament_dir.name)
        filament_id = generate_filament_id(brand_id, material_id, filament_name)

        # All source fields pass through via **filament_data
        filament = {
            **filament_data,
            "id": filament_id,
            "brand_id": brand_id,
            "material_id": material_id,
            "name": filament_name,
            "slug": slugify(filament_name),
            "material": material_name,
            "density": filament_data.get("density", 1.24),
            "diameter_tolerance": filament_data.get("diameter_tolerance", 0.02),
            "discontinued": filament_data.get("discontinued", False),
        }

        self.db.filaments.append(filament)

        # Each subdirectory is a color variant
        for variant_dir in sorted(filament_dir.iterdir()):
            if not variant_dir.is_dir():
                continue
            if variant_dir.name.startswith('.'):
                continue

            self._process_variant_directory(variant_dir, filament_id)

    def _process_variant_directory(self, variant_dir: Path, filament_id: str):
        """Process a variant (color) directory."""
        # Load variant.json
        variant_json = variant_dir / "variant.json"
        if not variant_json.exists():
            self._result.add_warning("Missing File", "Missing variant.json", variant_dir)
            return

        try:
            with open(variant_json, 'r', encoding='utf-8') as f:
                variant_data = json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            self._result.add_warning("JSON Parse", f"Failed to parse: {e}", variant_json)
            return

        # Use source "id" for UUID generation (matches directory name, preserves UUIDs)
        variant_source_id = variant_data.get("id", variant_dir.name)
        color_name = variant_data.get("name", variant_dir.name)

        # Generate variant ID using OFD standard algorithm
        variant_id = generate_variant_id(filament_id, variant_source_id)

        # Parse color hex (can be string or array)
        color_hex_raw = variant_data.get("color_hex", "#000000")
        if isinstance(color_hex_raw, list):
            color_hex = normalize_color_hex(color_hex_raw[0]) if color_hex_raw else "#000000"
        else:
            color_hex = normalize_color_hex(color_hex_raw) or "#000000"

        # Normalize hex variants if present
        hex_variants = variant_data.get("hex_variants")
        if hex_variants:
            hex_variants = [normalize_color_hex(h) for h in hex_variants if h]

        # All source fields pass through via **variant_data (traits, color_standards, etc.)
        variant = {
            **variant_data,
            "id": variant_id,
            "filament_id": filament_id,
            "slug": slugify(variant_source_id),
            "name": color_name,
            "color_hex": color_hex,
            "discontinued": variant_data.get("discontinued", False),
        }
        if hex_variants:
            variant["hex_variants"] = hex_variants

        self.db.variants.append(variant)

        # Load sizes.json
        sizes_json = variant_dir / "sizes.json"
        if sizes_json.exists():
            self._process_sizes_file(sizes_json, variant_id)

    def _process_sizes_file(self, sizes_json: Path, variant_id: str):
        """Process sizes.json file to create sizes and purchase links."""
        try:
            with open(sizes_json, 'r', encoding='utf-8') as f:
                sizes_data = json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            self._result.add_warning("JSON Parse", f"Failed to parse: {e}", sizes_json)
            return

        if not isinstance(sizes_data, list):
            sizes_data = [sizes_data]

        for idx, size_entry in enumerate(sizes_data):
            self._create_size(size_entry, variant_id, idx, sizes_json)

    def _create_size(self, size_entry: dict, variant_id: str, index: int, sizes_json: Path):
        """Create a size entity from a sizes.json entry."""
        weight = size_entry.get("filament_weight")
        diameter = size_entry.get("diameter", 1.75)
        # Default to 1.75 if diameter is 0 or not set
        if not diameter:
            diameter = 1.75

        if weight is None:
            self._result.add_warning("Missing Field", f"Size entry [{index}] missing filament_weight", sizes_json)
            return

        size_id = generate_size_id(variant_id, size_entry, index)

        # Handle gtin/ean normalization
        gtin = size_entry.get("gtin") or size_entry.get("ean")

        # Pop purchase_links before storing (they become separate entities)
        purchase_links_data = size_entry.get("purchase_links", [])

        # All source fields pass through, overlay computed fields
        size = {
            **size_entry,
            "id": size_id,
            "variant_id": variant_id,
            "filament_weight": int(weight),
            "diameter": float(diameter),
            "discontinued": size_entry.get("discontinued", False),
        }
        if gtin:
            size["gtin"] = gtin
        # Remove ean if we normalized it to gtin
        size.pop("ean", None)
        # Remove purchase_links from size dict (they are separate entities)
        size.pop("purchase_links", None)

        self.db.sizes.append(size)

        # Process purchase links
        for pl_idx, pl_entry in enumerate(purchase_links_data):
            self._create_purchase_link(pl_entry, size_id, index, pl_idx, sizes_json)

    def _create_purchase_link(self, pl_entry: dict, size_id: str, size_index: int, link_index: int, sizes_json: Path):
        """Create a purchase link entity."""
        original_store_id = pl_entry.get("store_id")
        url = pl_entry.get("url")

        if not original_store_id or not url:
            self._result.add_warning(
                "Missing Field",
                f"Purchase link [{size_index}].purchase_links[{link_index}] missing store_id or url",
                sizes_json
            )
            return

        # Look up the store UUID from the original ID
        store_uuid = self._store_cache.get(original_store_id)
        if not store_uuid:
            self._result.add_warning(
                "Invalid Reference",
                f"Unknown store_id '{original_store_id}' at [{size_index}].purchase_links[{link_index}]",
                sizes_json
            )
            return

        pl_id = generate_purchase_link_id(size_id, store_uuid, url)

        # All source fields pass through, overlay computed fields
        purchase_link = {
            **pl_entry,
            "id": pl_id,
            "size_id": size_id,
            "store_id": store_uuid,
            "url": url,
            "spool_refill": pl_entry.get("spool_refill", False),
        }
        # Normalize ships_from/ships_to if present
        if purchase_link.get("ships_from"):
            purchase_link["ships_from"] = ensure_list(purchase_link["ships_from"])
        if purchase_link.get("ships_to"):
            purchase_link["ships_to"] = ensure_list(purchase_link["ships_to"])

        self.db.purchase_links.append(purchase_link)


def crawl_data(data_dir: str, stores_dir: str) -> tuple[Database, BuildResult]:
    """Main entry point to crawl data and return populated database and errors."""
    crawler = DataCrawler(data_dir, stores_dir)
    return crawler.crawl()
