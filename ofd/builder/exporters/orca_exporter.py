"""
OrcaSlicer filament preset exporter.

OrcaSlicer has no remote filament source or plugin API — it reads presets as
JSON files, either dropped into ``user/default/filament/`` or loaded through
File > Import > Import Configs. So this exporter writes ready-to-import presets
into a static tree published alongside the API, plus per-brand zip bundles:

  orcaslicer/
    index.json
    README.txt
    brands/{brand}/materials/{MATERIAL}/filaments/{filament}.json
    bundles/{brand}.zip
    bundles/all.zip

Path segments mirror the static API exactly, so an OrcaSlicer URL is the API URL
with ``api/v1`` swapped for ``orcaslicer``.

The OFD -> OrcaSlicer field mapping lives in ``ofd/builder/orca_mapping.py``.
"""

import json
import zipfile
from pathlib import Path

from ..models import Database
from ..orca_mapping import (
    DEFAULT_API_BASE_URL,
    NAME_SUFFIX,
    ORCA_PRESET_VERSION,
    build_profile,
    filament_api_url,
    resolve_filament_id,
)

README_TEXT = f"""\
OrcaSlicer filament presets from the Open Filament Database
===========================================================

Every file in here is an OrcaSlicer user filament preset, generated from
https://openfilamentdatabase.org/

INSTALL
-------
Extract this archive first - OrcaSlicer's importer reads .json files, not a
plain .zip. Then either:

  OrcaSlicer > File > Import > Import Configs...  and select the .json files
                                                  (you can select several)

Or copy them into your OrcaSlicer profile folder and restart OrcaSlicer:
  Windows  %APPDATA%\\OrcaSlicer\\user\\default\\filament
  macOS    ~/Library/Application Support/OrcaSlicer/user/default/filament
  Linux    ~/.config/OrcaSlicer/user/default/filament

If an import reports "0 imported", you most likely selected the .zip itself
rather than the .json files inside it.

WHAT THESE ARE
--------------
Each preset sets the vendor, material type, density, diameter and temperatures
recorded in the Open Filament Database. Everything that governs print behaviour
- flow ratio, retraction, max volumetric speed, fan, pressure advance - is
inherited from OrcaSlicer's matching generic profile, because the database does
not hold that data. Treat these as a correct starting point, not a tuned profile.

Presets are named "<Brand> <Filament>{NAME_SUFFIX}" so they never shadow OrcaSlicer's
own presets, and so you can find and remove them again easily.

Found a wrong number? Corrections are welcome at
https://openfilamentdatabase.org/
"""


def _safe_filename(name: str) -> str:
    """Make a preset name safe as a filename on every platform."""
    cleaned = "".join("_" if ch in '<>:"/\\|?*' else ch for ch in name)
    return cleaned.strip().rstrip(".") or "profile"


