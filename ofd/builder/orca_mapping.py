"""
Mapping from Open Filament Database entities to OrcaSlicer filament presets.

OrcaSlicer reads filament presets as JSON files. A user preset is a thin
override layer on top of a system profile named by ``inherits`` — so the only
fields we emit are the ones OFD actually knows: vendor, material type, density,
diameter and temperatures. Everything governing print behaviour (flow ratio,
retraction, max volumetric speed, fan, pressure advance) has no equivalent in
the OFD schema and is deliberately left to the inherited base profile.

Every OrcaSlicer filament value is a list of strings, one entry per extruder.

A **user** preset uses a different envelope from a **system** profile, and
getting it wrong makes OrcaSlicer report "0 imported" with no further
explanation. A user preset carries ``name``, ``from: "User"``, ``inherits``,
``is_custom_defined``, ``filament_settings_id`` and ``version``, and must NOT
carry ``type``, ``instantiation``, ``compatible_printers``, ``setting_id`` or
``filament_id`` — those mark it as a system profile, and the import is rejected.
``filament_id``/``setting_id`` are system metadata rather than config options
(they are absent from ``fdm_filament_common.json``); for a user preset the
slicer records that linkage in the sidecar ``.info`` file it writes itself.
See OrcaSlicer issue #12223, and compare a preset the slicer saved for itself
under ``user/default/filament/``.

This module is pure — no filesystem access — so the rules below are directly
unit-testable. See ``ofd/builder/exporters/orca_exporter.py`` for the writer.
"""

import re
from typing import Any

# Suffix appended to every generated preset name. Keeps OFD presets from
# shadowing OrcaSlicer's own system presets, makes them obvious in the filament
# dropdown, and makes them trivial to find and remove again. Note this is not an
# "@suffix" — OrcaSlicer reads "@" as a printer-variant marker.
NAME_SUFFIX = " (OFD)"

# Config-schema version stamped on every generated preset. OrcaSlicer refuses a
# preset that claims to be newer than the running application, so this is held
# deliberately low: every key emitted here has existed since well before it.
# Raise it only alongside a key that genuinely needs a newer slicer.
ORCA_PRESET_VERSION = "2.0.2.0"

DEFAULT_API_BASE_URL = "https://api.openfilamentdatabase.org"

# ---------------------------------------------------------------------------
# Material -> OrcaSlicer base profile
# ---------------------------------------------------------------------------

# The "Generic <x> @System" presets that ship in OrcaSlicer's OrcaFilamentLibrary.
# These carry an empty compatible_printers list, so they are a safe inheritance
# base on any printer. Keep this list in sync with:
#   resources/profiles/OrcaFilamentLibrary/filament/Generic *.json
ORCA_GENERIC_PROFILES = frozenset(
    {
        "Generic ABS @System",
        "Generic ASA @System",
        "Generic BVOH @System",
        "Generic CoPE @System",
        "Generic EVA @System",
        "Generic HIPS @System",
        "Generic PA @System",
        "Generic PA-CF @System",
        "Generic PC @System",
        "Generic PCTG @System",
        "Generic PE @System",
        "Generic PE-CF @System",
        "Generic PETG @System",
        "Generic PETG HF @System",
        "Generic PETG-CF @System",
        "Generic PHA @System",
        "Generic PLA @System",
        "Generic PLA High Speed @System",
        "Generic PLA Matte @System",
        "Generic PLA Silk @System",
        "Generic PLA-CF @System",
        "Generic PP @System",
        "Generic PP-CF @System",
        "Generic PP-GF @System",
        "Generic PPA-CF @System",
        "Generic PPA-GF @System",
        "Generic PVA @System",
        "Generic SBS @System",
        "Generic TPU @System",
    }
)

# OFD material type (schemas/material_types_schema.json) -> default Orca base.
# Materials absent from this map have no credible generic base in OrcaSlicer and
# are skipped rather than emitted against a wrong-behaving parent. PPA is
# intentionally absent: OrcaSlicer only ships filled PPA-CF/PPA-GF bases, which
# the name refinements below can still select.
ORCA_BASE_BY_MATERIAL: dict[str, str] = {
    "PLA": "Generic PLA @System",
    "PETG": "Generic PETG @System",
    "PET": "Generic PETG @System",
    "PCTG": "Generic PCTG @System",
    "CPE": "Generic PETG @System",
    "ABS": "Generic ABS @System",
    "ASA": "Generic ASA @System",
    "PC": "Generic PC @System",
    "TPU": "Generic TPU @System",
    "TPE": "Generic TPU @System",
    "TPC": "Generic TPU @System",
    "PEBA": "Generic TPU @System",
    "PA6": "Generic PA @System",
    "PA11": "Generic PA @System",
    "PA12": "Generic PA @System",
    "PA66": "Generic PA @System",
    "PP": "Generic PP @System",
    "HIPS": "Generic HIPS @System",
    "PVA": "Generic PVA @System",
    "BVOH": "Generic BVOH @System",
    "PHA": "Generic PHA @System",
    "SBS": "Generic SBS @System",
    "EVA": "Generic EVA @System",
}

