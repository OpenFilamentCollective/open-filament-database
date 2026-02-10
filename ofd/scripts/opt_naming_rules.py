"""Shared OPT naming constants and pure helper functions.

Single source of truth for brand-specific rules, material keywords, color
sets, and common utilities used by the import script.
"""

import re


# ---------------------------------------------------------------------------
# Color / material sets
# ---------------------------------------------------------------------------

KNOWN_COLORS = {
    "black", "white", "red", "blue", "green", "yellow", "orange",
    "purple", "pink", "grey", "gray", "clear", "natural", "gold",
    "silver", "bronze", "copper", "brown", "cyan", "magenta",
    "violet", "teal", "beige", "ivory", "charcoal", "cream",
    "maroon", "navy", "olive", "coral", "salmon", "lime",
    "turquoise", "indigo", "scarlet", "amber",
}

COLOR_MODIFIERS = {
    "neon", "dark", "light", "bright", "galaxy", "matte", "pastel",
    "deep", "pale", "hot", "liquid", "kaoss", "mango", "midnight",
    "cherry", "luminous", "mojito",
    # Additional modifiers for better color recognition in product-line splitting
    "mint", "jet", "sky", "fire", "royal", "ocean", "forest",
    "baby", "wine", "rust", "electric", "ice", "signal", "pearl",
    "brick", "pure",
}

MATERIAL_KEYWORDS = {
    "tpu", "pla", "petg", "abs", "asa", "pa", "pc", "pva", "hips",
    "pctg", "pvdf", "pom", "peek", "pei", "flexible", "speed",
}


# ---------------------------------------------------------------------------
# Brand-specific prefix rules (Categories 2 and 3)
# ---------------------------------------------------------------------------

PREFIX_RULES: dict[str, dict[str, dict[str, str]]] = {
    "matter3d_inc": {
        "basics_series_": {
            "action": "strip",
            "name_pattern": r"^Basics\s+Series\s*[-–—]?\s*",
        },
        "hf_": {
            "action": "strip",
            "name_pattern": r"^HF\s+",
        },
    },
    "printedsolid": {
        "ps_imports_": {
            "action": "strip",
            "name_pattern": r"^PS\s+Imports\s+",
        },
    },
    "smart_materials_3d": {
        "innovatefil_": {
            "action": "strip",
            "name_pattern": r"^Innovatefil\s+",
        },
        "ep_easy_print_": {
            "action": "strip",
            "name_pattern": r"^EP\s+Easy\s+Print\s+",
        },
    },
    "rosa3d_filaments": {
        "pet_g_standard_hs_": {
            "action": "strip",
            "name_pattern": r"^PET[\s_-]*G?\s*Standard\s+HS\s+",
        },
    },
    "amolen": {
        "glow_in_the_dark_": {
            "action": "strip",
            "name_pattern": r"^Glow\s+In\s+The\s+Dark\s+",
        },
    },
    "dremel": {
        "slk_cop_01_": {
            "action": "strip",
            "name_pattern": r"^SLK[\s_-]*COP[\s_-]*01\s*",
        },
        "nav_01_": {
            "action": "strip",
            "name_pattern": r"^NAV[\s_-]*01\s*",
        },
        "bla_01_": {
            "action": "strip",
            "name_pattern": r"^BLA[\s_-]*01\s*",
        },
    },
    "sainsmart": {
        "high_speed_95a_flexible_": {
            "action": "strip",
            "name_pattern": r"^High\s+Speed\s+95A\s+Flexible\s+",
        },
    },
    "sunlu": {
        "petg_glow_in_the_dark_": {
            "action": "strip",
            "name_pattern": r"^PETG\s+Glow\s+In\s+The\s+Dark\s+",
        },
        "pla_glow_in_the_dark_": {
            "action": "strip",
            "name_pattern": r"^PLA\s+Glow\s+In\s+The\s+Dark\s+",
        },
    },
}


# ---------------------------------------------------------------------------
# Product line prefixes (structural reorganization)
# ---------------------------------------------------------------------------

PRODUCT_LINE_PREFIXES: dict[str, list[str]] = {
    "3dxtech": [
        "wearx_wear_resistant_nylon_filament_",
    ],
    "amolen": [
        "galaxy_sparkle_shiny_galaxy_", "90a_flexible_",
    ],
    "bambu_lab": [
        "basic_gradient_", "basic_",
        "marble_", "metal_", "sparkle_",
        "galaxy_", "wood_",
        "hf_", "translucent_",
    ],
    "ataraxia_art": [
        "flexible_89a_",
    ],
    "dremel": [
        "digilab_eco_", "digilab_", "df",
    ],
    "eolas_prints": [
        "ingeo_850_", "ingeo_870_",
    ],
    "extrudr": [
        "durapro_cf_", "durapro_",
        "biofusion_", "greentec_", "nx2_matt_",
        "basic_cmyk_litho", "basic_",
        "flax_", "pearl_", "wood_",
        "flex_hard_cf_", "flex_hard_", "flex_medium_", "flex_semisoft_",
    ],
    "fiberthree": [
        "f3_pa_gf30_", "f3_pa_gf_", "f3_pa_cf_lite_", "f3_pa_pure_lite_",
        "f3_pa_cf_", "f3_pa_esd_", "f3_pa_ortho_", "f3_pa_pure_",
        "f3_cf_150_", "f3_gf_25_", "f3_gf_",
        "f3_80a_", "f3_98a_",
    ],
    "flashforge": [
        "chameleon_", "d_series_", "rapid_",
    ],
    "matter3d_inc": [
        "performance_",
    ],
    "overture": [
        "professional_", "turbo_rapid_", "easy_glow_",
        "rock_", "easy_", "air_", "cream_", "super_",
    ],
    "polar_filament": [
        "biodegradable_flexible_95a_soft_",
    ],
    "polymaker": [
        "creator_special_edition_", "for_production_",
        "panchroma_", "polysmooth_", "polysonic_",
        "polylite_", "polycast_", "polywood_", "polymax_",
    ],
    "primacreator": [
        "primaselect_", "primavalue_", "easyprint_",
    ],
    "printedsolid": [
        "jessie_premium_",
    ],
    "recreus": [
        "conductive_filaflex_", "balena_filaflex_", "filaflex_",
    ],
    "rosa3d_filaments": [
        "impact_abrasive_uv_h2o_microbe_resistant_",
        "pet_g_structure_hs_", "pet_g_galaxy_hs_", "pet_g_hs_",
        "rosa_flex_",
    ],
    "sainsmart": [
        "temperature_sensitive_flexible_95a_",
        "flexible_95a_", "flexible_87a_", "gt_3_",
    ],
    "sunlu": [
        "luminous_glow_in_the_dark_",
    ],
}


# ---------------------------------------------------------------------------
# Product line SKU patterns
# ---------------------------------------------------------------------------

PRODUCT_LINE_SKU_PATTERNS: dict[str, str] = {
    "dremel": r"^(?:[a-z]+_)*(?:\d+_)+",
}


