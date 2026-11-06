"""Sustainability schema, its cross-file $ref, and how the exporters carry it.

`sustainability` lives in schemas/sustainability_schema.json and is pulled into the
filament and variant schemas with a cross-file `$ref`, so every validator that reads
the schemas must resolve that reference.
"""

import csv
import json
import shutil
import sqlite3
from pathlib import Path

import ofd_validator
import pytest
from jsonschema import Draft7Validator

from ofd.builder.exporters import export_csv, export_sqlite
from ofd.builder.models import Database
from ofd.scripts.export_data import SchemaLoader

ROOT = Path(__file__).resolve().parent.parent
SCHEMAS = ROOT / "schemas"

SOURCE = {
    "source_type": "primary",
    "source_url": "https://blog.prusa3d.com/introducing-prusament-petg-recycled-with-calculated-life-cycle-assessment_65806/",
    "retrieved": "2026-10-21",
}

PETG_FOOTPRINT = {
    "value_kg_co2e": 5.85,
    "declared_unit": "per_kg_filament",
    "boundary": "filament_cradle_to_gate",
    "packaging_included": "unknown",
    "biogenic_carbon": "unknown",
    "recycled_allocation": "not_applicable",
    "method": "lca",
    "standard": None,
    "tool": "SimaPro 9.3.0.2",
    "practitioner": "Ing. Marie Tichá",
    "verification": "none",
    "verifier": None,
    "epd_registration_number": None,
    "publicly_available": True,
    "reference_year": 2022,
    "published": "2022-03-17",
    **SOURCE,
    "source_quote": "The results show 5.85 kg of CO2 with 1kg of pure Prusament PETG",
    "notes": None,
}

CONTAINER_DETAILS = {
    "recycled_pct": 100,
    "pct_qualifier": "exact",
    "certifications": ["FSC"],
    **SOURCE,
    "source_quote": "spool sides from a 100% recycled polycarbonate",
}


def validator(name):
    loader = SchemaLoader(SCHEMAS)
    return Draft7Validator(loader.get(name), registry=loader.registry)


def filament(**sustainability):
    return {
        "id": "petg",
        "name": "PETG",
        "density": 1.27,
        "diameter_tolerance": 0.02,
        "sustainability": sustainability,
    }


def error_messages(name, doc):
    return [e.message for e in validator(name).iter_errors(doc)]


def test_full_prusament_style_entry_is_valid():
    assert error_messages("filament", filament(carbon_footprints=[PETG_FOOTPRINT])) == []


def test_variant_accepts_sustainability_override():
    variant = {
        "id": "recycled",
        "name": "Recycled",
        "color_hex": "#556D5A",
        "traits": {"recycled": True},
        "sustainability": {
            "recycled_content": {
                "pct": 100,
                "pct_qualifier": "exact",
                "type": "post_industrial",
                "evidence": "supplier_declaration",
                **SOURCE,
                "source_quote": "Crafted from 100% recycled Prusament materials",
            }
        },
    }
    assert error_messages("variant", variant) == []


def test_unknown_enum_value_is_rejected():
    entry = {**PETG_FOOTPRINT, "boundary": "gate_to_moon"}
    assert error_messages("filament", filament(carbon_footprints=[entry]))


def test_unknown_key_is_rejected():
    # Offsets are never stored; the schema has nowhere to put them.
    entry = {**PETG_FOOTPRINT, "offset_trees": 5}
    assert error_messages("filament", filament(carbon_footprints=[entry]))


def test_missing_source_is_rejected():
    entry = {k: v for k, v in PETG_FOOTPRINT.items() if k != "source_quote"}
    assert error_messages("filament", filament(carbon_footprints=[entry]))


def test_null_pct_is_allowed_when_the_source_gives_no_number():
    content = {
        "pct": None,
        "type": "post_industrial",
        "evidence": "marketing",
        **SOURCE,
        "source_quote": "semi-finished filaments not produced as planned during manufacturing",
    }
    assert error_messages("filament", filament(recycled_content=content)) == []


def test_sizes_accept_mixed_container_and_details():
    sizes = [
        {
            "filament_weight": 1000,
            "diameter": 1.75,
            "container_material": "mixed",
            "container_details": CONTAINER_DETAILS,
        }
    ]
    assert error_messages("sizes", sizes) == []


