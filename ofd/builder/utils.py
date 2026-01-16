"""
Utility functions for the Open Filament Database builder.

UUID Generation follows the OFD standard specification:
- UUIDs are derived using UUIDv5 with SHA1 hash (RFC 4122, section 4.3)
- Each entity type has its own namespace UUID
- Derivation uses binary concatenation of parent UUIDs + UTF-8 encoded strings
"""

import hashlib
import re
import uuid
from datetime import datetime, timezone
from typing import Optional, Union


# =============================================================================
# UUID Namespaces (from OPT specification)
# =============================================================================

# Core spec
# https://specs.openprinttag.org/#/nfc_data_format?id=_321-uuid-derivation-algorithm
# Standard namespaces for UUID derivation
NAMESPACE_BRAND = uuid.UUID("5269dfb7-1559-440a-85be-aba5f3eff2d2")
NAMESPACE_MATERIAL = uuid.UUID("616fc86d-7d99-4953-96c7-46d2836b9be9")
NAMESPACE_PACKAGE = uuid.UUID("6f7d485e-db8d-4979-904e-a231cd6602b2")
NAMESPACE_INSTANCE = uuid.UUID("31062f81-b5bd-4f86-a5f8-46367e841508")

# Extended namespaces for entities not in the core spec
# These follow the same pattern but with custom namespaces
NAMESPACE_FILAMENT = uuid.UUID("a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d")
NAMESPACE_VARIANT = uuid.UUID("b2c3d4e5-f6a7-5b6c-9d0e-1f2a3b4c5d6e")
NAMESPACE_SIZE = uuid.UUID("c3d4e5f6-a7b8-6c7d-0e1f-2a3b4c5d6e7f")
NAMESPACE_STORE = uuid.UUID("d4e5f6a7-b8c9-7d8e-1f2a-3b4c5d6e7f8a")
NAMESPACE_PURCHASE_LINK = uuid.UUID("e5f6a7b8-c9d0-8e9f-2a3b-4c5d6e7f8a9b")


# =============================================================================
# Core UUID Generation (OFD Standard)
# =============================================================================

def _derive_uuid(namespace: uuid.UUID, *args: Union[bytes, str, uuid.UUID]) -> uuid.UUID:
    """
    Derive a UUID using the OFD standard algorithm.

    Uses UUIDv5 with SHA1 hash as specified in RFC 4122, section 4.3.

    Args:
        namespace: The namespace UUID for this entity type
        *args: Components to concatenate. Can be:
            - bytes: Used as-is
            - str: Encoded as UTF-8
            - uuid.UUID: Used as bytes (binary form)

    Returns:
        Derived UUID
    """
    # Build the name by concatenating all args
    parts = []
    for arg in args:
        if isinstance(arg, bytes):
            parts.append(arg)
        elif isinstance(arg, uuid.UUID):
            parts.append(arg.bytes)
        elif isinstance(arg, str):
            parts.append(arg.encode("utf-8"))
        else:
            # Convert to string and encode
            parts.append(str(arg).encode("utf-8"))

    name = b"".join(parts)
    # uuid.uuid5 expects a string, but we have bytes from concatenation
    # We need to use the underlying implementation directly
    hash_value = hashlib.sha1(namespace.bytes + name).digest()
    return uuid.UUID(bytes=hash_value[:16], version=5)


def generate_brand_uuid(brand_name: str) -> str:
    """
    Generate a brand UUID according to OFD standard.

    Formula: NAMESPACE_BRAND + brand_name (UTF-8)

    Example:
        >>> generate_brand_uuid("Prusament")
        'ae5ff34e-298e-50c9-8f77-92a97fb30b09'
    """
    return str(_derive_uuid(NAMESPACE_BRAND, brand_name))


