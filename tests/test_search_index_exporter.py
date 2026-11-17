"""Tests for the flat global search index exporter."""

import json

from ofd.builder.exporters.search_index_exporter import (
    build_search_records,
    export_search_index,
)
from ofd.builder.models import Database


def make_db() -> Database:
    db = Database()
    db.brands = [
        {
            "id": "b1",
            "name": "Bambu Lab",
            "slug": "bambu_lab",
            "origin": "CN",
            "website": "https://bambulab.com",
        },
        # Divergent case: directory "3deksperten" but brand.json name "3DE" → slug "3de".
        {"id": "b2", "name": "3DE", "slug": "3de", "origin": "DK"},
    ]
    db.materials = [
        {"id": "m1", "brand_id": "b1", "material": "PLA", "slug": "pla"},
    ]
    db.filaments = [
        {"id": "f1", "material_id": "m1", "name": "PLA Basic", "slug": "pla_basic"},
    ]
    db.stores = [
        {
            "id": "s1",
            "name": "Bambu Store",
            "slug": "bblstore",
            "storefront_url": "https://store.bambulab.com",
            "ships_from": "CN",
            "ships_to": [],
        },
    ]
    return db


def index_by_path(records):
    return {r["path"]: r for r in records}


def test_record_count_matches_entities():
    db = make_db()
    records = build_search_records(db)
    assert len(records) == len(db.brands) + len(db.materials) + len(db.filaments) + len(db.stores)


def test_record_shape_and_hrefs():
    records = build_search_records(make_db())
    by_path = index_by_path(records)

    brand = by_path["brands/bambu_lab"]
    assert brand["type"] == "brand"
    assert brand["href"] == "/brands/bambu_lab"

    material = by_path["brands/bambu_lab/materials/pla"]
    assert material["type"] == "material"
    # Material href uses the lowercase slug (resolves to the static dir); the
    # display materialType keeps the human "PLA".
    assert material["href"] == "/brands/bambu_lab/pla"
    assert material["materialType"] == "PLA"
    assert material["brandName"] == "Bambu Lab"

    filament = by_path["brands/bambu_lab/materials/pla/filaments/pla_basic"]
    assert filament["type"] == "filament"
    assert filament["href"] == "/brands/bambu_lab/pla/pla_basic"
    assert filament["materialType"] == "PLA"
    assert filament["brandName"] == "Bambu Lab"

    store = by_path["stores/bambu_store"]
    assert store["type"] == "store"
    assert store["href"] == "/stores/bambu_store"


def test_divergent_brand_slug_uses_slug_not_directory():
    """The 3DE brand lives on disk as 3deksperten but is served under slug 3de."""
    records = build_search_records(make_db())
    by_path = index_by_path(records)
    assert "brands/3de" in by_path
    assert by_path["brands/3de"]["href"] == "/brands/3de"


def test_logo_slugs_are_attached():
    records = build_search_records(
        make_db(),
        brand_logo_id_mapping={"b1": "bambu_logo_png_abcd1234.png"},
        store_logo_id_mapping={"s1": "store_logo_jpg_deadbeef.jpg"},
    )
    by_path = index_by_path(records)
    assert by_path["brands/bambu_lab"]["logo"] == "bambu_logo_png_abcd1234.png"
    assert by_path["stores/bambu_store"]["logo"] == "store_logo_jpg_deadbeef.jpg"
    # Brand without a logo mapping omits the field.
    assert "logo" not in by_path["brands/3de"]


def test_export_writes_file(tmp_path):
    count = export_search_index(make_db(), tmp_path, "2026.06.01", "2026-06-01T00:00:00Z")
    out = tmp_path / "search-index.json"
    assert out.exists()

    data = json.loads(out.read_text(encoding="utf-8"))
    # 2 brands + 1 material + 1 filament + 1 store
    assert data["count"] == count == 5
    assert len(data["records"]) == 5
    assert data["version"] == "2026.06.01"
