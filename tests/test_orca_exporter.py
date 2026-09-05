"""Tests for the OrcaSlicer filament preset mapping and exporter.

Each case pins a rule that OrcaSlicer itself imposes — the list-of-strings value
convention, the 8-character AMS filament_id cap, the low-temperature plate types
that must stay inherited — so a regression here shows up as a failing test rather
than as a preset that imports but prints wrong.
"""

import json
import zipfile

from ofd.builder.exporters.orca_exporter import export_orca
from ofd.builder.models import Database
from ofd.builder.orca_mapping import (
    ORCA_PRESET_VERSION,
    build_profile,
    resolve_base_profile,
    resolve_filament_id,
    resolve_temps,
)

BRAND = {"id": "b1", "name": "Acme", "slug": "acme"}
MATERIAL = {"id": "m1", "brand_id": "b1", "material": "PLA", "slug": "PLA"}


def filament(**overrides) -> dict:
    base = {
        "id": "f1",
        "material_id": "m1",
        "name": "Basic PLA",
        "slug": "basic_pla",
        "material": "PLA",
        "density": 1.24,
    }
    base.update(overrides)
    return base


def make_db(filaments=None, sizes=None) -> Database:
    db = Database()
    db.brands = [dict(BRAND)]
    db.materials = [dict(MATERIAL)]
    db.filaments = filaments if filaments is not None else [filament()]
    db.variants = [
        {"id": "v1", "filament_id": f["id"], "name": "Black", "slug": "black"} for f in db.filaments
    ]
    db.sizes = (
        sizes
        if sizes is not None
        else [{"id": "s1", "variant_id": "v1", "diameter": 1.75, "filament_weight": 1000}]
    )
    return db


# ---------------------------------------------------------------------------
# Base profile selection
# ---------------------------------------------------------------------------


def test_material_maps_to_generic_base():
    assert resolve_base_profile("PLA", "Basic PLA") == "Generic PLA @System"
    assert resolve_base_profile("PET", "Clear PET") == "Generic PETG @System"
    assert resolve_base_profile("PA12", "Nylon") == "Generic PA @System"


def test_material_with_no_orca_base_is_unmapped():
    """PEEK has no Generic profile in OrcaSlicer; inheriting a wrong one would
    silently hand the user another material's print behaviour."""
    assert resolve_base_profile("PEEK", "Ultra PEEK") is None
    assert resolve_base_profile("", "Whatever") is None


def test_name_refines_the_base():
    assert resolve_base_profile("PLA", "Matte PLA") == "Generic PLA Matte @System"
    assert resolve_base_profile("PLA", "Silk PLA+") == "Generic PLA Silk @System"
    assert resolve_base_profile("PLA", "PLA-CF") == "Generic PLA-CF @System"
    assert resolve_base_profile("PETG", "PETG HF") == "Generic PETG HF @System"
    assert resolve_base_profile("PP", "PP GF") == "Generic PP-GF @System"


def test_fibre_fill_wins_over_surface_finish():
    """A fill changes print behaviour far more than a finish does."""
    assert resolve_base_profile("PLA", "Matte PLA-CF") == "Generic PLA-CF @System"


def test_ppa_only_resolves_through_a_fill_refinement():
    """OrcaSlicer ships PPA-CF and PPA-GF but no unfilled Generic PPA."""
    assert resolve_base_profile("PPA", "PPA") is None
    assert resolve_base_profile("PPA", "PPA-CF") == "Generic PPA-CF @System"


def test_refinement_does_not_fire_on_a_substring():
    """'Silky' should still refine, but 'Format' must not read as 'mat'."""
    assert resolve_base_profile("PLA", "Format PLA") == "Generic PLA @System"


# ---------------------------------------------------------------------------
# filament_id
# ---------------------------------------------------------------------------


def test_filament_id_prefers_specific_over_generic():
    fil = filament(slicer_settings={"orcaslicer": {"id": "GF_ANPL", "generic_id": "GFL99"}})
    assert resolve_filament_id(fil) == "GF_ANPL"


def test_filament_id_falls_back_to_generic_then_omits():
    assert (
        resolve_filament_id(filament(slicer_settings={"orcaslicer": {"generic_id": "GFL99"}}))
        == "GFL99"
    )
    assert resolve_filament_id(filament()) is None
    assert resolve_filament_id(filament(slicer_settings={"prusaslicer": {"id": "X"}})) is None


