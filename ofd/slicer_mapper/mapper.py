"""
SlicerMapper: derives slicer_settings/slicer_ids mappings from profile store data.
"""

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

from slicer_profiles_db import ProfileIndex, SlicerType, StoredProfile
from .vendor_map import get_profile_prefixes

logger = logging.getLogger(__name__)


@dataclass
class MappingResult:
    filament_path: Path  # path to filament.json
    slicer: str
    profile_name: str  # base name (before @)
    slicer_id: str | None  # filament_id from StoredProfile
    vendor: str  # profile vendor


@dataclass
class MappingConflict:
    filament_path: Path
    slicer: str
    field: str  # "profile_name" or "slicer_id"
    existing: str
    derived: str


@dataclass
class MappingReport:
    updated: list[MappingResult] = field(default_factory=list)
    already_correct: list[MappingResult] = field(default_factory=list)
    conflicts: list[MappingConflict] = field(default_factory=list)
    skipped: list[tuple[Path, str]] = field(default_factory=list)


class SlicerMapper:
    def __init__(self, index: ProfileIndex, data_dir: Path):
        self.index = index
        self.data_dir = data_dir

    def run(
        self,
        slicers: list[str] | None = None,
        dry_run: bool = False,
        brand_filter: str | None = None,
    ) -> MappingReport:
        if slicers is None:
            slicers = [s.value for s in SlicerType]

        report = MappingReport()

        for brand_dir in sorted(self.data_dir.iterdir()):
            if not brand_dir.is_dir():
                continue

            brand_id = brand_dir.name
            if brand_filter and brand_id != brand_filter:
                continue

            brand_json = brand_dir / "brand.json"
            if not brand_json.exists():
                continue

            brand_data = json.loads(brand_json.read_text(encoding="utf-8"))
            brand_name = brand_data.get("name", "")

            for material_dir in sorted(brand_dir.iterdir()):
                if not material_dir.is_dir():
                    continue

                material = material_dir.name

                for filament_dir in sorted(material_dir.iterdir()):
                    if not filament_dir.is_dir():
                        continue

                    filament_path = filament_dir / "filament.json"
                    if not filament_path.exists():
                        continue

                    filament_data = json.loads(
                        filament_path.read_text(encoding="utf-8")
                    )

                    for slicer in slicers:
                        result = self._match_filament(
                            brand_id=brand_id,
                            brand_name=brand_name,
                            material=material,
                            filament_data=filament_data,
                            filament_path=filament_path,
                            slicer=slicer,
                        )
                        if result is None:
                            continue

                        existing_settings = filament_data.get("slicer_settings", {})
                        existing_slicer = existing_settings.get(slicer, {})
                        existing_name = existing_slicer.get("profile_name")

                        existing_ids = filament_data.get("slicer_ids", {})
                        existing_id = existing_ids.get(slicer)

                        has_conflict = False

                        if existing_name and existing_name != result.profile_name:
                            report.conflicts.append(
                                MappingConflict(
                                    filament_path=filament_path,
                                    slicer=slicer,
                                    field="profile_name",
                                    existing=existing_name,
                                    derived=result.profile_name,
                                )
                            )
                            has_conflict = True

                        if (
                            result.slicer_id
                            and existing_id
                            and existing_id != result.slicer_id
                        ):
                            report.conflicts.append(
                                MappingConflict(
                                    filament_path=filament_path,
                                    slicer=slicer,
                                    field="slicer_id",
                                    existing=existing_id,
                                    derived=result.slicer_id,
                                )
                            )
                            has_conflict = True

                        if has_conflict:
                            continue

                        name_matches = existing_name == result.profile_name
                        id_matches = (
                            not result.slicer_id
                            or existing_id == result.slicer_id
                        )

                        if name_matches and id_matches:
                            report.already_correct.append(result)
                        else:
                            report.updated.append(result)

        if report.conflicts:
            return report

        if not dry_run:
            self._write_updates(report.updated)

        return report

    def _match_filament(
        self,
        brand_id: str,
        brand_name: str,
        material: str,
        filament_data: dict,
        filament_path: Path,
        slicer: str,
    ) -> MappingResult | None:
        """Try to match a filament to a slicer profile base name.

        Searches across ALL vendors for the slicer, using candidate
        profile names derived from the brand name and filament metadata.
        """
        prefixes = get_profile_prefixes(brand_id, brand_name)
        if not prefixes:
            return None

        filament_name = filament_data.get("name", "")

        try:
            slicer_type = SlicerType(slicer)
        except ValueError:
            return None

        for prefix in prefixes:
            candidates = self._compose_candidates(prefix, material, filament_name)
            for candidate in candidates:
                matches = self.index.find_by_base_name_any_vendor(slicer_type, candidate)
                if matches:
                    vendor, profiles = matches[0]
                    # Use the actual base name from the profile (preserves original casing)
                    profile_base_name = profiles[0].name.split(" @")[0]
                    slicer_id = None
                    for p in profiles:
                        if p.filament_id:
                            slicer_id = p.filament_id
                            break

                    return MappingResult(
                        filament_path=filament_path,
                        slicer=slicer,
                        profile_name=profile_base_name,
                        slicer_id=slicer_id,
                        vendor=vendor,
                    )

        return None

    def _compose_candidates(
        self, prefix: str, material: str, filament_name: str
    ) -> list[str]:
        """
        Generate candidate base profile names to search for.

        Given prefix="Bambu", material="PLA", filament_name="Matte":
        1. "Bambu PLA Matte" (prefix + material + name)
        2. "Bambu PLA-Matte" (hyphenated variant)
        3. "Bambu Support Matte" (support material pattern)
        4. "Bambu Matte" (prefix + name, for names that embed material)
        5. "Bambu PLA" (just prefix + material, when name matches material)
        """
        material_upper = material.upper()
        candidates = []

        if filament_name:
            # Primary: "{prefix} {MATERIAL} {name}"
            candidates.append(f"{prefix} {material_upper} {filament_name}")

            # Hyphenated: "{prefix} {MATERIAL}-{name}" (e.g. "Bambu ASA-Aero")
            candidates.append(f"{prefix} {material_upper}-{filament_name}")

            # Support material pattern: "{prefix} Support {name}"
            # e.g. PVA/for_abs → name="for ABS" → "Bambu Support for ABS"
            if filament_name.lower().startswith("for "):
                candidates.append(f"{prefix} Support {filament_name}")

            # Without material (for names that embed material like "ABS-GF")
            candidates.append(f"{prefix} {filament_name}")

        # When filament_name is the material itself or name is empty
        if not filament_name or filament_name.upper() == material_upper:
            candidates.append(f"{prefix} {material_upper}")

        return candidates

    def _write_updates(self, results: list[MappingResult]) -> None:
        """Write slicer_settings and slicer_ids into filament.json files."""
        by_path: dict[Path, list[MappingResult]] = {}
        for r in results:
            by_path.setdefault(r.filament_path, []).append(r)

        for path, mappings in by_path.items():
            data = json.loads(path.read_text(encoding="utf-8"))

            for m in mappings:
                if "slicer_settings" not in data:
                    data["slicer_settings"] = {}
                if m.slicer not in data["slicer_settings"]:
                    data["slicer_settings"][m.slicer] = {}
                data["slicer_settings"][m.slicer]["profile_name"] = m.profile_name

                if m.slicer_id:
                    if "slicer_ids" not in data:
                        data["slicer_ids"] = {}
                    data["slicer_ids"][m.slicer] = m.slicer_id

            path.write_text(
                json.dumps(data, indent=4, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