def generate_material_uuid(brand_uuid: Union[str, uuid.UUID], material_name: str) -> str:
    """
    Generate a material UUID according to OFD standard.

    Formula: NAMESPACE_MATERIAL + brand_uuid (bytes) + material_name (UTF-8)

    Example:
        >>> brand_uuid = generate_brand_uuid("Prusament")
        >>> generate_material_uuid(brand_uuid, "PLA Prusa Galaxy Black")
        '1aaca54a-431f-5601-adf5-85dd018f487f'
    """
    if isinstance(brand_uuid, str):
        brand_uuid = uuid.UUID(brand_uuid)
    return str(_derive_uuid(NAMESPACE_MATERIAL, brand_uuid, material_name))


def generate_package_uuid(brand_uuid: Union[str, uuid.UUID], gtin: str) -> str:
    """
    Generate a package UUID according to OFD standard.

    Formula: NAMESPACE_PACKAGE + brand_uuid (bytes) + gtin (UTF-8)

    Example:
        >>> brand_uuid = generate_brand_uuid("Prusament")
        >>> generate_package_uuid(brand_uuid, "1234")
        '7ed3ce83-764d-56de-bdcd-dc5226a0efd1'
    """
    if isinstance(brand_uuid, str):
        brand_uuid = uuid.UUID(brand_uuid)
    return str(_derive_uuid(NAMESPACE_PACKAGE, brand_uuid, gtin))


def generate_instance_uuid(nfc_tag_uid: bytes) -> str:
    """
    Generate an instance UUID according to OFD standard.

    Formula: NAMESPACE_INSTANCE + nfc_tag_uid (bytes)

    Note: NFC tag UID must be a bytestream with MSB first.
    For NFCV, the UID MUST be 8 bytes with 0xE0 as the first byte.

    Example:
        >>> nfc_tag_uid = b"\\xE0\\x04\\x01\\x08\\x66\\x2F\\x6F\\xBC"
        >>> generate_instance_uuid(nfc_tag_uid)
        'bf63e92d-9ca5-53d7-9fab-ffdd0240c585'
    """
    return str(_derive_uuid(NAMESPACE_INSTANCE, nfc_tag_uid))


# =============================================================================
# Extended UUID Generation (for database entities)
# =============================================================================

def generate_brand_id(name: str) -> str:
    """Generate a stable ID for a brand using the OFD standard algorithm."""
    return generate_brand_uuid(name)


def generate_material_id(brand_id: str, material: str) -> str:
    """
    Generate a stable ID for a material (at brand level).

    Uses the OFD standard material UUID derivation.
    """
    return generate_material_uuid(brand_id, material)


def generate_filament_id(brand_id: str, material_id: str, filament_name: str) -> str:
    """
    Generate a stable ID for a filament.

    Formula: NAMESPACE_FILAMENT + brand_uuid (bytes) + material_uuid (bytes) + filament_name (UTF-8)
    """
    brand_uuid = uuid.UUID(brand_id)
    material_uuid = uuid.UUID(material_id)
    return str(_derive_uuid(NAMESPACE_FILAMENT, brand_uuid, material_uuid, filament_name))


def generate_variant_id(filament_id: str, color_name: str) -> str:
    """
    Generate a stable ID for a variant.

    Formula: NAMESPACE_VARIANT + filament_uuid (bytes) + color_name (UTF-8)
    """
    filament_uuid = uuid.UUID(filament_id)
    return str(_derive_uuid(NAMESPACE_VARIANT, filament_uuid, color_name))


