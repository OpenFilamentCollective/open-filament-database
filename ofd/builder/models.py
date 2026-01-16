"""
Data models for the Open Filament Database.

These dataclasses are aligned with the JSON schemas and represent
the canonical structure of the database entities.
"""

from dataclasses import dataclass, field
from typing import Optional, Any
from enum import Enum


class DocumentType(str, Enum):
    """Document types."""
    TDS = "tds"  # Technical Data Sheet
    SDS = "sds"  # Safety Data Sheet


@dataclass
class SlicerSettings:
    """Slicer-specific settings."""
    profile_name: str
    overrides: Optional[dict[str, Any]] = None


@dataclass
class GenericSlicerSettings:
    """Generic slicer temperature settings."""
    first_layer_bed_temp: Optional[int] = None
    first_layer_nozzle_temp: Optional[int] = None
    bed_temp: Optional[int] = None
    nozzle_temp: Optional[int] = None


@dataclass
class AllSlicerSettings:
    """Container for all slicer settings."""
    prusaslicer: Optional[SlicerSettings] = None
    bambustudio: Optional[SlicerSettings] = None
    orcaslicer: Optional[SlicerSettings] = None
    cura: Optional[SlicerSettings] = None
    generic: Optional[GenericSlicerSettings] = None


@dataclass
class SlicerIds:
    """Slicer identifiers for this filament."""
    prusaslicer: Optional[str] = None
    bambustudio: Optional[str] = None
    orcaslicer: Optional[str] = None
    cura: Optional[str] = None


@dataclass
class ColorStandards:
    """Color standard references."""
    ral: Optional[str] = None
    ncs: Optional[str] = None
    pantone: Optional[str] = None
    bs: Optional[str] = None
    munsell: Optional[str] = None


@dataclass
class VariantTraits:
    """Variant traits/properties."""
    translucent: bool = False
    glow: bool = False
    matte: bool = False
    recycled: bool = False
    recyclable: bool = False
    biodegradable: bool = False


# =============================================================================
# Core Entities
# =============================================================================

@dataclass
class Brand:
    """Filament manufacturer/brand."""
    id: str
    name: str
    slug: str
    directory_name: str  # Original directory name (internal use only)
    website: str
    logo: str
    origin: str  # ISO 3166-1 alpha-2 country code


@dataclass
class Material:
    """Material type configuration at brand level."""
    id: str
    brand_id: str
    material: str  # Material type (PLA, PETG, etc.)
    slug: str  # URL-safe slug (derived from material type)
    default_max_dry_temperature: Optional[int] = None
    default_slicer_settings: Optional[AllSlicerSettings] = None


@dataclass
class Filament:
    """Filament product line (e.g., Prusament PLA)."""
    id: str
    brand_id: str
    material_id: str
    name: str
    slug: str
    material: str  # Material type for convenience
    density: float
    diameter_tolerance: float
    max_dry_temperature: Optional[int] = None
    data_sheet_url: Optional[str] = None
    safety_sheet_url: Optional[str] = None
    discontinued: bool = False
    slicer_ids: Optional[SlicerIds] = None
    slicer_settings: Optional[AllSlicerSettings] = None


@dataclass
class Variant:
    """Color/finish variant of a filament."""
    id: str
    filament_id: str
    slug: str
    color_name: str
    color_hex: str  # Primary hex color
    hex_variants: Optional[list[str]] = None  # Alternative hex codes (NFC, etc.)
    color_standards: Optional[ColorStandards] = None
    traits: Optional[VariantTraits] = None
    discontinued: bool = False


@dataclass
class Size:
    """Individual spool size/SKU."""
    id: str
    variant_id: str
    filament_weight: int  # Weight in grams
    diameter: float  # Filament diameter in mm
    empty_spool_weight: Optional[int] = None
    spool_core_diameter: Optional[float] = None
    gtin: Optional[str] = None  # GTIN-12 or GTIN-13
    article_number: Optional[str] = None
    barcode_identifier: Optional[str] = None
    nfc_identifier: Optional[str] = None
    qr_identifier: Optional[str] = None
    discontinued: bool = False


@dataclass
class Store:
    """Retail store."""
    id: str
    name: str
    slug: str
    directory_name: str  # Original directory name (internal use only)
    storefront_url: str
    logo: str
    ships_from: list[str]  # ISO 3166-1 alpha-2 country codes
    ships_to: list[str]  # ISO 3166-1 alpha-2 country codes


@dataclass
class PurchaseLink:
    """Purchase link for a specific size at a store."""
    id: str
    size_id: str
    store_id: str
    url: str
    spool_refill: bool = False
    ships_from: Optional[list[str]] = None  # Override store ships_from
    ships_to: Optional[list[str]] = None  # Override store ships_to


# =============================================================================
# Database Container
# =============================================================================

@dataclass
class Database:
    """Container for all database entities."""
    brands: list[Brand] = field(default_factory=list)
    materials: list[Material] = field(default_factory=list)
    filaments: list[Filament] = field(default_factory=list)
    variants: list[Variant] = field(default_factory=list)
    sizes: list[Size] = field(default_factory=list)
    stores: list[Store] = field(default_factory=list)
    purchase_links: list[PurchaseLink] = field(default_factory=list)

    def get_brand(self, brand_id: str) -> Optional[Brand]:
        """Get brand by ID."""
        for brand in self.brands:
            if brand.id == brand_id:
                return brand
        return None

    def get_material(self, material_id: str) -> Optional[Material]:
        """Get material by ID."""
        for material in self.materials:
            if material.id == material_id:
                return material
        return None

    def get_filament(self, filament_id: str) -> Optional[Filament]:
        """Get filament by ID."""
        for filament in self.filaments:
            if filament.id == filament_id:
                return filament
        return None

    def get_variant(self, variant_id: str) -> Optional[Variant]:
        """Get variant by ID."""
        for variant in self.variants:
            if variant.id == variant_id:
                return variant
        return None

    def get_size(self, size_id: str) -> Optional[Size]:
        """Get size by ID."""
        for size in self.sizes:
            if size.id == size_id:
                return size
        return None

    def get_store(self, store_id: str) -> Optional[Store]:
        """Get store by ID."""
        for store in self.stores:
            if store.id == store_id:
                return store
        return None