# ---------------------------------------------------------------------------
# Product line suffixes (structural reorganization)
# ---------------------------------------------------------------------------

PRODUCT_LINE_SUFFIXES: dict[str, list[str]] = {
    "coex_3d": [
        "_coexflex_60a", "_coexflex_60d", "_coexflex_40d", "_coexflex_30d",
    ],
    "sainsmart": ["_92a_flexible"],
    "zyltech": ["_texas_twister_series_multi_color"],
    "matterhackers": ["_mh_build_series_flexible"],
}


# ---------------------------------------------------------------------------
# Suffix strip rules
# ---------------------------------------------------------------------------

SUFFIX_STRIP_RULES: dict[str, dict[str, dict[str, str]]] = {
    "zyltech": {
        "_new_made_in_usa_premium_composite": {
            "action": "strip",
            "name_pattern": r"\s*New\s+Made\s+In\s+Usa\s+Premium\s+Composite$",
        },
    },
    "matterhackers": {
        "_series_thermoplastic_polyurethane": {
            "action": "strip",
            "name_pattern": r"\s*Series\s+Thermoplastic\s+Polyurethane$",
        },
    },
}


# ---------------------------------------------------------------------------
# Technical spec patterns (Category 4)
# ---------------------------------------------------------------------------

TECH_SPEC_PATTERNS = [
    r"^\d+$",                     # bare number (e.g. RAL code "7016")
    r"hytrel_",                   # DuPont product codes
    r"coexflex_",                 # Coex product codes
    r"ingeo_\d+",                 # NatureWorks grade codes
    r"\d+a_flexible",             # hardness specs like "87a_flexible"
    r"flexible_\d+a_",            # hardness specs like "flexible_95a_"
    r"gt_\d+_high_speed_\d+a_",   # SainSmart GT model codes
]


# ---------------------------------------------------------------------------
# Max variant length
# ---------------------------------------------------------------------------

MAX_VARIANT_LENGTH = 40


# ---------------------------------------------------------------------------
# Material keywords that should be UPPERCASED in display names
# ---------------------------------------------------------------------------

_MATERIAL_UPPER = {
    "pla", "petg", "abs", "asa", "tpu", "tpe", "pa", "pa6", "pa12",
    "pc", "pva", "hips", "pctg", "pvdf", "pom", "peek", "pei", "pet",
    "pps", "ppa", "pvb", "pbt", "cf", "gf", "ht", "uv", "hs",
}


# ---------------------------------------------------------------------------
# MOVE_RULES — brand-specific variant-move rules
# ---------------------------------------------------------------------------