def test_filament_id_is_never_written_into_the_preset():
    """filament_id and setting_id are system-profile metadata. A user preset
    carrying either is rejected on import — the "0 imported" failure."""
    fil = filament(slicer_settings={"orcaslicer": {"id": "GF_ANPL", "generic_id": "GFL99"}})
    profile = build_profile(BRAND, MATERIAL, fil, [1.75])
    assert "filament_id" not in profile
    assert "setting_id" not in profile
    # ...but it stays visible to the reader in the notes.
    assert "GF_ANPL" in profile["filament_notes"][0]


# ---------------------------------------------------------------------------
# Temperatures
# ---------------------------------------------------------------------------


def test_temps_derive_from_the_recommended_range():
    fil = filament(
        min_print_temperature=190,
        max_print_temperature=230,
        min_bed_temperature=50,
        max_bed_temperature=70,
    )
    assert resolve_temps(fil, MATERIAL) == {
        "nozzle": 210,
        "nozzle_initial": 210,
        "bed": 60,
        "bed_initial": 60,
    }


def test_derived_temps_round_to_the_nearest_five():
    fil = filament(min_print_temperature=205, max_print_temperature=228)
    assert resolve_temps(fil, MATERIAL)["nozzle"] == 215


def test_filament_generic_block_beats_the_material_default():
    material = dict(MATERIAL, default_slicer_settings={"generic": {"nozzle_temp": 200}})
    fil = filament(
        slicer_settings={"generic": {"nozzle_temp": 225}},
        min_print_temperature=190,
        max_print_temperature=230,
    )
    assert resolve_temps(fil, material)["nozzle"] == 225


def test_material_default_beats_the_derived_range():
    material = dict(MATERIAL, default_slicer_settings={"generic": {"bed_temp": 55}})
    fil = filament(min_bed_temperature=50, max_bed_temperature=70)
    assert resolve_temps(fil, material)["bed"] == 55


def test_unknown_temps_are_omitted_not_guessed():
    assert resolve_temps(filament(), MATERIAL) == {}


def test_first_layer_temps_fall_back_to_the_steady_state_value():
    fil = filament(slicer_settings={"generic": {"nozzle_temp": 215, "first_layer_bed_temp": 65}})
    temps = resolve_temps(fil, MATERIAL)
    assert temps["nozzle_initial"] == 215
    assert temps["bed_initial"] == 65


# ---------------------------------------------------------------------------
# Profile assembly
# ---------------------------------------------------------------------------


def test_user_preset_envelope():
    """A user preset takes a different envelope from a system profile. Getting
    this wrong is what makes OrcaSlicer report "0 imported" and explain nothing;
    the shape below matches a preset OrcaSlicer saved for itself."""
    profile = build_profile(BRAND, MATERIAL, filament(), [1.75])

    assert profile["from"] == "User"
    assert profile["name"] == "Acme Basic PLA (OFD)"
    assert profile["filament_settings_id"] == ["Acme Basic PLA (OFD)"]
    assert profile["is_custom_defined"] == "0"
    assert profile["inherits"] == "Generic PLA @System"
    assert profile["version"] == ORCA_PRESET_VERSION

    for key in ("type", "instantiation", "compatible_printers", "setting_id", "filament_id"):
        assert key not in profile, key


def test_keys_are_sorted_as_orcaslicer_writes_them():
    profile = build_profile(BRAND, MATERIAL, filament(), [1.75])
    assert list(profile) == sorted(profile)


def test_every_setting_is_a_list_of_strings():
    """OrcaSlicer stores filament settings per extruder, as arrays of strings."""
    profile = build_profile(BRAND, MATERIAL, filament(chamber_temperature=35), [1.75])
    scalar_keys = {"name", "from", "inherits", "is_custom_defined", "version"}
    for key, value in profile.items():
        if key in scalar_keys:
            assert isinstance(value, str), key
        else:
            assert isinstance(value, list), key
            assert all(isinstance(item, str) for item in value), key


def test_profile_name_carries_the_ofd_suffix():
    profile = build_profile(BRAND, MATERIAL, filament(), [1.75])
    assert profile["name"] == "Acme Basic PLA (OFD)"


def test_unmapped_material_yields_no_profile():
    material = dict(MATERIAL, material="PEEK")
    assert build_profile(BRAND, material, filament(material="PEEK"), [1.75]) is None


