"""Mechanical schema, its cross-file $ref, and how the exporters and styler carry it.

`mechanical` lives in schemas/mechanical_schema.json and is pulled into the filament
schema with a cross-file `$ref`, like `sustainability`, so every validator that reads
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
from ofd.scripts.style_data import build_key_order_map, sanitize_data, sort_json_keys

ROOT = Path(__file__).resolve().parent.parent
SCHEMAS = ROOT / "schemas"

PAHT_CF_SHEET = "https://store.bblcdn.com/7166b20bc68f4c87b32c972b856eeb4b.pdf"

PAHT_CF_MODULUS_XY = {
    "property": "tensile_modulus",
    "direction": "XY",
    "value": 3860,
    "plus_minus": 230,
    "unit": "MPa",
    "standard": "ISO 527",
    "condition": "dry",
    "specimen": {
        "process": "printed",
        "infill_percent": 100,
        "print_temperature": 290,
        "conditioning": "annealed and dried at 80 °C for 12 h",
    },
    "source_type": "primary",
    "source_url": PAHT_CF_SHEET,
    "source_quote": "Young's Modulus (X-Y) ISO 527, GB/T 1040 3860 ± 230 MPa",
    "retrieved": "2026-11-08",
    "notes": None,
}


def validator(name):
    loader = SchemaLoader(SCHEMAS)
    return Draft7Validator(loader.get(name), registry=loader.registry)


def filament(*mechanical):
    return {
        "id": "paht_cf",
        "name": "PAHT-CF",
        "density": 1.06,
        "diameter_tolerance": 0.02,
        "mechanical": list(mechanical),
    }


def error_messages(name, doc):
    return [e.message for e in validator(name).iter_errors(doc)]


def test_full_entry_is_valid():
    assert error_messages("filament", filament(PAHT_CF_MODULUS_XY)) == []


def test_minimal_entry_is_valid():
    entry = {
        "property": "heat_deflection_045",
        "direction": "unknown",
        "value": 194,
        "unit": "°C",
        "source_type": "primary",
        "source_url": PAHT_CF_SHEET,
        "source_quote": "Heat Deflection Temperature (0.45 MPa) ISO 75 194 °C",
        "retrieved": "2026-11-08",
    }
    assert error_messages("filament", filament(entry)) == []


def test_unknown_enum_value_is_rejected():
    entry = {**PAHT_CF_MODULUS_XY, "direction": "sideways"}
    assert error_messages("filament", filament(entry))


def test_unknown_key_is_rejected():
    entry = {**PAHT_CF_MODULUS_XY, "value_converted_gpa": 3.86}
    assert error_messages("filament", filament(entry))


def test_unknown_specimen_key_is_rejected():
    entry = {**PAHT_CF_MODULUS_XY, "specimen": {"process": "printed", "colour": "black"}}
    assert error_messages("filament", filament(entry))


def test_missing_source_is_rejected():
    entry = {k: v for k, v in PAHT_CF_MODULUS_XY.items() if k != "source_quote"}
    assert error_messages("filament", filament(entry))


def test_empty_array_is_rejected():
    # Leave the field out when there is no data; an empty array says nothing.
    assert error_messages("filament", filament())


def test_variant_has_no_mechanical_field():
    variant = {
        "id": "black",
        "name": "Black",
        "color_hex": "#000000",
        "mechanical": [PAHT_CF_MODULUS_XY],
    }
    assert error_messages("variant", variant)


def test_ofd_validator_resolves_the_cross_file_ref(tmp_path):
    """The Rust validator must find mechanical_schema.json for the `$ref`."""
    src = ROOT / "data" / "bambu_lab"
    if not (src / "PA6" / "paht_cf").exists():
        pytest.skip("bambu_lab PAHT-CF not in data/")
    data = tmp_path / "data" / "bambu_lab"
    data.mkdir(parents=True)
    for f in src.iterdir():
        if f.is_file():
            shutil.copy2(f, data / f.name)
    (data / "PA6").mkdir()
    shutil.copy2(src / "PA6" / "material.json", data / "PA6" / "material.json")
    shutil.copytree(src / "PA6" / "paht_cf", data / "PA6" / "paht_cf")

    fil = data / "PA6" / "paht_cf" / "filament.json"
    doc = json.loads(fil.read_text(encoding="utf-8"))
    doc["mechanical"] = [PAHT_CF_MODULUS_XY]
    fil.write_text(json.dumps(doc), encoding="utf-8")

    def schema_errors():
        result = ofd_validator.validate_json_files(
            str(tmp_path / "data"), str(ROOT / "stores"), str(SCHEMAS)
        )
        return [e.message for e in result.errors if "chema" in e.message]

    assert schema_errors() == []

    doc["mechanical"][0]["direction"] = "sideways"
    fil.write_text(json.dumps(doc), encoding="utf-8")
    assert any("sideways" in m for m in schema_errors())


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
        {"id": "m1", "brand_id": "b1", "material": "PA6", "slug": "PA6", "material_class": "FFF"}
    ]
    db.filaments = [
        {
            "id": "f1",
            "brand_id": "b1",
            "material_id": "m1",
            "name": "PAHT-CF",
            "slug": "paht_cf",
            "material": "PA6",
            "density": 1.06,
            "diameter_tolerance": 0.02,
            "discontinued": False,
            "mechanical": [PAHT_CF_MODULUS_XY],
        }
    ]
    return db


def test_sqlite_stores_mechanical_as_json(tmp_path):
    export_sqlite(make_db(), str(tmp_path), "v", "now")
    conn = sqlite3.connect(tmp_path / "sqlite" / "filaments.db")
    (mech,) = conn.execute("SELECT mechanical FROM filament").fetchone()
    conn.close()
    assert json.loads(mech)[0]["value"] == 3860


def test_csv_has_mechanical_column(tmp_path):
    export_csv(make_db(), str(tmp_path), "v", "now")
    with open(next((tmp_path / "csv").glob("filament*.csv")), encoding="utf-8") as f:
        row = next(csv.DictReader(f))
    assert json.loads(row["mechanical"])[0]["specimen"]["infill_percent"] == 100


def test_style_orders_entry_and_specimen_keys():
    info = build_key_order_map(SCHEMAS)["filament"]
    entry = dict(reversed(list(PAHT_CF_MODULUS_XY.items())))
    entry["specimen"] = dict(reversed(list(entry["specimen"].items())))
    styled = sort_json_keys(filament(entry), info, set())["mechanical"][0]
    assert list(styled) == list(PAHT_CF_MODULUS_XY)
    assert list(styled["specimen"]) == list(PAHT_CF_MODULUS_XY["specimen"])


def test_style_strips_tracking_from_source_url():
    entry = {**PAHT_CF_MODULUS_XY, "source_url": PAHT_CF_SHEET + "?utm_source=newsletter"}
    data, changes = sanitize_data(filament(entry), "filament")
    assert data["mechanical"][0]["source_url"] == PAHT_CF_SHEET
    assert any("mechanical[0]" in c for c in changes)


def test_style_cleans_the_specimen():
    entry = {**PAHT_CF_MODULUS_XY, "specimen": {"printer": "  Bambu X1C ", "conditioning": ""}}
    data, changes = sanitize_data(filament(entry), "filament")
    assert data["mechanical"][0]["specimen"] == {"printer": "Bambu X1C"}
    assert "mechanical[0].specimen.conditioning: removed empty string" in changes