# brand -> material -> source_filament -> list of (id_prefix, target_filament, target_display_name, name_prefixes)
# Prefixes within each source_filament are ordered longest-first for correct matching.
MOVE_RULES: dict[str, dict[str, dict[str, list[tuple[str, str, str, list[str]]]]]] = {
    "3djake": {
        "PETG": {
            "petg": [
                ("easy_", "easy_petg", "easy PETG", ['easy ']),
            ],
        },
        "PLA": {
            "glow_pla": [
                ("eco_", "eco_glow_pla", "eco Glow PLA", ['eco ']),
            ],
            "matte_pla": [
                ("eco_", "eco_matte_pla", "eco Matte PLA", ['eco ']),
            ],
            "pla": [
                ("mystery_", "mystery_pla", "mystery PLA", ['mystery ']),
                ("magic_", "magic_pla", "magic PLA", ['magic ']),
                ("eco_", "eco_pla", "eco PLA", ['eco ']),
            ],
            "silk_pla": [
                ("eco_", "eco_silk_pla", "eco Silk PLA", ['eco ']),
            ],
        },
    },
    "3dpower": {
        "PA6": {
            "pa6": [
                ("hyper_", "hyper_pa6", "Hyper PA6", ['Hyper  ', 'Hyper ']),
            ],
        },
        "PETG": {
            "petg": [
                ("hyper_speed_pet_g_", "hyper_speed_petg", "Hyper Speed PETG", ['Hyper Speed PET-G ']),
                ("basic_pet_g_", "basic_petg", "Basic PETG", ['Basic PET-G ']),
                ("select_", "select_petg", "Select PETG", ['Select  ', 'Select ']),
            ],
        },
        "PLA": {
            "pla": [
                ("hyper_speed_", "hyper_speed_pla", "Hyper Speed PLA", ['Hyper Speed  ', 'Hyper Speed ']),
                ("ht_150_", "ht_150_pla", "HT 150 PLA", ['HT 150 ']),
                ("select_", "select_pla", "Select PLA", ['Select  ', 'Select ']),
                ("pastel_", "pastel_pla", "Pastel PLA", ['Pastel ']),
                ("marble_", "marble_pla", "Marble PLA", ['Marble ']),
                ("basic_", "basic_pla", "Basic PLA", ['Basic  ', 'Basic ']),
            ],
        },
    },
    "3dxtech": {
        "ABS": {
            "abs": [
                ("3dxmax_", "3dxmax", "3DXMax", ['3DXMax  ', '3DXMax ']),
                ("3dxstat_esd_", "3dxstat_esd", "3DXStat ESD", ['3DXStat ESD  ', '3DXStat ESD ']),
                ("3dxtech_", "3dxtech", "3DXTech", ['3DXTech  ', '3DXTech ']),
            ],
        },
        "ASA": {
            "3dxmax_asa": [
                ("", "3dxmax", "3DXMax", []),
            ],
        },
        "HIPS": {
            "3dxmax_hips": [
                ("", "3dxmax", "3DXMax", []),
            ],
        },
        "PA12": {
            "pa12": [
                ("3dxstat_esd_", "3dxstat_esd", "3DXStat ESD", ['3DXStat ESD  ', '3DXStat ESD ']),
            ],
        },
        "PC": {
            "pc": [
                ("3dxmax_", "3dxmax", "3DXMax", ['3DXMax  ', '3DXMax ']),
                ("3dxstat_esd_", "3dxstat_esd", "3DXStat ESD", ['3DXStat ESD  ', '3DXStat ESD ']),
            ],
        },
        "PEI": {
            "pei": [
                ("3dxstat_esd_ultem_", "3dxstat_esd", "3DXStat ESD", ['3DXStat ESD Ultem  ', '3DXStat ESD Ultem ']),
                ("thermax_", "thermax_pei", "ThermaX PEI", ['ThermaX  ', 'ThermaX ']),
            ],
        },
        "PEKK": {
            "pekk": [
                ("3dxstat_esd_", "3dxstat_esd", "3DXStat ESD", ['3DXStat ESD  ', '3DXStat ESD ']),
            ],
        },
        "PETG": {
            "petg": [
                ("3dxstat_emi_", "3dxstat_emi", "3DXStat EMI", ['3DXStat EMI  ', '3DXStat EMI ']),
                ("3dxstat_esd_", "3dxstat_esd", "3DXStat ESD", ['3DXStat ESD  ', '3DXStat ESD ']),
            ],
        },
        "PLA": {
            "pla": [
                ("3dxstat_esd_", "3dxstat_esd", "3DXStat ESD", ['3DXStat ESD  ', '3DXStat ESD ']),
                ("economy_", "economy_pla", "Economy PLA", ['Economy  - ', 'Economy  ', 'Economy ']),
                ("ecomax_", "ecomax_pla", "EcoMax PLA", ['ECOMAX   ', 'ECOMAX  ', 'ECOMAX ', 'Ecomax ']),
            ],
        },
        "TPU": {
            "tpu": [
                ("3dxstat_esd_", "3dxstat_esd", "3DXStat ESD", ['3DXStat ESD  ', '3DXStat ESD ']),
                ("3dxflex_gf30_", "3dxflex_gf30", "3DXFlex GF30", ['3DXFlex GF30 ']),
                ("3dxflex_", "3dxflex", "3DXFlex", ['3DXFlex  ', '3DXFlex ']),
            ],
        },
    },
    "add_north": {
        "PLA": {
            "pla": [
                ("economy_", "economy_pla", "Economy PLA", ['Economy ']),
                ("wood_", "wood_pla", "Wood PLA", ['Wood ']),
                ("e_", "e_pla", "E PLA", ['E- ']),
                ("x_", "x_pla", "X PLA", ['X- ']),
            ],
        },
    },
    "amolen": {
        "PLA": {
            "matte_pla": [
                ("triple_color_", "triple_color_matte_pla", "Triple Color Matte PLA", ['Triple Color ', 'Triple ']),
                ("dual_color_", "dual_color_matte_pla", "Dual Color Matte PLA", ['Dual Color ']),
                ("basic_", "basic_matte_pla", "Basic Matte PLA", ['Basic ']),
            ],
            "pla": [
                ("temperature_color_change_", "temperature_color_change_pla", "Temperature Color Change PLA", ['Temperature Color Change ']),
                ("crystal_transparent_", "crystal_transparent_pla", "Crystal Transparent PLA", ['Crystal-Transparent ', 'Crystal Transparent ']),
                ("uv_color_change_", "uv_color_change_pla", "UV Color Change PLA", ['UV Color Change ']),
                ("transparent_", "transparent_pla", "Transparent PLA", ['Transparent ']),
                ("marble_", "marble_pla", "Marble PLA", ['Marble ']),
                ("wood_", "wood_pla", "Wood PLA", ['Wood ']),
            ],
            "silk_pla": [
                ("shiny_gradient_", "shiny_gradient_silk_pla", "Shiny Gradient Silk PLA", ['Shiny Gradient ']),
                ("shiny_glitter_", "shiny_glitter_silk_pla", "Shiny Glitter Silk PLA", ['Shiny Glitter ']),
                ("triple_color_", "triple_color_silk_pla", "Triple Color Silk PLA", ['Triple Color ']),
                ("dual_color_", "dual_color_silk_pla", "Dual Color Silk PLA", ['Dual Color ']),
                ("s_series_", "s_series_silk_pla", "S-Series Silk PLA", ['S-Series ']),
                ("rainbow_", "rainbow_silk_pla", "Rainbow Silk PLA", ['Rainbow ']),
                ("basic_", "basic_silk_pla", "Basic Silk PLA", ['Basic ']),
            ],
        },
    },
    "aurapol": {
        "PETG": {
            "petg": [
                ("pet_g_army_", "army_petg", "ARMY PETG", ['PET-G ARMY ']),
                ("pet_g_", "petg", "PETG", ['PET-G ']),
            ],
        },
        "PLA": {
            "pla": [
                ("metallic_", "metallic_pla", "Metallic PLA", ['Metallic ']),
                ("l_ego_", "l_ego_pla", "L-EGO PLA", ['L-EGO ']),
                ("wood_", "wood_pla", "Wood PLA", ['Wood ']),
            ],
        },
    },
    "bambu_lab": {
        "PETG": {
            "petg": [
                ("hf_", "hf", "HF", ['HF ']),
                ("translucent_", "translucent", "Translucent", ['Translucent ']),
            ],
        },
        "PLA": {
            "pla": [
                ("basic_gradient_", "basic_gradient", "Basic Gradient", ['Basic Gradient ']),
                ("basic_", "basic", "Basic", ['Basic ']),
                ("marble_", "marble", "Marble", ['Marble ']),
                ("metal_", "metal", "Metal", ['Metal ']),
                ("sparkle_", "sparkle", "Sparkle", ['Sparkle ']),
                ("galaxy_", "galaxy", "Galaxy", ['Galaxy ']),
            ],
            "matte_pla": [
                ("wood_", "wood", "Wood", ['Wood ']),
            ],
            "silk_pla": [
                ("dual_color_", "silk_dual_color", "Silk Dual Color", ['Dual Color ']),
                ("metal_", "metal", "Metal", ['Metal ']),
            ],
        },
        "TPU": {
            "tpu": [
                ("95a_hf_", "95a_hf", "95A HF", ['95A HF ']),
                ("for_ams_", "for_ams", "For AMS", ['For AMS ']),
            ],
        },
    },
    "colorfabb": {
        "PLA": {
            "pla": [
                ("stonefill_", "stonefill_pla", "StoneFill PLA", ['stoneFill ', 'StoneFill ', 'Stonefill ']),
                ("economy_", "economy_pla", "Economy PLA", ['Economy ']),
                ("r_semi_", "r_semi_pla", "r-Semi PLA", ['r-Semi--', 'r-Semi-', 'r-Semi ']),
                ("lw_ht_", "lw_ht_pla", "LW-HT PLA", ['LW--HT ', 'LW-HT ']),
                ("semi_", "semi_pla", "Semi PLA", ['Semi- ', 'Semi ']),
                ("pha_", "pha_pla", "PHA PLA", ['/PHA ', 'PHA ']),
            ],
        },
    },
    "devil_design": {
        "PA12": {
            "pa12": [
                ("nylon_", "pa12", "PA12", ['NYLON  ', 'NYLON ']),
            ],
        },
        "PETG": {
            "petg": [
                ("galaxy_", "galaxy_petg", "Galaxy PETG", ['Galaxy ']),
            ],
        },
    },
    "das_filament": {
        "TPU": {
            "v2_flexibel_tpu": [
                ("", "v2_flexibel", "V2 Flexibel", []),
            ],
        },
    },
    "econofil": {
        "PETG": {
            "standard_petg": [
                ("", "petg", "PETG", ['Standard ']),
            ],
        },
        "PLA": {
            "standard_matte_pla": [
                ("", "matte_pla", "Matte PLA", ['Standard ']),
            ],
            "pla": [
                ("standard_", "standard_pla", "Standard PLA", ['Standard  ', 'Standard ']),
            ],
        },
    },
    "eolas_prints": {
        "TPU": {
            "tpu": [
                ("flex_d60_uv_resistant_", "flex_d60_uv_resistant_tpu", "Flex D60 UV Resistant TPU", ['Flex D60 UV Resistant ']),
                ("flex_93a_", "flex_93a_tpu", "Flex 93A TPU", ['Flex 93A ']),
                ("flex_d53_", "flex_d53_tpu", "Flex D53 TPU", ['Flex D53 ']),
            ],
        },
    },
    "epax": {
        "PETG": {
            "fast_high_speed_petg": [
                ("", "high_speed_petg", "High Speed PETG", ['Fast ']),
            ],
        },
        "PLA": {
            "fast_luminous_high_speed_glow_pla": [
                ("", "luminous_high_speed_glow_pla", "Luminous High Speed Glow PLA", ['Fast ']),
            ],
            "high_speed_pla": [
                ("fast_", "high_speed_pla", "High Speed PLA", ['Fast + ', 'Fast ']),
            ],
            "silk_pla": [
                ("magic_", "silk_pla", "Silk PLA", ['Magic   ', 'Magic  ', 'Magic ']),
            ],
        },
    },
    "esun_3d": {
        "PLA": {
            "pla": [
                ("lithophane_cmyk_", "lithophane_cmyk_pla", "Lithophane CMYK PLA", ['Lithophane + CMYK ', 'Lithophane CMYK ']),
                ("chameleon_", "chameleon_pla", "Chameleon PLA", ['Chameleon  ', 'Chameleon ']),
                ("basic_", "basic_pla", "Basic PLA", ['Basic ']),
                ("super_", "super_pla", "Super PLA", ['Super   ', 'Super  ', 'Super ']),
                ("peak_", "peak_pla", "Peak PLA", ['Peak ']),
                ("plus_", "plus_pla", "Plus PLA", ['Plus ']),
            ],
            "silk_pla": [
                ("rainbow_", "rainbow_silk_pla", "Rainbow Silk PLA", ['Rainbow  ', 'Rainbow ']),
                ("mystic_", "mystic_silk_pla", "Mystic Silk PLA", ['Mystic  ', 'Mystic ']),
                ("magic_", "magic_silk_pla", "Magic Silk PLA", ['Magic  ', 'Magic ']),
                ("metal_", "metal_silk_pla", "Metal Silk PLA", ['Metal  ', 'Metal ']),
                ("candy_", "candy_silk_pla", "Candy Silk PLA", ['Candy  ', 'Candy ']),
            ],
        },
    },
    "eumakers": {
        "PLA": {
            "pla": [
                ("silver_glitter_on_", "silver_glitter_pla", "Silver Glitter PLA", ['Silver Glitter on ']),
                ("fluorescent_", "fluorescent_pla", "Fluorescent PLA", ['Fluorescent ']),
                ("iridescent_", "iridescent_pla", "Iridescent PLA", ['Iridescent ']),
                ("metallic_", "metallic_pla", "Metallic PLA", ['Metallic ']),
                ("pearl_", "pearl_pla", "Pearl PLA", ['Pearl ']),
            ],
            "silk_pla": [
                ("glossy_", "silk_pla", "Silk PLA", ['Glossy ']),
            ],
        },
    },
    "extrudr": {
        "PA12": {
            "cf_pa12": [
                ("durapro_cf_", "durapro_cf_pa12", "DuraPro CF PA12", ['DuraPro CF ']),
            ],
        },
        "PLA": {
            "pla": [
                ("biofusion_", "biofusion_pla", "BioFusion PLA", ['BioFusion ']),
                ("greentec_", "greentec_pla", "GreenTEC PLA", ['GreenTEC ']),
                ("basic_cmyk_litho", "basic_pla", "Basic PLA", ['Basic CMYK Litho']),
                ("basic_", "basic_pla", "Basic PLA", ['Basic ']),
                ("flax_", "flax_pla", "Flax PLA", ['Flax ']),
                ("pearl_", "pearl_pla", "Pearl PLA", ['Pearl ']),
                ("wood_", "wood_pla", "Wood PLA", ['Wood ']),
            ],
            "matte_pla": [
                ("greentec_", "greentec_matte_pla", "GreenTEC Matte PLA", ['GreenTEC ']),
                ("nx2_matt_", "nx2_matt", "NX2 Matt", ['NX2 Matt ', 'NX2 Matt']),
            ],
        },
        "TPU": {
            "cf_tpu": [
                ("flex_hard_cf_", "flex_hard_cf_tpu", "Flex Hard CF TPU", ['Flex Hard CF ']),
            ],
            "flex_tpu": [
                ("hard_", "flex_hard_tpu", "Flex Hard TPU", ['Hard ']),
                ("medium_", "flex_medium_tpu", "Flex Medium TPU", ['Medium ']),
                ("semisoft_", "flex_semisoft_tpu", "Flex Semisoft TPU", ['Semisoft ']),
            ],
        },
    },
    "fiberlogy": {
        "PETG": {
            "petg": [
                ("easy_pet_g_", "easy_petg", "Easy PETG", ['Easy PET-G ']),
                ("pet_g_v0_", "pet_g_v0_petg", "PET-G V0 PETG", ['PET-G V0 ']),
            ],
        },
        "PLA": {
            "pla": [
                ("fibersatin_", "fibersatin_pla", "FiberSatin PLA", ['FiberSatin ']),
                ("fiberwood_", "fiberwood_pla", "FiberWood PLA", ['FiberWood ']),
                ("mineral_", "mineral_pla", "Mineral PLA", ['Mineral ']),
                ("impact_", "impact_pla", "Impact PLA", ['Impact  ', 'Impact ']),
                ("easy_", "easy_pla", "Easy PLA", ['Easy  ', 'Easy ']),
            ],
        },
        "TPU": {
            "tpu": [
                ("fiberflex_40d_", "fiberflex_40d_tpu", "FiberFlex 40D TPU", ['FiberFlex 40D ']),
                ("fiberflex_30d_", "fiberflex_30d_tpu", "FiberFlex 30D TPU", ['FiberFlex 30D ']),
            ],
        },
    },
    "fiberthree": {
        "PA6": {
            "f3_pa_gf_pa6": [
                ("gf30_", "f3_pa_gf30", "F3 PA GF30", ['GF30 ']),
                ("gf", "f3_pa_gf", "F3 PA GF", ['GF']),
            ],
            "f3_pa_pa6": [
                ("esd", "f3_pa_esd", "F3 PA ESD", ['ESD']),
                ("ortho", "f3_pa_ortho", "F3 PA Ortho", ['Ortho']),
                ("pure", "f3_pa_pure", "F3 PA Pure", ['Pure']),
            ],
        },
        "TPU": {
            "f3_tpu": [
                ("80a_", "f3_80a", "F3 80A", ['80A ']),
                ("98a_", "f3_98a", "F3 98A", ['98A ']),
            ],
        },
    },
    "filamentpm": {
        "TPE": {
            "tpe": [
                ("32_rubberjet_flex_", "32_rubberjet_flex", "32 Rubberjet Flex", ['32 Rubberjet Flex ']),
                ("88_rubberjet_flex_", "88_rubberjet_flex", "88 Rubberjet Flex", ['88 Rubberjet Flex ']),
            ],
        },
        "TPU": {
            "96_tpu": [
                ("", "96", "96", []),
            ],
        },
        "PLA": {
            "pla": [
                ("pastel_edition_", "pastel_edition_pla", "Pastel Edition PLA", ['pastel edition - ', 'Pastel edition - ', 'Pastel Edition - ']),
                ("crystal_clear_", "crystal_clear_pla", "Crystal Clear PLA", ['Crystal Clear ']),
                ("skin_edition_", "skin_edition_pla", "Skin Edition PLA", ['Skin edition - ', 'skin edition - ']),
                ("army_edition_", "army_edition_pla", "Army Edition PLA", ['Army edition - ', 'army edition - ', 'Army Edition - ']),
                ("timberfill_", "timberfill_pla", "Timberfill PLA", ['Timberfill\u00ae ', 'Timberfill ']),
                ("extrafill_", "extrafill_pla", "Extrafill PLA", ['Extrafill ']),
                ("marblejet_", "marblejet_pla", "MarbleJet PLA", ['MarbleJet - ', 'MarbleJet ']),
                ("pearl_", "pearl_pla", "Pearl PLA", ['Pearl ']),
            ],
        },
    },
    "flashforge": {
        "PLA": {
            "chameleon_pla": [
                ("gradient_rapid_", "gradient_rapid_chameleon_pla", "Gradient Rapid Chameleon PLA", ['Gradient Rapid ']),
                ("rapid_", "rapid_chameleon_pla", "Rapid Chameleon PLA", ['Rapid ']),
            ],
        },
    },
    "filamentree": {
        "PLA": {
            "pla": [
                ("blaster_", "blaster_pla", "Blaster PLA", ['Blaster ']),
                ("plus_", "plus_pla", "Plus PLA", ['Plus ']),
            ],
        },
    },
    "formfutura": {
        "ABS": {
            "abs": [
                ("flame_retardant_", "flame_retardant_abs", "Flame Retardant ABS", ['Flame Retardant ']),
                ("reform_rtitan_", "reform_rtitan_abs", "ReForm rTitan ABS", ['ReForm \u2013 rTitan ', 'ReForm - rTitan ', 'ReForm rTitan ']),
                ("easyfil_", "easyfil_abs", "EasyFil ABS", ['EasyFil  ', 'EasyFil ']),
                ("titanx_", "titanx_abs", "TitanX ABS", ['TitanX ']),
            ],
        },
        "PET": {
            "pet": [
                ("high_precision_", "high_precision_pet", "High Precision PET", ['High Precision  ', 'High Precision ']),
                ("reform_r_", "reform_r_pet", "ReForm r PET", ['ReForm \u2013 r ', 'ReForm - r ', 'ReForm r ']),
            ],
        },
        "PLA": {
            "matte_pla": [
                ("easyfil_e_matt_", "easyfil_e_matte_pla", "EasyFil e Matte PLA", ['EasyFil e Matt ']),
                ("volcano_", "volcano_matte_pla", "Volcano Matte PLA", ['Volcano  ', 'Volcano ']),
            ],
            "pla": [
                ("high_precision_", "high_precision_pla", "High Precision PLA", ['High Precision  ', 'High Precision ']),
                ("easyfil_e_", "easyfil_e_pla", "EasyFil e PLA", ['EasyFil e ']),
                ("reform_r_", "reform_r_pla", "ReForm r PLA", ['ReForm \u2013 r ', 'ReForm - r ', 'ReForm r ']),
                ("easywood_", "easywood_pla", "EasyWood PLA", ['EasyWood ']),
                ("stonefil_", "stonefil_pla", "StoneFil PLA", ['StoneFil ']),
                ("metalfil_", "metalfil_pla", "MetalFil PLA", ['MetalFil \u2013 ', 'MetalFil - ', 'MetalFil ']),
                ("easyfil_", "easyfil_pla", "EasyFil PLA", ['EasyFil  ', 'EasyFil ']),
                ("premium_", "premium_pla", "Premium PLA", ['Premium  ', 'Premium ']),
                ("galaxy_", "galaxy_pla", "Galaxy PLA", ['Galaxy  ', 'Galaxy ']),
            ],
        },
    },
    "francofil": {
        "TPU": {
            "tpu": [
                ("95a_", "95a_tpu", "95A TPU", ['95A ']),
                ("98a_", "98a_tpu", "98A TPU", ['98A ']),
            ],
        },
    },
    "gizmo_dorks": {
        "ABS": {
            "abs": [
                ("thermochromic_", "thermochromic_abs", "Thermochromic ABS", ['Thermochromic ']),
                ("color_change_", "color_change_abs", "Color Change ABS", ['Color Change ']),
                ("fluorescent_", "fluorescent_abs", "Fluorescent ABS", ['Fluorescent ']),
                ("low_odor_", "low_odor_abs", "Low Odor ABS", ['Low Odor  ', 'Low Odor ']),
            ],
        },
        "PC": {
            "pc": [
                ("polycarbonate_", "pc", "PC", ['Polycarbonate ']),
            ],
        },
        "PLA": {
            "pla": [
                ("glitter_sparkle_", "glitter_sparkle_pla", "Glitter Sparkle PLA", ['Glitter Sparkle  ', 'Glitter Sparkle ']),
                ("thermochromic_", "thermochromic_pla", "Thermochromic PLA", ['Thermochromic ']),
                ("color_change_", "color_change_pla", "Color Change PLA", ['Color Change ']),
                ("fluorescent_", "fluorescent_pla", "Fluorescent PLA", ['Fluorescent ']),
            ],
        },
        "TPU": {
            "tpu": [
                ("flexible_", "tpu", "TPU", ['Flexible  ', 'Flexible ']),
            ],
        },
    },
    "matter3d_inc": {
        "PETG": {
            "carbon_fiber_high_speed_cf_petg": [
                ("", "high_speed_cf_petg", "High Speed CF PETG", ['Carbon Fiber ']),
            ],
        },
    },
    "hatchbox": {
        "PLA": {
            "pla": [
                ("uv_color_changing_", "uv_color_changing_pla", "UV Color Changing PLA", ['UV Color Changing ']),
                ("metallic_finish_", "metallic_finish_pla", "Metallic Finish PLA", ['Metallic Finish ']),
                ("transparent_", "transparent_pla", "Transparent PLA", ['Transparent ']),
                ("wood_", "wood_pla", "Wood PLA", ['Wood ']),
            ],
        },
    },
    "ninjatek": {
        "TPU": {
            "tpu": [
                ("ninjatek_chinchilla_", "chinchilla_tpu", "Chinchilla TPU", ['NinjaTek Chinchilla - ', 'NinjaTek Chinchilla ']),
                ("ninjatek_ninjaflex_", "ninjaflex_tpu", "NinjaFlex TPU", ['NinjaTek NinjaFlex - ', 'NinjaTek NinjaFlex ']),
                ("tpe_ninjatek_edge_", "edge_tpu", "Edge TPU", ['TPE NinjaTek Edge - ', 'TPE NinjaTek Edge ']),
                ("ninjatek_cheetah_", "cheetah_tpu", "Cheetah TPU", ['NinjaTek Cheetah - ', 'NinjaTek Cheetah ']),
            ],
        },
    },
    "overture": {
        "PC": {
            "professional_pc": [
                ("", "professional", "Professional", ['Professional ']),
            ],
        },
    },
    "nobufil": {
        "ABS": {
            "abs": [
                ("x_industrial_", "x_industrial_abs", "X Industrial ABS", ['x Industrial ']),
                ("x_astro_", "x_astro_abs", "X Astro ABS", ['x Astro ']),
                ("x_candy_", "x_candy_abs", "X Candy ABS", ['x Candy ']),
                ("x_neon_", "x_neon_abs", "X Neon ABS", ['x Neon ']),
            ],
        },
    },
    "polymaker": {
        "PLA": {
            "panchroma_matte_pla": [
                ("gradient_", "gradient_panchroma_matte_pla", "Gradient Panchroma Matte PLA", ['Gradient ']),
                ("pastel_", "pastel_panchroma_matte_pla", "Pastel Panchroma Matte PLA", ['Pastel ']),
                ("muted_", "muted_panchroma_matte_pla", "Muted Panchroma Matte PLA", ['Muted ']),
                ("army_", "army_panchroma_matte_pla", "Army Panchroma Matte PLA", ['Army ']),
                ("dual_", "dual_panchroma_matte_pla", "Dual Panchroma Matte PLA", ['Dual ']),
            ],
            "panchroma_pla": [
                ("translucent_", "translucent_panchroma_pla", "Translucent Panchroma PLA", ['Translucent ']),
                ("temp_shift_", "temp_shift_panchroma_pla", "Temp Shift Panchroma PLA", ['Temp Shift ']),
                ("starlight_", "starlight_panchroma_pla", "Starlight Panchroma PLA", ['Starlight ']),
                ("celestial_", "celestial_panchroma_pla", "Celestial Panchroma PLA", ['Celestial ']),
                ("metallic_", "metallic_panchroma_pla", "Metallic Panchroma PLA", ['Metallic ']),
                ("gradient_", "gradient_panchroma_pla", "Gradient Panchroma PLA", ['Gradient ']),
                ("marble_", "marble_panchroma_pla", "Marble Panchroma PLA", ['Marble ']),
                ("galaxy_", "galaxy_panchroma_pla", "Galaxy Panchroma PLA", ['Galaxy ']),
                ("satin_", "satin_panchroma_pla", "Satin Panchroma PLA", ['Satin ']),
                ("neon_", "neon_panchroma_pla", "Neon Panchroma PLA", ['Neon ']),
            ],
            "polylite_pla": [
                ("metallic_", "metallic_polylite_pla", "Metallic PolyLite PLA", ['Metallic ']),
                ("lw_", "lw_polylite_pla", "LW PolyLite PLA", ['Lw ']),
            ],
        },
    },
    "primacreator": {
        "PLA": {
            "primaselect_pla": [
                ("flame_retardant_", "flame_retardant_primaselect_pla", "Flame Retardant PrimaSelect PLA", ['Flame Retardant ']),
                ("metal_shine_", "metal_shine_primaselect_pla", "Metal Shine PrimaSelect PLA", ['Metal Shine ']),
                ("gradient_", "gradient_primaselect_pla", "Gradient PrimaSelect PLA", ['Gradient ']),
                ("sparkle_", "sparkle_primaselect_pla", "Sparkle PrimaSelect PLA", ['Sparkle ']),
                ("pastel_", "pastel_primaselect_pla", "Pastel PrimaSelect PLA", ['Pastel ']),
                ("marble_", "marble_primaselect_pla", "Marble PrimaSelect PLA", ['Marble ']),
                ("satin_", "satin_primaselect_pla", "Satin PrimaSelect PLA", ['Satin ']),
            ],
        },
    },
    "print_with_smile": {
        "PETG": {
            "petg": [
                ("bicolor_metallic_pet_g_", "bicolor_metallic_petg", "Bicolor Metallic PETG", ['BICOLOR METALLIC PET-G ']),
                ("re_", "re_petg", "RE PETG", ['RE- ']),
            ],
        },
    },
    "printedsolid": {
        "PLA": {
            "silk_pla": [
                ("tricolor_magic_", "tricolor_magic_silk_pla", "TriColor Magic Silk PLA", ['TriColor  Magic-', 'TriColor Magic-', 'Tricolor  Magic-', 'Tricolor Magic-']),
                ("shiny_gradient_", "shiny_gradient_silk_pla", "Shiny Gradient Silk PLA", ['Shiny Gradient-', 'Shiny Gradient ']),
                ("bicolor_magic_", "bicolor_magic_silk_pla", "Bicolor Magic Silk PLA", ['Bicolor  Magic-', 'Bicolor  Magic ', 'Bicolor Magic-', 'Bicolor Magic ']),
                ("gradient_", "gradient_silk_pla", "Gradient Silk PLA", ['Gradient-', 'Gradient ']),
                ("rainbow_", "rainbow_silk_pla", "Rainbow Silk PLA", ['Rainbow-', 'Rainbow ']),
            ],
        },
    },
    "protopasta": {
        "PLA": {
            "matte_pla": [
                ("fiber_ht_", "fiber_ht_matte_pla", "Fiber HT Matte PLA", ['Fiber HT - ', 'Fiber HT ']),
            ],
            "pla": [
                ("still_colorful_recycled_", "still_colorful_recycled_pla", "Still Colorful Recycled PLA", ['Still Colorful Recycled  ', 'Still Colorful Recycled ']),
                ("nebula_", "nebula_pla", "Nebula PLA", ['Nebula ']),
            ],
        },
    },
    "recreus": {
        "PP": {
            "3d_pp": [
                ("", "3d", "3D", []),
            ],
        },
        "TPU": {
            "filaflex_tpu": [
                ("95a_medium_flex_", "filaflex_95a_medium_flex", "FilaFlex 95A Medium Flex", ['95A Medium Flex ']),
                ("70a_ultra_soft_", "filaflex_70a_ultra_soft", "FilaFlex 70A Ultra Soft", ['70A Ultra Soft ']),
                ("95_foamy_", "filaflex_95_foamy", "FilaFlex 95 Foamy", ['95 Foamy ']),
                ("82a_", "filaflex_82a", "FilaFlex 82A", ['82A ']),
                ("60a_", "filaflex_60a", "FilaFlex 60A", ['60A ']),
            ],
        },
    },
    "rosa3d_filaments": {
        "ABS": {
            "v0_fr_abs": [
                ("", "v0_fr", "V0 FR", []),
            ],
        },
        "PLA": {
            "pla": [
                ("plus_prospeedimpact_", "plus_prospeedimpact_pla", "Plus ProSpeed Impact PLA", ['Plus ProSpeed(Impact) ']),
                ("lw_aero_", "lw_aero_pla", "LW AERO PLA", ['LW AERO ']),
                ("starter_", "starter_pla", "Starter PLA", ['Starter ']),
                ("galaxy_", "galaxy_pla", "Galaxy PLA", ['Galaxy ']),
                ("pastel_", "pastel_pla", "Pastel PLA", ['Pastel ']),
                ("refill_", "refill_pla", "ReFill PLA", ['ReFill  ', 'ReFill ', 'Refill ']),
                ("magic_", "magic_pla", "Magic PLA", ['Magic ']),
            ],
            "silk_pla": [
                ("multicolour_", "multicolour_silk_pla", "Multicolour Silk PLA", ['Multicolour  ', 'Multicolour ']),
                ("rainbow_", "rainbow_silk_pla", "Rainbow Silk PLA", ['Rainbow  ', 'Rainbow ']),
                ("refill_", "refill_silk_pla", "ReFill Silk PLA", ['ReFill  ', 'ReFill ', 'Refill ']),
                ("magic_", "magic_silk_pla", "Magic Silk PLA", ['Magic  ', 'Magic ']),
            ],
        },
    },
    "sainsmart": {
        "TPU": {
            "high_speed_95a_flexible_gt_3_high_speed_tpu": [
                ("", "gt_3_high_speed_tpu", "GT-3 High Speed TPU", ['High Speed 95A Flexible ']),
            ],
        },
    },
    "sakata_3d": {
        "PLA": {
            "850_silk_pla": [
                ("", "silk_850", "Silk 850", ['850 ']),
            ],
            "pla": [
                ("goprint_", "goprint_pla", "Go&Print PLA", ['Go&Print ']),
                ("hr_870_", "hr_870_pla", "HR-870 PLA", ['HR-870 ']),
                ("wood_", "wood_pla", "Wood PLA", ['Wood ']),
            ],
        },
    },
    "smart_materials_3d": {
        "PLA": {
            "pla": [
                ("recycled_", "recycled_pla", "Recycled PLA", ['RECYCLED ']),
                ("crystal_", "crystal_pla", "Crystal PLA", ['Crystal ']),
                ("pastel_", "pastel_pla", "Pastel PLA", ['PASTEL ']),
                ("wood_", "wood_pla", "Wood PLA", ['WOOD ']),
                ("neon_", "neon_pla", "Neon PLA", ['NEON ']),
            ],
        },
    },
    "spectrum": {
        "PETG": {
            "petg": [
                ("pet_g_premium_", "pet_g_premium_petg", "PET-G Premium PETG", ['PET-G Premium ']),
                ("pet_g_glitter_", "pet_g_glitter_petg", "PET-G Glitter PETG", ['PET-G Glitter ']),
                ("the_filament_", "the_filament_petg", "The Filament PETG", ['The Filament  ', 'The Filament ']),
                ("pet_g_ht100_", "pet_g_ht100_petg", "PET-G HT100 PETG", ['PET-G HT100\u2122 ', 'PET-G HT100 ']),
                ("pet_g_fr_v0_", "pet_g_fr_v0_petg", "PET-G FR V0 PETG", ['PET-G FR V0 ']),
                ("r_", "r_petg", "R PETG", ['r ']),
            ],
        },
        "PLA": {
            "pla": [
                ("the_filament_", "the_filament_pla", "The Filament PLA", ['The Filament  ', 'The Filament ']),
                ("lw_ultrafoam_", "lw_pla_ultrafoam", "LW PLA UltraFoam", ['LW-UltraFoam ', 'LW UltraFoam ', 'lw_ultrafoam ']),
                ("safeguard_", "safeguard_pla", "Safeguard PLA", ['Safeguard  ', 'Safeguard ']),
                ("stone_age_", "stone_age_pla", "Stone Age PLA", ['Stone Age\u2122 ', 'Stone Age  ', 'Stone Age ']),
                ("pastello_", "pastello_pla", "Pastello PLA", ['Pastello  ', 'Pastello ']),
                ("greenyht_", "greenyht", "GreenyHT", ['GreenyHT ', 'greenyht ']),
                ("premium_", "pla_premium", "PLA Premium", ['Premium  ', 'Premium ']),
                ("nature_", "pla_nature", "PLA Nature", ['Nature  ', 'Nature ']),
                ("r_", "r_pla", "R PLA", ['r ']),
            ],
            "silk_pla": [
                ("flameguard_", "flameguard_silk_pla", "FlameGuard Silk PLA", ['FlameGuard  ', 'FlameGuard ']),
                ("huracan_", "huracan_silk_pla", "Huracan Silk PLA", ['Huracan  ', 'Huracan ']),
                ("glitter_", "glitter_silk_pla", "Glitter Silk PLA", ['Glitter ']),
                ("crystal_", "crystal_silk_pla", "Crystal Silk PLA", ['Crystal ']),
                ("metal_", "metal_silk_pla", "Metal Silk PLA", ['Metal ']),
            ],
        },
    },
    "sunlu": {
        "PLA": {
            "pla": [
                ("temperature_color_change_", "temperature_color_change_pla", "Temperature Color Change PLA", ['Temperature Color Change ']),
                ("transparentclear_", "transparent_clear_pla", "Transparent Clear PLA", ['Transparent(Clear) ', 'TransparentClear ']),
                ("real_wood_fiber_", "real_wood_fiber_pla", "Real Wood Fiber PLA", ['Real Wood Fiber ', 'Real-Wood-Fiber ']),
                ("fluorescent_", "fluorescent_pla", "Fluorescent PLA", ['Fluorescent ']),
                ("twinkling_", "pla_twinkling", "PLA Twinkling", ['Twinkling ']),
                ("upgrade_", "upgrade_pla", "Upgrade PLA", ['Upgrade + ', 'Upgrade ']),
                ("rainbow_", "pla_rainbow", "PLA Rainbow", ['Rainbow ']),
                ("plus_", "pla+", "PLA+", ['PLA+ ', 'Plus ', 'PLA Plus ']),
                ("meta_", "pla_meta", "PLA Meta", ['Meta ']),
            ],
        },
    },
    "tectonic_3d": {
        "PEI": {
            "vulcan_pei": [
                ("1010_", "vulcan_1010_pei", "Vulcan 1010 PEI", ['1010 ']),
                ("9085_", "vulcan_9085_pei", "Vulcan 9085 PEI", ['9085 ']),
            ],
        },
        "PEKK": {
            "vulcan_pekk": [
                ("a_", "vulcan_a_pekk", "Vulcan A PEKK", ['A ']),
                ("sc_", "vulcan_sc_pekk", "Vulcan SC PEKK", ['SC ']),
            ],
        },
    },
    "tinmorry": {
        "PETG": {
            "petg": [
                ("rapid_eco_", "rapid_eco_petg", "Rapid-Eco PETG", ['Rapid -Eco ', 'Rapid-Eco ', 'Rapid Eco ']),
                ("metallic_", "metallic_petg", "Metallic PETG", ['Metallic  ', 'Metallic ']),
                ("marble_", "marble_petg", "Marble PETG", ['Marble ']),
                ("galaxy_", "galaxy_petg", "Galaxy PETG", ['Galaxy  ', 'Galaxy ']),
            ],
        },
    },
    "verbatim": {
        "PETG": {
            "petg": [
                ("pet_g_", "petg", "PETG", ['PET-G ']),
            ],
        },
    },
    "winkle": {
        "PLA": {
            "pla": [
                ("hd_", "hd_pla", "HD PLA", ['HD ']),
            ],
        },
    },
}


