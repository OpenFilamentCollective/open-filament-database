"""Tests for the Spoolman external-database exporter."""

import json

from ofd.builder.exporters.spoolman_exporter import export_spoolman
from ofd.builder.models import Database


def make_db() -> Database:
    db = Database()
    db.brands = [{"id": "b1", "name": "Acme", "slug": "acme"}]
    db.materials = [{"id": "m1", "brand_id": "b1", "material": "PLA", "slug": "PLA"}]
    db.filaments = [
        {
            "id": "f1",
            "brand_id": "b1",
            "material_id": "m1",
            "name": "Acme PLA",
            "material": "PLA",
            "density": 1.24,
            "min_print_temperature": 190,
            "max_print_temperature": 220,
            "min_bed_temperature": 0,
            "max_bed_temperature": 60,
        },
        {
            "id": "f2",
            "brand_id": "b1",
            "material_id": "m1",
            "name": "No Density PLA",
            "material": "PLA",
        },
        # Has a density, but every size is discontinued: must not influence materials.json.
        {
            "id": "f3",
            "brand_id": "b1",
            "material_id": "m1",
            "name": "Acme ABS",
            "material": "ABS",
            "density": 1.04,
            "min_print_temperature": 240,
            "max_print_temperature": 240,
        },
        # Has a density, but its only size has no diameter-complete data: also not exported.
        {
            "id": "f4",
            "brand_id": "b1",
            "material_id": "m1",
            "name": "Acme PLA Skewed",
            "material": "PLA",
            "density": 9.99,
            "min_print_temperature": 300,
            "max_print_temperature": 300,
        },
    ]
    db.variants = [
        {"id": "v1", "filament_id": "f1", "name": "Black", "color_hex": "#000000"},
        {
            "id": "v2",
            "filament_id": "f1",
            "name": "Old",
            "color_hex": "#ffffff",
            "discontinued": True,
        },
        {"id": "v3", "filament_id": "f2", "name": "Red", "color_hex": "#ff0000"},
        {
            "id": "v4",
            "filament_id": "f3",
            "name": "Gone",
            "color_hex": "#00ff00",
            "discontinued": True,
        },
        {"id": "v5", "filament_id": "f4", "name": "Partial", "color_hex": "#0000ff"},
    ]
    db.sizes = [
        {
            "id": "zzz",
            "uuid": "u-bbb",
            "variant_id": "v1",
            "diameter": 1.75,
            "filament_weight": 1000,
        },
        {
            "id": "aaa",
            "uuid": "u-ccc",
            "variant_id": "v1",
            "diameter": 2.85,
            "filament_weight": 750,
            "spool_refill": True,
        },
        {
            "id": "ddd",
            "uuid": "u-ddd",
            "variant_id": "v2",
            "diameter": 1.75,
            "filament_weight": 1000,
        },
        {
            "id": "nod",
            "uuid": "u-nod",
            "variant_id": "v3",
            "diameter": 1.75,
            "filament_weight": 1000,
        },
        {"id": "nouuid", "variant_id": "v1", "diameter": 1.75, "filament_weight": 500},
        {
            "id": "ghost1",
            "uuid": "u-g1",
            "variant_id": "v4",
            "diameter": 1.75,
            "filament_weight": 1000,
        },
        {"id": "ghost2", "uuid": "u-g2", "variant_id": "v5", "diameter": 1.75},
        {
            "id": "dangling",
            "uuid": "u-dangling",
            "variant_id": "missing",
            "diameter": 1.75,
            "filament_weight": 1000,
        },
    ]
    return db


def run(tmp_path, db=None, **kwargs):
    count = export_spoolman(
        db or make_db(), str(tmp_path), "test", "2026-01-01T00:00:00Z", **kwargs
    )
    out = tmp_path / "spoolman"
    return (
        count,
        json.loads((out / "filaments.json").read_text(encoding="utf-8")),
        json.loads((out / "materials.json").read_text(encoding="utf-8")),
    )


def test_writes_the_files_spoolman_fetches(tmp_path):
    run(tmp_path)
    assert sorted(p.name for p in (tmp_path / "spoolman").iterdir()) == [
        "README.txt",
        "filaments.json",
        "materials.json",
    ]


def test_skips_discontinued_missing_density_and_dangling(tmp_path):
    count, filaments, _ = run(tmp_path)
    assert count == len(filaments) == 2
    assert {f["id"] for f in filaments} == {"ofd_u-bbb", "ofd_u-ccc"}


def test_size_without_uuid_is_not_exported(tmp_path):
    _, filaments, _ = run(tmp_path)
    assert not any(f["weight"] == 500 for f in filaments)


def test_sorted_by_id(tmp_path):
    _, filaments, _ = run(tmp_path)
    assert [f["id"] for f in filaments] == ["ofd_u-bbb", "ofd_u-ccc"]


def test_output_is_deterministic(tmp_path):
    db = make_db()
    run(tmp_path / "one", db)
    db.sizes.reverse()
    run(tmp_path / "two", db)
    for name in ("filaments.json", "materials.json"):
        assert (tmp_path / "one" / "spoolman" / name).read_bytes() == (
            tmp_path / "two" / "spoolman" / name
        ).read_bytes()


def test_materials_derived_from_exported_filaments_only(tmp_path):
    _, _, materials = run(tmp_path)
    assert materials == [{"material": "PLA", "density": 1.24, "extruder_temp": 205, "bed_temp": 60}]


def test_refill_and_ids_in_output(tmp_path):
    _, filaments, _ = run(tmp_path)
    by_id = {f["id"]: f for f in filaments}
    assert by_id["ofd_u-ccc"]["name"] == "Black (refill)"
    assert by_id["ofd_u-ccc"]["diameter"] == 2.85
    assert by_id["ofd_u-bbb"]["name"] == "Black"


def test_long_names_are_shortened_in_output(tmp_path):
    db = make_db()
    db.variants[0]["name"] = "Neon Yellow " + "Very Long Colour Name " * 4 + "(Edition)"
    _, filaments, _ = run(tmp_path, db)
    assert filaments and all(len(f["name"]) <= 64 for f in filaments)
