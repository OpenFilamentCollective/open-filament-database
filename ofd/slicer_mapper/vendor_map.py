"""
Brand-to-profile-prefix overrides for cases where the brand name
doesn't match the prefix used in slicer profile names.

Most brands use their name directly (e.g. "SUNLU" → "SUNLU", "Overture" → "Overture").
This map only needs entries where the OFD brand name differs from the profile prefix.
"""

# OFD brand_id → prefix used in slicer profile names
# Only needed when brand_name != profile prefix
BRAND_PREFIX_OVERRIDES: dict[str, str] = {
    "bambu_lab": "Bambu",
    "esun_3d": "eSUN",
}


def get_profile_prefixes(brand_id: str, brand_name: str) -> list[str]:
    """
    Get candidate profile name prefixes for a brand.

    Returns a list of prefixes to try, most specific first.
    For most brands this is just the brand name. For brands with
    known overrides, the override comes first.
    """
    prefixes = []

    # Check override first
    override = BRAND_PREFIX_OVERRIDES.get(brand_id)
    if override:
        prefixes.append(override)

    # Add brand name as-is
    if brand_name and brand_name not in prefixes:
        prefixes.append(brand_name)

    return prefixes