# ---------------------------------------------------------------------------
# Generic rename rules (from fix_subtype_naming.py)
# ---------------------------------------------------------------------------

GENERIC_RENAME_RULES = [
    {
        "subtype_contains": "cf",
        "id_prefixes": ["carbon_fiber_", "cf_"],
        "name_prefixes": [
            "Carbon Fiber  ", "Carbon Fiber ", "CARBON FIBER ",
            "CF ",
        ],
    },
    {
        "subtype_contains": "gf",
        "id_prefixes": ["glass_fiber_reinforced_", "glass_fiber_", "gf_"],
        "name_prefixes": [
            "Glass Fiber Reinforced  ", "Glass Fiber Reinforced ",
            "Glass Fiber  ", "Glass Fiber ",
            "GF ",
        ],
    },
    {
        "subtype_contains": "silk",
        "id_prefixes": ["silky_", "silk_"],
        "name_prefixes": [
            "Silky ", "Silk ",
        ],
    },
    {
        "subtype_contains": "glow",
        "id_prefixes": ["glow_in_the_dark_", "glow_in_dark_", "glow_"],
        "name_prefixes": [
            "Glow-in-the-Dark Glow ",
            "Glow-in-the-Dark ",
            "Glow in The Dark  ", "Glow in The Dark ",
            "Glow in the Dark  ", "Glow in the Dark ",
            "Glow in dark ",
            "Glow ",
        ],
    },
]