# Name-driven refinements, checked in order — the first pattern that matches the
# filament name and has an entry for this material wins. Fibre fills come first
# because they change print behaviour far more than a surface finish does.
_REFINEMENTS: tuple[tuple[re.Pattern[str], dict[str, str]], ...] = (
    (
        re.compile(r"(?:^|[\s\-_(])(?:cf|carbon)(?:$|[\s\-_)])"),
        {
            "PLA": "Generic PLA-CF @System",
            "PETG": "Generic PETG-CF @System",
            "PET": "Generic PETG-CF @System",
            "PA6": "Generic PA-CF @System",
            "PA11": "Generic PA-CF @System",
            "PA12": "Generic PA-CF @System",
            "PA66": "Generic PA-CF @System",
            "PP": "Generic PP-CF @System",
            "PPA": "Generic PPA-CF @System",
        },
    ),
    (
        re.compile(r"(?:^|[\s\-_(])(?:gf|glass)(?:$|[\s\-_)])"),
        {
            "PP": "Generic PP-GF @System",
            "PPA": "Generic PPA-GF @System",
        },
    ),
    (
        re.compile(r"(?:^|[\s\-_(])(?:hf|high[\s\-_]?flow)(?:$|[\s\-_)])"),
        {
            "PETG": "Generic PETG HF @System",
            "PET": "Generic PETG HF @System",
            "PLA": "Generic PLA High Speed @System",
        },
    ),
    (
        re.compile(r"high[\s\-_]?speed"),
        {"PLA": "Generic PLA High Speed @System"},
    ),
    (
        re.compile(r"(?:^|[\s\-_(])matte?(?:$|[\s\-_)])"),
        {"PLA": "Generic PLA Matte @System"},
    ),
    (
        re.compile(r"silk"),
        {"PLA": "Generic PLA Silk @System"},
    ),
)

# Exportability, as the WebUI needs to see it. A download link must only be
# offered for a filament the exporter actually writes, so these two constants are
# mirrored into webui/src/lib/utils/orcaMaterials.generated.ts by
# `ofd script generate_orca_materials`; tests/test_orca_exporter.py fails if the
# mirror drifts.

# Materials exportable on the material type alone.
BASE_MATERIALS: frozenset[str] = frozenset(ORCA_BASE_BY_MATERIAL)

# (regex source, materials) for materials that have no default base and only
# become exportable when the filament name matches — PPA reaching PPA-CF/PPA-GF.
# Patterns are mirrored verbatim into JavaScript, so keep them to syntax both
# engines read the same way (no named groups, no possessive quantifiers).
NAME_ONLY_MATERIAL_RULES: tuple[tuple[str, frozenset[str]], ...] = tuple(
    (pattern.pattern, frozenset(m for m in by_material if m not in ORCA_BASE_BY_MATERIAL))
    for pattern, by_material in _REFINEMENTS
    if any(m not in ORCA_BASE_BY_MATERIAL for m in by_material)
)


# OFD material -> OrcaSlicer filament_type. Only types OrcaSlicer itself
# recognises are listed; for anything else the inherited base's type stands.
ORCA_FILAMENT_TYPE_BY_MATERIAL: dict[str, str] = {
    "PLA": "PLA",
    "PETG": "PETG",
    "PCTG": "PCTG",
    "ABS": "ABS",
    "ASA": "ASA",
    "PC": "PC",
    "TPU": "TPU",
    "PA6": "PA",
    "PA11": "PA",
    "PA12": "PA",
    "PA66": "PA",
    "PP": "PP",
    "HIPS": "HIPS",
    "PVA": "PVA",
    "BVOH": "BVOH",
    "EVA": "EVA",
    "SBS": "SBS",
}

# Bed temperature is written to the high-temperature plate types only.
# cool_plate_temp and supertack_plate_temp are deliberately left inherited: they
# describe low-temperature build plates, and pushing a hot material's bed
# temperature onto them is exactly the class of bug in OrcaSlicer issue #12874.
BED_TEMP_KEYS = ("hot_plate_temp", "textured_plate_temp", "eng_plate_temp")


