"""
Data models for the Open Filament Database.

Entities are plain dicts preserving all source JSON fields plus computed
fields (id, slug, foreign keys). No schema-mirroring dataclasses — the
JSON schemas in schemas/ are the single source of truth for field definitions.
"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


class DocumentType(str, Enum):
    """Document types."""
    TDS = "tds"  # Technical Data Sheet
    SDS = "sds"  # Safety Data Sheet


# Entity type constants
ENTITY_TYPES = ("brand", "material", "filament", "variant", "size", "store", "purchase_link")


@dataclass
class Database:
    """Container for all database entities. Each entity is a plain dict."""
    brands: list[dict] = field(default_factory=list)
    materials: list[dict] = field(default_factory=list)
    filaments: list[dict] = field(default_factory=list)
    variants: list[dict] = field(default_factory=list)
    sizes: list[dict] = field(default_factory=list)
    stores: list[dict] = field(default_factory=list)
    purchase_links: list[dict] = field(default_factory=list)

    def get_brand(self, brand_id: str) -> Optional[dict]:
        """Get brand by ID."""
        for brand in self.brands:
            if brand["id"] == brand_id:
                return brand
        return None

    def get_material(self, material_id: str) -> Optional[dict]:
        """Get material by ID."""
        for material in self.materials:
            if material["id"] == material_id:
                return material
        return None

    def get_filament(self, filament_id: str) -> Optional[dict]:
        """Get filament by ID."""
        for filament in self.filaments:
            if filament["id"] == filament_id:
                return filament
        return None

    def get_variant(self, variant_id: str) -> Optional[dict]:
        """Get variant by ID."""
        for variant in self.variants:
            if variant["id"] == variant_id:
                return variant
        return None

    def get_size(self, size_id: str) -> Optional[dict]:
        """Get size by ID."""
        for size in self.sizes:
            if size["id"] == size_id:
                return size
        return None

    def get_store(self, store_id: str) -> Optional[dict]:
        """Get store by ID."""
        for store in self.stores:
            if store["id"] == store_id:
                return store
        return None