def export_orca(
    db: Database,
    output_dir: str,
    version: str,
    generated_at: str,
    api_base_url: str = DEFAULT_API_BASE_URL,
    **kwargs,
) -> int:
    """
    Export OrcaSlicer filament presets. Returns the number of presets written.
    """
    orca_path = Path(output_dir) / "orcaslicer"
    orca_path.mkdir(parents=True, exist_ok=True)

    materials_by_brand: dict[str, list[dict]] = {}
    for material in db.materials:
        materials_by_brand.setdefault(material["brand_id"], []).append(material)

    filaments_by_material: dict[str, list[dict]] = {}
    for filament in db.filaments:
        filaments_by_material.setdefault(filament["material_id"], []).append(filament)

    variants_by_filament: dict[str, list[dict]] = {}
    for variant in db.variants:
        variants_by_filament.setdefault(variant["filament_id"], []).append(variant)

    diameters_by_variant: dict[str, list[float]] = {}
    for size in db.sizes:
        diameter = size.get("diameter")
        if isinstance(diameter, (int, float)):
            diameters_by_variant.setdefault(size["variant_id"], []).append(float(diameter))

    entries: list[dict] = []
    # Files staged for the zip bundles: brand slug -> [(arcname, json bytes)]
    staged: dict[str, list[tuple[str, bytes]]] = {}
    skipped_materials: dict[str, int] = {}

    for brand in db.brands:
        for material in materials_by_brand.get(brand["id"], []):
            for filament in filaments_by_material.get(material["id"], []):
                diameters = [
                    diameter
                    for variant in variants_by_filament.get(filament["id"], [])
                    for diameter in diameters_by_variant.get(variant["id"], [])
                ]

                profile = build_profile(
                    brand,
                    material,
                    filament,
                    diameters,
                    version=version,
                    api_base_url=api_base_url,
                )
                if profile is None:
                    material_type = material.get("material") or filament.get("material") or "?"
                    skipped_materials[material_type] = skipped_materials.get(material_type, 0) + 1
                    continue

                rel_path = (
                    f"brands/{brand['slug']}/materials/{material['slug']}"
                    f"/filaments/{filament['slug']}.json"
                )
                payload = json.dumps(profile, indent=4, ensure_ascii=False, sort_keys=True) + "\n"
                encoded = payload.encode("utf-8")

                dest = orca_path / rel_path
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(encoded)

                staged.setdefault(brand["slug"], []).append(
                    (f"{_safe_filename(profile['name'])}.json", encoded)
                )

                entries.append(
                    {
                        "id": filament["id"],
                        "brand": brand["name"],
                        "brand_slug": brand["slug"],
                        "material": material["slug"],
                        "filament": filament["name"],
                        "filament_slug": filament["slug"],
                        "profile_name": profile["name"],
                        "inherits": profile["inherits"],
                        "orca_filament_code": resolve_filament_id(filament),
                        "path": rel_path,
                        "source": filament_api_url(brand, material, filament, api_base_url),
                    }
                )

    (orca_path / "README.txt").write_text(README_TEXT, encoding="utf-8")

    bundles_path = orca_path / "bundles"
    bundles_path.mkdir(parents=True, exist_ok=True)

    bundles: list[dict] = []
    all_bundle = bundles_path / "all.zip"
    with zipfile.ZipFile(all_bundle, "w", zipfile.ZIP_DEFLATED) as all_zip:
        all_zip.writestr("README.txt", README_TEXT)
        for brand_slug, files in sorted(staged.items()):
            brand_bundle = bundles_path / f"{brand_slug}.zip"
            with zipfile.ZipFile(brand_bundle, "w", zipfile.ZIP_DEFLATED) as brand_zip:
                brand_zip.writestr("README.txt", README_TEXT)
                for arcname, encoded in files:
                    brand_zip.writestr(arcname, encoded)
                    all_zip.writestr(f"{brand_slug}/{arcname}", encoded)
            bundles.append(
                {
                    "brand_slug": brand_slug,
                    "profile_count": len(files),
                    "path": f"bundles/{brand_slug}.zip",
                }
            )

    index = {
        "version": version,
        "generated_at": generated_at,
        "slicer": "OrcaSlicer",
        "profile_count": len(entries),
        "name_suffix": NAME_SUFFIX,
        "preset_version": ORCA_PRESET_VERSION,
        "readme": "README.txt",
        "all_bundle": "bundles/all.zip",
        "skipped_materials": dict(sorted(skipped_materials.items())),
        "bundles": bundles,
        "profiles": entries,
    }
    with open(orca_path / "index.json", "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)

    print(f"  Written: {len(entries)} OrcaSlicer presets, {len(bundles)} brand bundles")
    if skipped_materials:
        total_skipped = sum(skipped_materials.values())
        detail = ", ".join(f"{mat} ({count})" for mat, count in sorted(skipped_materials.items()))
        print(f"  Skipped: {total_skipped} filaments with no OrcaSlicer base profile - {detail}")

    return len(entries)