def test_bed_temp_never_touches_the_low_temperature_plates():
    """cool_plate and supertack_plate are low-temperature build plates; writing a
    hot material's bed temperature onto them is OrcaSlicer issue #12874."""
    fil = filament(min_bed_temperature=90, max_bed_temperature=110)
    profile = build_profile(BRAND, dict(MATERIAL, material="ABS"), fil, [1.75])
    assert profile["hot_plate_temp"] == ["100"]
    assert profile["eng_plate_temp_initial_layer"] == ["100"]
    assert "cool_plate_temp" not in profile
    assert "supertack_plate_temp" not in profile


def test_single_diameter_is_pinned():
    profile = build_profile(BRAND, MATERIAL, filament(), [1.75, 1.75])
    assert profile["filament_diameter"] == ["1.75"]


def test_mixed_diameters_leave_the_base_default_alone():
    """A line sold in both 1.75 and 2.85 cannot claim one diameter."""
    profile = build_profile(BRAND, MATERIAL, filament(), [1.75, 2.85])
    assert "filament_diameter" not in profile


def test_overrides_pass_through_and_generic_temps_win_over_them():
    """The filament schema documents generic settings as applied on top of the
    slicer-specific ones."""
    fil = filament(
        slicer_settings={
            "orcaslicer": {
                "overrides": {"filament_max_volumetric_speed": 12, "nozzle_temperature": 999}
            },
            "generic": {"nozzle_temp": 215},
        }
    )
    profile = build_profile(BRAND, MATERIAL, fil, [1.75])
    assert profile["filament_max_volumetric_speed"] == ["12"]
    assert profile["nozzle_temperature"] == ["215"]


def test_notes_name_the_inherited_base_and_the_source():
    profile = build_profile(BRAND, MATERIAL, filament(), [1.75], version="2026.09.05")
    notes = profile["filament_notes"][0]
    assert "Generic PLA @System" in notes
    assert "/api/v1/brands/acme/materials/PLA/filaments/basic_pla/index.json" in notes
    assert "2026.09.05" in notes


# ---------------------------------------------------------------------------
# Exporter
# ---------------------------------------------------------------------------


def test_export_writes_presets_bundles_and_an_index(tmp_path):
    count = export_orca(make_db(), str(tmp_path), "2026.09.05", "2026-09-05T00:00:00Z")
    assert count == 1

    preset = tmp_path / "orcaslicer/brands/acme/materials/PLA/filaments/basic_pla.json"
    assert json.loads(preset.read_text())["name"] == "Acme Basic PLA (OFD)"

    index = json.loads((tmp_path / "orcaslicer/index.json").read_text())
    assert index["profile_count"] == 1
    assert index["profiles"][0]["path"] == "brands/acme/materials/PLA/filaments/basic_pla.json"
    assert index["bundles"] == [
        {"brand_slug": "acme", "profile_count": 1, "path": "bundles/acme.zip"}
    ]

    with zipfile.ZipFile(tmp_path / "orcaslicer/bundles/acme.zip") as z:
        assert sorted(z.namelist()) == ["Acme Basic PLA (OFD).json", "README.txt"]
    with zipfile.ZipFile(tmp_path / "orcaslicer/bundles/all.zip") as z:
        assert "acme/Acme Basic PLA (OFD).json" in z.namelist()


def test_export_index_counts_match_the_files_written(tmp_path):
    filaments = [
        filament(),
        filament(id="f2", name="PEEK Pro", slug="peek_pro", material="PEEK"),
    ]
    db = make_db(filaments=filaments)
    db.materials.append({"id": "m2", "brand_id": "b1", "material": "PEEK", "slug": "PEEK"})
    db.filaments[1]["material_id"] = "m2"
    db.variants = [
        {"id": "v1", "filament_id": "f1", "name": "Black", "slug": "black"},
        {"id": "v2", "filament_id": "f2", "name": "Black", "slug": "black"},
    ]

    count = export_orca(db, str(tmp_path), "2026.09.05", "2026-09-05T00:00:00Z")

    written = list((tmp_path / "orcaslicer/brands").rglob("*.json"))
    assert count == len(written) == 1

    index = json.loads((tmp_path / "orcaslicer/index.json").read_text())
    assert index["skipped_materials"] == {"PEEK": 1}


def test_preset_filenames_survive_a_slash_in_the_product_name(tmp_path):
    """'PLA/PHA' blends are real product names and must not create directories."""
    db = make_db(filaments=[filament(name="PLA/PHA Blend")])
    export_orca(db, str(tmp_path), "2026.09.05", "2026-09-05T00:00:00Z")

    with zipfile.ZipFile(tmp_path / "orcaslicer/bundles/acme.zip") as z:
        assert "Acme PLA_PHA Blend (OFD).json" in z.namelist()