def generate_size_id(variant_id: str, size_entry: dict, index: int = 0) -> str:
    """
    Generate a stable ID for a size.

    Formula: NAMESPACE_SIZE + variant_uuid (bytes) + identifying components

    The ID is constructed from multiple components to ensure uniqueness even when
    products share the same GTIN/EAN (e.g., spool vs refill variants):
    - variant_id (contains brand, material, filament, and color)
    - weight + diameter
    - gtin/ean if available
    - spool_refill flag if true
    - article_number if available
    - index as last resort
    """
    weight = size_entry.get("filament_weight")
    diameter = size_entry.get("diameter", 1.75)
    variant_uuid = uuid.UUID(variant_id)

    # Build ID components from multiple distinguishing fields
    id_parts = [f"{weight}g", f"{diameter}mm"]

    # Add GTIN/EAN if available (primary product identifier)
    if gtin := size_entry.get("gtin"):
        id_parts.append(f"gtin:{gtin}")
    elif ean := size_entry.get("ean"):
        id_parts.append(f"ean:{ean}")

    # Add spool_refill flag if it's a refill (distinguishes from regular spools)
    if size_entry.get("spool_refill"):
        id_parts.append("refill")

    # Add article_number if available (manufacturer SKU)
    if article_number := size_entry.get("article_number"):
        id_parts.append(f"art:{article_number}")

    # Add index as final disambiguator
    id_parts.append(f"idx:{index}")

    # Join all parts with underscores
    id_str = "_".join(id_parts)
    return str(_derive_uuid(NAMESPACE_SIZE, variant_uuid, id_str))


def generate_store_id(store_slug: str) -> str:
    """
    Generate a stable ID for a store.

    Formula: NAMESPACE_STORE + store_slug (UTF-8)
    """
    return str(_derive_uuid(NAMESPACE_STORE, store_slug))


def generate_purchase_link_id(size_id: str, store_id: str, url: str) -> str:
    """
    Generate a stable ID for a purchase link.

    Formula: NAMESPACE_PURCHASE_LINK + size_uuid (bytes) + store_uuid (bytes) + url (UTF-8)
    """
    size_uuid = uuid.UUID(size_id)
    store_uuid = uuid.UUID(store_id)
    return str(_derive_uuid(NAMESPACE_PURCHASE_LINK, size_uuid, store_uuid, url))


# =============================================================================
# String Utilities
# =============================================================================

def slugify(text: str) -> str:
    """Convert text to a URL-friendly slug."""
    # Convert to lowercase
    text = text.lower()
    # Replace spaces and underscores with hyphens
    text = re.sub(r'[\s_]+', '-', text)
    # Remove non-alphanumeric characters except hyphens
    text = re.sub(r'[^a-z0-9-]', '', text)
    # Remove consecutive hyphens
    text = re.sub(r'-+', '-', text)
    # Strip leading/trailing hyphens
    text = text.strip('-')
    return text


def normalize_color_hex(color: str) -> Optional[str]:
    """Normalize a color value to #RRGGBB format."""
    if not color:
        return None

    # Handle arrays - take first value
    if isinstance(color, list):
        if not color:
            return None
        color = color[0]

    # Remove any whitespace
    color = str(color).strip()

    # If already in correct format, return as-is
    if re.match(r'^#[0-9A-Fa-f]{6}$', color):
        return color.upper()

    # Handle 3-digit hex
    if re.match(r'^#[0-9A-Fa-f]{3}$', color):
        r, g, b = color[1], color[2], color[3]
        return f'#{r}{r}{g}{g}{b}{b}'.upper()

    # Handle hex without #
    if re.match(r'^[0-9A-Fa-f]{6}$', color):
        return f'#{color}'.upper()

    if re.match(r'^[0-9A-Fa-f]{3}$', color):
        r, g, b = color[0], color[1], color[2]
        return f'#{r}{r}{g}{g}{b}{b}'.upper()

    # Return as-is if we can't parse it
    return color


# =============================================================================
# Time Utilities
# =============================================================================

def get_current_timestamp() -> str:
    """Get the current UTC timestamp in ISO 8601 format."""
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


# =============================================================================
# Hash Utilities
# =============================================================================

def calculate_sha256(data: bytes) -> str:
    """Calculate SHA256 hash of data."""
    return hashlib.sha256(data).hexdigest()


def calculate_file_sha256(filepath: str) -> str:
    """Calculate SHA256 hash of a file."""
    with open(filepath, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


# =============================================================================
# Collection Utilities
# =============================================================================

def ensure_list(value) -> list:
    """Ensure a value is a list."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]
