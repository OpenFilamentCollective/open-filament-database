"""
Data crawler that scans the canonical data structure and builds normalized entities.
"""

import json
from pathlib import Path
from typing import Optional

from .errors import BuildResult
from .models import (
    Brand, Material, Filament, Variant, Size, Store, PurchaseLink, Database,
    SlicerSettings, GenericSlicerSettings, AllSlicerSettings, SlicerIds,
    ColorStandards, VariantTraits
)
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

        # Handle ships_from/ships_to which can be string or array
        ships_from = ensure_list(data.get("ships_from", []))
        ships_to = ensure_list(data.get("ships_to", []))

        store = Store(
            id=store_id,
            name=data.get("name", store_dir.name),
            slug=slugify(data.get("name", store_dir.name)),
            directory_name=store_dir.name,
            storefront_url=data.get("storefront_url", ""),
            logo=data.get("logo", ""),
            ships_from=ships_from,
            ships_to=ships_to
        )

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

        brand = Brand(
            id=brand_id,
            name=brand_data.get("name", brand_name),
            slug=slugify(brand_name),
            directory_name=brand_name,
            website=brand_data.get("website", ""),
            logo=brand_data.get("logo", ""),
            origin=brand_data.get("origin", "Unknown")
        )

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
            # Parse default slicer settings if present
            default_slicer_settings = self._parse_slicer_settings(
                material_data.get("default_slicer_settings")
            )

            material = Material(
                id=material_id,
                brand_id=brand_id,
                material=material_data.get("material", material_name),
                slug=slugify(material_name),
                default_max_dry_temperature=material_data.get("default_max_dry_temperature"),
                default_slicer_settings=default_slicer_settings
            )

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

        # Parse slicer IDs and settings
        slicer_ids = self._parse_slicer_ids(filament_data.get("slicer_ids"))
        slicer_settings = self._parse_slicer_settings(filament_data.get("slicer_settings"))

        filament = Filament(
            id=filament_id,
            brand_id=brand_id,
            material_id=material_id,
            name=filament_name,
            slug=slugify(filament_name),
            material=material_name,
            density=filament_data.get("density", 1.24),
            diameter_tolerance=filament_data.get("diameter_tolerance", 0.02),
            max_dry_temperature=filament_data.get("max_dry_temperature"),
            data_sheet_url=filament_data.get("data_sheet_url"),
            safety_sheet_url=filament_data.get("safety_sheet_url"),
            discontinued=filament_data.get("discontinued", False),
            slicer_ids=slicer_ids,
            slicer_settings=slicer_settings
        )

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

        # Get color name first (needed for ID generation)
        color_name = variant_data.get("color_name", variant_dir.name)

        # Generate variant ID using OFD standard algorithm
        variant_id = generate_variant_id(filament_id, color_name)

        # Parse color hex (can be string or array)
        color_hex_raw = variant_data.get("color_hex", "#000000")
        if isinstance(color_hex_raw, list):
            color_hex = normalize_color_hex(color_hex_raw[0]) if color_hex_raw else "#000000"
        else:
            color_hex = normalize_color_hex(color_hex_raw) or "#000000"

        # Parse hex variants
        hex_variants = variant_data.get("hex_variants")
        if hex_variants:
            hex_variants = [normalize_color_hex(h) for h in hex_variants if h]

        # Parse color standards
        color_standards = self._parse_color_standards(variant_data.get("color_standards"))

        # Parse traits
        traits = self._parse_traits(variant_data.get("traits"))

        variant = Variant(
            id=variant_id,
            filament_id=filament_id,
            slug=slugify(color_name),
            color_name=color_name,
            color_hex=color_hex,
            hex_variants=hex_variants,
            color_standards=color_standards,
            traits=traits,
            discontinued=variant_data.get("discontinued", False)
        )

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

        size = Size(
            id=size_id,
            variant_id=variant_id,
            filament_weight=int(weight),
            diameter=float(diameter),
            empty_spool_weight=size_entry.get("empty_spool_weight"),
            spool_core_diameter=size_entry.get("spool_core_diameter"),
            gtin=size_entry.get("gtin") or size_entry.get("ean"),
            article_number=size_entry.get("article_number"),
            barcode_identifier=size_entry.get("barcode_identifier"),
            nfc_identifier=size_entry.get("nfc_identifier"),
            qr_identifier=size_entry.get("qr_identifier"),
            discontinued=size_entry.get("discontinued", False)
        )

        self.db.sizes.append(size)

        # Process purchase links
        purchase_links = size_entry.get("purchase_links", [])
        for pl_idx, pl_entry in enumerate(purchase_links):
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

        # Handle ships_from/ships_to overrides
        ships_from = pl_entry.get("ships_from")
        if ships_from:
            ships_from = ensure_list(ships_from)

        ships_to = pl_entry.get("ships_to")
        if ships_to:
            ships_to = ensure_list(ships_to)

        purchase_link = PurchaseLink(
            id=pl_id,
            size_id=size_id,
            store_id=store_uuid,
            url=url,
            spool_refill=pl_entry.get("spool_refill", False),
            ships_from=ships_from,
            ships_to=ships_to
        )

        self.db.purchase_links.append(purchase_link)

    def _parse_slicer_ids(self, data: Optional[dict]) -> Optional[SlicerIds]:
        """Parse slicer IDs from JSON data."""
        if not data:
            return None

        return SlicerIds(
            prusaslicer=data.get("prusaslicer"),
            bambustudio=data.get("bambustudio"),
            orcaslicer=data.get("orcaslicer"),
            cura=data.get("cura")
        )

    def _parse_slicer_settings(self, data: Optional[dict]) -> Optional[AllSlicerSettings]:
        """Parse slicer settings from JSON data."""
        if not data:
            return None

        def parse_specific(d: Optional[dict]) -> Optional[SlicerSettings]:
            if not d:
                return None
            profile_name = d.get("profile_name")
            if not profile_name:
                return None
            return SlicerSettings(
                profile_name=profile_name,
                overrides=d.get("overrides")
            )

        generic_data = data.get("generic")
        generic = None
        if generic_data:
            generic = GenericSlicerSettings(
                first_layer_bed_temp=generic_data.get("first_layer_bed_temp"),
                first_layer_nozzle_temp=generic_data.get("first_layer_nozzle_temp"),
                bed_temp=generic_data.get("bed_temp"),
                nozzle_temp=generic_data.get("nozzle_temp")
            )

        return AllSlicerSettings(
            prusaslicer=parse_specific(data.get("prusaslicer")),
            bambustudio=parse_specific(data.get("bambustudio")),
            orcaslicer=parse_specific(data.get("orcaslicer")),
            cura=parse_specific(data.get("cura")),
            generic=generic
        )

    def _parse_color_standards(self, data: Optional[dict]) -> Optional[ColorStandards]:
        """Parse color standards from JSON data."""
        if not data:
            return None

        return ColorStandards(
            ral=data.get("ral"),
            ncs=data.get("ncs"),
            pantone=data.get("pantone"),
            bs=data.get("bs"),
            munsell=data.get("munsell")
        )

    def _parse_traits(self, data: Optional[dict]) -> Optional[VariantTraits]:
        """Parse variant traits from JSON data."""
        if not data:
            return None

        return VariantTraits(
            translucent=data.get("translucent", False),
            glow=data.get("glow", False),
            matte=data.get("matte", False),
            recycled=data.get("recycled", False),
            recyclable=data.get("recyclable", False),
            biodegradable=data.get("biodegradable", False)
        )


def crawl_data(data_dir: str, stores_dir: str) -> tuple[Database, BuildResult]:
    """Main entry point to crawl data and return populated database and errors."""
    crawler = DataCrawler(data_dir, stores_dir)
    return crawler.crawl()