# ---------------------------------------------------------------------------
# Pure helper functions
# ---------------------------------------------------------------------------

def slugify(text: str) -> str:
    """Convert text to a valid ID (lowercase, underscores)."""
    text = text.lower()
    text = re.sub(r"[-\s]+", "_", text)
    text = re.sub(r"[^a-z0-9_]", "", text)
    text = text.strip("_")
    text = re.sub(r"_+", "_", text)
    return text or "default"


def clean_display_name(slug: str) -> str:
    """Convert a slug to a display name. E.g. 'dark_blue' -> 'Dark Blue'."""
    return slug.replace("_", " ").title()


def is_color_like(name: str) -> bool:
    """Check if a directory name looks like a color."""
    parts = name.split("_")
    # Simple color: "blue", "red"
    if name in KNOWN_COLORS:
        return True
    # Modified color: "neon_cyan", "galaxy_blue", "dark_red"
    if len(parts) >= 2:
        modifier = parts[0]
        base = "_".join(parts[1:])
        if modifier in COLOR_MODIFIERS and base in KNOWN_COLORS:
            return True
    # Compound known colors: "mango_mojito", "liquid_luster", "kaoss_purple"
    if len(parts) >= 2 and parts[-1] in KNOWN_COLORS:
        if all(p in COLOR_MODIFIERS or p in KNOWN_COLORS for p in parts[:-1]):
            return True
    return False