def resolve_base_profile(material: str, filament_name: str) -> str | None:
    """
    Pick the OrcaSlicer system profile a generated preset should inherit from.

    Returns None when the material has no credible generic base in OrcaSlicer,
    in which case the caller should skip the filament rather than emit a preset
    that inherits wrong print behaviour.
    """
    if not material:
        return None

    material = material.upper()
    name = (filament_name or "").lower()

    for pattern, by_material in _REFINEMENTS:
        refined = by_material.get(material)
        if refined and pattern.search(name):
            return refined

    return ORCA_BASE_BY_MATERIAL.get(material)


def _num_str(value: Any) -> str | None:
    """Render a number the way OrcaSlicer writes them: no trailing zeros."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return str(int(value)) if value.is_integer() else f"{value:g}"
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _round_to_5(value: float) -> int:
    return int(round(value / 5.0) * 5)


def _midpoint(low: Any, high: Any) -> int | None:
    """Midpoint of a recommended range, rounded to the nearest 5 degrees."""
    values = [v for v in (low, high) if isinstance(v, (int, float)) and not isinstance(v, bool)]
    if not values:
        return None
    return _round_to_5(sum(values) / len(values))


def _generic_block(entity: dict | None, key: str) -> dict:
    """Read the ``generic`` temperature block out of a slicer_settings map."""
    if not entity:
        return {}
    settings = entity.get(key) or {}
    if not isinstance(settings, dict):
        return {}
    generic = settings.get("generic") or {}
    return generic if isinstance(generic, dict) else {}


def resolve_temps(filament: dict, material: dict | None = None) -> dict[str, int]:
    """
    Resolve nozzle and bed temperatures for a filament.

    First hit wins, most specific source first:

    1. ``filament.slicer_settings.generic.*``
    2. ``material.default_slicer_settings.generic.*``
    3. the midpoint of the filament's recommended range, rounded to the nearest 5
    4. absent — the key is omitted and the inherited base profile's value stands

    Returns a dict with any of ``nozzle``, ``nozzle_initial``, ``bed`` and
    ``bed_initial``. A missing key means "we do not know, leave it inherited".
    """
    fil_generic = _generic_block(filament, "slicer_settings")
    mat_generic = _generic_block(material, "default_slicer_settings")

    def pick(*names: str) -> int | None:
        for source in (fil_generic, mat_generic):
            for name in names:
                value = source.get(name)
                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    return int(value)
        return None

    nozzle = pick("nozzle_temp")
    if nozzle is None:
        nozzle = _midpoint(
            filament.get("min_print_temperature"), filament.get("max_print_temperature")
        )

    bed = pick("bed_temp")
    if bed is None:
        bed = _midpoint(filament.get("min_bed_temperature"), filament.get("max_bed_temperature"))

    nozzle_initial = pick("first_layer_nozzle_temp")
    if nozzle_initial is None:
        nozzle_initial = nozzle

    bed_initial = pick("first_layer_bed_temp")
    if bed_initial is None:
        bed_initial = bed

    temps = {
        "nozzle": nozzle,
        "nozzle_initial": nozzle_initial,
        "bed": bed,
        "bed_initial": bed_initial,
    }
    return {key: value for key, value in temps.items() if value is not None}


def resolve_filament_id(filament: dict) -> str | None:
    """
    The OrcaSlicer-native filament code OFD has on record, from the mapping
    maintained by SimplyPrint/slicer-profiles-db. Falls back to the material's
    generic code.

    This is deliberately NOT written into the generated preset: ``filament_id``
    is system-profile metadata, and a user preset carrying it is rejected on
    import. It is surfaced in the preset notes and the export index instead, so
    a reader can still see which OrcaSlicer library profile the filament maps to.
    """
    settings = filament.get("slicer_settings") or {}
    orca = settings.get("orcaslicer") or {}
    if not isinstance(orca, dict):
        return None

    for key in ("id", "generic_id"):
        value = orca.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def resolve_overrides(filament: dict) -> dict:
    """
    Raw OrcaSlicer keys pinned by contributors via
    ``slicer_settings.orcaslicer.overrides``. Values are passed through verbatim,
    normalised to OrcaSlicer's list-of-strings convention.
    """
    settings = filament.get("slicer_settings") or {}
    orca = settings.get("orcaslicer") or {}
    if not isinstance(orca, dict):
        return {}

    overrides = orca.get("overrides") or {}
    if not isinstance(overrides, dict):
        return {}

    result: dict[str, list[str]] = {}
    for key, value in overrides.items():
        if isinstance(value, list):
            rendered = [_num_str(item) for item in value]
            if all(item is not None for item in rendered):
                result[key] = rendered  # type: ignore[assignment]
        else:
            rendered_value = _num_str(value)
            if rendered_value is not None:
                result[key] = [rendered_value]
    return result


def profile_name(brand_name: str, filament_name: str, suffix: str = NAME_SUFFIX) -> str:
    return f"{brand_name} {filament_name}{suffix}".strip()


def build_profile(
    brand: dict,
    material: dict,
    filament: dict,
    diameters: list[float] | None = None,
    *,
    version: str = "",
    api_base_url: str = DEFAULT_API_BASE_URL,
    name_suffix: str = NAME_SUFFIX,
) -> dict | None:
    """
    Build one OrcaSlicer user filament preset.

    Returns None when the material has no OrcaSlicer base to inherit from.
    """
    material_type = (material or {}).get("material") or filament.get("material") or ""
    base = resolve_base_profile(material_type, filament.get("name", ""))
    if base is None:
        return None

    name = profile_name(brand.get("name", ""), filament.get("name", ""), name_suffix)

    # The user-preset envelope. Adding "type", "instantiation",
    # "compatible_printers", "setting_id" or "filament_id" here would mark this
    # as a system profile and OrcaSlicer would refuse the import — see the
    # module docstring.
    profile: dict[str, Any] = {
        "name": name,
        "from": "User",
        "inherits": base,
        "is_custom_defined": "0",
        "filament_settings_id": [name],
        "version": ORCA_PRESET_VERSION,
    }

    if brand.get("name"):
        profile["filament_vendor"] = [brand["name"]]

    orca_type = ORCA_FILAMENT_TYPE_BY_MATERIAL.get(str(material_type).upper())
    if orca_type:
        profile["filament_type"] = [orca_type]

    density = _num_str(filament.get("density"))
    if density:
        profile["filament_density"] = [density]

    # Only pin the diameter when the whole product line ships in one. A line sold
    # in both 1.75 and 2.85 gets no diameter, so the base profile's default holds.
    distinct_diameters = sorted({d for d in (diameters or []) if d})
    if len(distinct_diameters) == 1:
        diameter = _num_str(distinct_diameters[0])
        if diameter:
            profile["filament_diameter"] = [diameter]

    # Contributor-pinned raw OrcaSlicer keys are applied before the resolved
    # temperatures, matching the precedence the filament schema documents:
    # "Slicer specific settings are applied first, then these are applied on top."
    profile.update(resolve_overrides(filament))

    temps = resolve_temps(filament, material)
    if "nozzle" in temps:
        profile["nozzle_temperature"] = [str(temps["nozzle"])]
    if "nozzle_initial" in temps:
        profile["nozzle_temperature_initial_layer"] = [str(temps["nozzle_initial"])]
    if "bed" in temps:
        for key in BED_TEMP_KEYS:
            profile[key] = [str(temps["bed"])]
    if "bed_initial" in temps:
        for key in BED_TEMP_KEYS:
            profile[f"{key}_initial_layer"] = [str(temps["bed_initial"])]

    chamber = _num_str(filament.get("chamber_temperature"))
    if chamber:
        profile["chamber_temperature"] = [chamber]

    profile["filament_notes"] = [
        _build_notes(brand, material, filament, version=version, api_base_url=api_base_url)
    ]

    # OrcaSlicer writes its own presets with sorted keys; matching that keeps a
    # generated file diffable against one the slicer has re-saved.
    return dict(sorted(profile.items()))


def filament_api_url(brand: dict, material: dict, filament: dict, api_base_url: str) -> str:
    """The static API URL this preset was generated from."""
    base = api_base_url.rstrip("/")
    return (
        f"{base}/api/v1/brands/{brand.get('slug', '')}"
        f"/materials/{material.get('slug', '')}"
        f"/filaments/{filament.get('slug', '')}/index.json"
    )


def _build_notes(
    brand: dict,
    material: dict,
    filament: dict,
    *,
    version: str,
    api_base_url: str,
) -> str:
    material_type = (material or {}).get("material") or filament.get("material") or ""
    base = resolve_base_profile(material_type, filament.get("name", ""))
    source_url = filament_api_url(brand, material, filament, api_base_url)

    lines = [
        "Generated from the Open Filament Database.",
        "",
        "Temperatures, density and diameter come from OFD. Everything else -",
        "flow, retraction, volumetric speed, fan and pressure advance - is",
        f"inherited from '{base}' and is not tuned for this filament.",
        "",
        f"Source: {source_url}",
    ]
    if version:
        lines.append(f"Dataset version: {version}")

    # filament_id cannot live in a user preset, so record it here instead.
    library_code = resolve_filament_id(filament)
    if library_code:
        lines.append(f"OrcaSlicer filament code: {library_code}")
    return "\n".join(lines)
