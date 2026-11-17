"""Root-index endpoint advertising.

Every entry in `api/v1/index.json`'s `endpoints` map is a promise that the file is
there. A consumer following one to a 404 has no way to tell a build problem from a
retired endpoint, so anything conditional must be gated on having actually written it.
"""

import json
import shutil
from pathlib import Path

import jsonschema
import pytest

from ofd.builder.exporters import export_api
from ofd.builder.models import Database


def make_db():
    db = Database()
    # `origin` is required by the brands index builder.
    db.brands = [{"id": "b1", "name": "Acme", "slug": "acme", "origin": "US"}]
    db.materials = [{"id": "m1", "brand_id": "b1", "material": "PLA", "slug": "PLA"}]
    db.filaments = [{"id": "f1", "material_id": "m1", "name": "Basic", "slug": "basic"}]
    db.variants = [
        {"id": "v1", "filament_id": "f1", "name": "Black", "slug": "black", "color_hex": "#000000"}
    ]
    return db


def read_index(out_dir):
    return json.loads((out_dir / "api" / "v1" / "index.json").read_text(encoding="utf-8"))


def export(tmp_path, schemas_dir=None, reference_dir=None):
    out = tmp_path / "dist"
    export_api(
        make_db(),
        str(out),
        "2026.09.05",
        "2026-09-05T00:00:00Z",
        schemas_dir=str(schemas_dir) if schemas_dir else None,
        data_dir=str(tmp_path / "data"),
        stores_dir=str(tmp_path / "stores"),
        reference_dir=str(reference_dir) if reference_dir else None,
    )
    return out


def test_trait_rules_endpoint_is_advertised_when_the_file_is_written(tmp_path):
    schemas = tmp_path / "schemas"
    schemas.mkdir()
    (schemas / "trait_rules.json").write_text('{"version": 1, "rules": []}', encoding="utf-8")

    out = export(tmp_path, schemas)
    endpoints = read_index(out)["endpoints"]

    assert endpoints["trait_rules"] == "trait-rules.json"
    assert (out / "api" / "v1" / endpoints["trait_rules"]).exists()


def test_trait_rules_endpoint_is_absent_when_the_table_is_missing(tmp_path):
    # A schemas dir without the table — the endpoint must not be promised.
    schemas = tmp_path / "schemas"
    schemas.mkdir()

    endpoints = read_index(export(tmp_path, schemas))["endpoints"]
    assert "trait_rules" not in endpoints


def test_trait_rules_endpoint_is_absent_without_a_schemas_dir(tmp_path):
    endpoints = read_index(export(tmp_path))["endpoints"]
    assert "trait_rules" not in endpoints
    assert "schemas" not in endpoints


def test_every_advertised_relative_endpoint_resolves(tmp_path):
    schemas = tmp_path / "schemas"
    schemas.mkdir()
    (schemas / "trait_rules.json").write_text('{"version": 1, "rules": []}', encoding="utf-8")

    out = export(tmp_path, schemas)
    api_v1 = out / "api" / "v1"
    for name, target in read_index(out)["endpoints"].items():
        # Only endpoints `export_api` itself writes are in scope. A `../` target is a
        # different build step's artifact (`all` -> the JSON export, `orcaslicer` ->
        # export_orca), and a trailing slash is a directory listing.
        if target.startswith("../") or target.endswith("/"):
            continue
        assert (api_v1 / target).exists(), f"endpoint {name!r} points at a missing {target}"


REPO_SCHEMAS = Path(__file__).resolve().parent.parent / "schemas"


def reference_with(tmp_path, defaults):
    reference = tmp_path / "reference"
    reference.mkdir()
    (reference / "material_defaults.json").write_text(json.dumps(defaults), encoding="utf-8")
    return reference


def test_material_defaults_endpoint_is_advertised_when_written(tmp_path):
    schemas = tmp_path / "schemas"
    shutil.copytree(REPO_SCHEMAS, schemas)
    reference = reference_with(tmp_path, {"version": 1, "entries": []})

    out = export(tmp_path, schemas, reference)
    endpoints = read_index(out)["endpoints"]

    assert endpoints["material_defaults"] == "material-defaults.json"
    published = json.loads((out / "api" / "v1" / "material-defaults.json").read_text("utf-8"))
    assert published == {"version": 1, "entries": []}


def test_material_defaults_endpoint_is_absent_without_the_file(tmp_path):
    schemas = tmp_path / "schemas"
    shutil.copytree(REPO_SCHEMAS, schemas)
    (tmp_path / "reference").mkdir()

    endpoints = read_index(export(tmp_path, schemas, tmp_path / "reference"))["endpoints"]
    assert "material_defaults" not in endpoints


def test_invalid_material_defaults_fail_the_build(tmp_path):
    schemas = tmp_path / "schemas"
    shutil.copytree(REPO_SCHEMAS, schemas)
    # An estimate must say it is one.
    bad = {
        "version": 1,
        "entries": [
            {
                "material": "PLA",
                "virgin_kg_co2e_per_kg": 2.0,
                "recycled_kg_co2e_per_kg": None,
                "boundary": "resin_cradle_to_gate",
                "packaging_included": "no",
                "sources": [{"url": "https://example.com/", "retrieved": "2026-10-01"}],
                "kind": "manufacturer",
                "version": 1,
            }
        ],
    }
    with pytest.raises(jsonschema.ValidationError):
        export(tmp_path, schemas, reference_with(tmp_path, bad))