def has_material_keyword(name: str) -> bool:
    """Check if a name contains material/product keywords."""
    parts = set(name.split("_"))
    return bool(parts & MATERIAL_KEYWORDS)


def id_to_display_name(slug: str) -> str:
    """Convert a filament/variant slug to a proper display name.

    Material keywords are uppercased; everything else is title-cased.
    E.g. ``95a_tpu`` -> ``95A TPU``, ``high_speed_pla`` -> ``High Speed PLA``.
    """
    parts = slug.split("_")
    result = []
    for p in parts:
        if p.lower() in _MATERIAL_UPPER:
            result.append(p.upper())
        else:
            result.append(p.title())
    return " ".join(result)


def compute_common_prefix(names: list[str]) -> str:
    """Return the longest common prefix ending in ``_`` shared by all *names*.

    Returns an empty string when no qualifying prefix exists.
    """
    if not names:
        return ""
    prefix = names[0]
    for name in names[1:]:
        while not name.startswith(prefix):
            prefix = prefix[:-1]
            if not prefix:
                return ""
    # Truncate to the last underscore so the prefix is a complete "word_"
    idx = prefix.rfind("_")
    if idx > 0:
        return prefix[: idx + 1]
    return ""


def prefix_implied_by_filament(prefix: str, filament_id: str, brand: str) -> bool:
    """Return True if the prefix information is already captured by the hierarchy.

    When True the fix is a simple in-place rename (strip); when False the fix
    is a structural move to a new filament directory.
    """
    p = prefix.rstrip("_")

    # Direct containment: "metallic" in "metallic_pla"
    if p in filament_id:
        return True

    # Abbreviation: "hs" for "high_speed"
    if p == "hs" and "high_speed" in filament_id:
        return True
    if p == "high_speed" and "high_speed" in filament_id:
        return True

    # Material re-spelling: "pet_g" for "petg", "matt_pet_g" for "matte_petg"
    if p.replace("_", "") in filament_id.replace("_", ""):
        return True

    # Glow patterns: "glow_in_the_dark" or "starter_glow_in_the_dark" for "glow_*"
    if "glow_in_the_dark" in prefix and "glow" in filament_id:
        return True

    # Brand name present in prefix: "voxel_hs" contains "voxel" from "voxel_pla"
    brand_parts = set(brand.split("_"))
    prefix_parts = set(p.split("_"))
    if brand_parts & prefix_parts:
        return True

    return False


def strip_name_prefix(name: str, name_prefixes: list[str]) -> str:
    """Strip the product-line prefix from a display name, trying longest first."""
    for prefix in sorted(name_prefixes, key=len, reverse=True):
        if name.startswith(prefix):
            result = name[len(prefix):].strip().lstrip('-').strip()
            if result:
                return result[0].upper() + result[1:] if result else name
            return name
    # Case-insensitive fallback
    for prefix in sorted(name_prefixes, key=len, reverse=True):
        if name.lower().startswith(prefix.lower()):
            result = name[len(prefix):].strip().lstrip('-').strip()
            if result:
                return result[0].upper() + result[1:] if result else name
            return name
    return name