def test_material_defaults_scaffold_is_valid():
    doc = json.loads((ROOT / "reference" / "material_defaults.json").read_text(encoding="utf-8"))
    assert doc["entries"] == []
    assert error_messages("material_defaults", doc) == []


def test_ofd_validator_resolves_the_cross_file_ref(tmp_path):
    """The Rust validator must find sustainability_schema.json for the `$ref`."""
    src = ROOT / "data" / "prusament"
    if not (src / "PETG" / "petg").exists():
        pytest.skip("prusament PETG not in data/")
    data = tmp_path / "data" / "prusament"
    data.mkdir(parents=True)
    for f in src.iterdir():
        if f.is_file():
            shutil.copy2(f, data / f.name)
    (data / "PETG").mkdir()
    shutil.copy2(src / "PETG" / "material.json", data / "PETG" / "material.json")
    shutil.copytree(src / "PETG" / "petg", data / "PETG" / "petg")

    fil = data / "PETG" / "petg" / "filament.json"
    doc = json.loads(fil.read_text(encoding="utf-8"))
    doc["sustainability"] = {"carbon_footprints": [PETG_FOOTPRINT]}
    fil.write_text(json.dumps(doc), encoding="utf-8")

    def schema_errors():
        result = ofd_validator.validate_json_files(
            str(tmp_path / "data"), str(ROOT / "stores"), str(SCHEMAS)
        )
        return [e.message for e in result.errors if "chema" in e.message]

    assert schema_errors() == []

    doc["sustainability"]["carbon_footprints"][0]["boundary"] = "gate_to_moon"
    fil.write_text(json.dumps(doc), encoding="utf-8")
    assert any("gate_to_moon" in m for m in schema_errors())


def make_db():
    db = Database()
    db.brands = [
        {
            "id": "b1",
            "name": "Acme",
            "slug": "acme",
            "origin": "US",
            "website": "https://a.co",
            "logo_name": "acme.png",
        }
    ]
    db.materials = [
        {"id": "m1", "brand_id": "b1", "material": "PETG", "slug": "PETG", "material_class": "FFF"}
    ]
    db.filaments = [
        {
            "id": "f1",
            "brand_id": "b1",
            "material_id": "m1",
            "name": "PETG",
            "slug": "petg",
            "material": "PETG",
            "density": 1.27,
            "diameter_tolerance": 0.02,
            "discontinued": False,
            "sustainability": {"carbon_footprints": [PETG_FOOTPRINT]},
        }
    ]
    db.variants = [
        {
            "id": "v1",
            "filament_id": "f1",
            "name": "Black",
            "slug": "black",
            "color_hex": "#000000",
            "discontinued": False,
            "sustainability": {"relative_claims": []},
        }
    ]
    db.sizes = [
        {
            "id": "s1",
            "variant_id": "v1",
            "filament_weight": 1000,
            "diameter": 1.75,
            "container_material": "mixed",
            "container_details": CONTAINER_DETAILS,
            "discontinued": False,
        }
    ]
    return db


def test_sqlite_stores_sustainability_as_json(tmp_path):
    export_sqlite(make_db(), str(tmp_path), "v", "now")
    conn = sqlite3.connect(tmp_path / "sqlite" / "filaments.db")
    (fil,) = conn.execute("SELECT sustainability FROM filament").fetchone()
    (var,) = conn.execute("SELECT sustainability FROM variant").fetchone()
    material, details = conn.execute(
        "SELECT container_material, container_details FROM size"
    ).fetchone()
    conn.close()

    assert json.loads(fil)["carbon_footprints"][0]["value_kg_co2e"] == 5.85
    assert json.loads(var) == {"relative_claims": []}
    assert material == "mixed"
    assert json.loads(details)["certifications"] == ["FSC"]


def test_csv_has_sustainability_columns(tmp_path):
    export_csv(make_db(), str(tmp_path), "v", "now")
    csv_dir = tmp_path / "csv"
    with open(next(csv_dir.glob("filament*.csv")), encoding="utf-8") as f:
        row = next(csv.DictReader(f))
    assert json.loads(row["sustainability"])["carbon_footprints"][0]["tool"] == "SimaPro 9.3.0.2"
    with open(next(csv_dir.glob("size*.csv")), encoding="utf-8") as f:
        assert "container_details" in next(csv.DictReader(f))


def test_a_variant_can_clear_inherited_footprints():
    assert error_messages("filament", filament(carbon_footprints=[])) == []
