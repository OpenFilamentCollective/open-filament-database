"""Tests that multi-colour variants keep every colour through the crawler.

`color_hex` stays the first colour (every existing consumer depends on that);
the full ordered list is exposed additively as `color_hexes`, only when the
source lists two or more colours.
"""

import json

import pytest

from ofd.builder.crawler import DataCrawler


def crawl_variant(tmp_path, variant_json):
    variant_dir = tmp_path / "data" / "acme" / "PLA" / "basic" / "red"
    variant_dir.mkdir(parents=True)
    (variant_dir / "variant.json").write_text(json.dumps(variant_json), encoding="utf-8")
    crawler = DataCrawler(str(tmp_path / "data"), str(tmp_path / "stores"))
    crawler._process_variant_directory(variant_dir, "11111111-1111-4111-8111-111111111111")
    assert len(crawler.db.variants) == 1
    return crawler.db.variants[0]


def test_string_color_has_no_color_hexes(tmp_path):
    variant = crawl_variant(tmp_path, {"id": "red", "name": "Red", "color_hex": "#ff0000"})
    assert variant["color_hex"] == "#FF0000"
    assert "color_hexes" not in variant


def test_single_element_array_is_a_single_colour(tmp_path):
    variant = crawl_variant(tmp_path, {"id": "red", "name": "Red", "color_hex": ["#ff0000"]})
    assert variant["color_hex"] == "#FF0000"
    assert "color_hexes" not in variant


def test_multi_element_array_keeps_order_and_normalizes(tmp_path):
    variant = crawl_variant(
        tmp_path, {"id": "red", "name": "Red", "color_hex": ["#ff0000", "00ff00", "#0F0"]}
    )
    assert variant["color_hex"] == "#FF0000"
    assert variant["color_hexes"] == ["#FF0000", "#00FF00", "#00FF00"]


def test_empty_array_falls_back_to_black_without_color_hexes(tmp_path):
    variant = crawl_variant(tmp_path, {"id": "red", "name": "Red", "color_hex": []})
    assert variant["color_hex"] == "#000000"
    assert "color_hexes" not in variant


def test_empty_entries_in_array_are_dropped_like_hex_variants(tmp_path):
    variant = crawl_variant(
        tmp_path, {"id": "red", "name": "Red", "color_hex": ["#ff0000", "", "#0000ff"]}
    )
    assert variant["color_hexes"] == ["#FF0000", "#0000FF"]


def test_unparseable_entries_pass_through_as_normalize_color_hex_does(tmp_path):
    variant = crawl_variant(
        tmp_path, {"id": "red", "name": "Red", "color_hex": ["#ff0000", "not-a-colour"]}
    )
    assert variant["color_hexes"] == ["#FF0000", "not-a-colour"]


def test_whitespace_only_entries_are_dropped_before_counting(tmp_path):
    variant = crawl_variant(tmp_path, {"id": "red", "name": "Red", "color_hex": ["#f00", "  "]})
    assert variant["color_hex"] == "#FF0000"
    assert "color_hexes" not in variant


def test_duplicates_and_order_are_preserved(tmp_path):
    variant = crawl_variant(
        tmp_path, {"id": "red", "name": "Red", "color_hex": ["#ff0000", "#0000ff", "#ff0000"]}
    )
    assert variant["color_hexes"] == ["#FF0000", "#0000FF", "#FF0000"]


def test_hex_variants_stay_separate_from_color_hexes(tmp_path):
    variant = crawl_variant(
        tmp_path,
        {
            "id": "red",
            "name": "Red",
            "color_hex": ["#ff0000", "#0000ff"],
            "hex_variants": ["#fe0000", "#0000fe"],
        },
    )
    assert variant["hex_variants"] == ["#FE0000", "#0000FE"]
    assert variant["color_hexes"] == ["#FF0000", "#0000FF"]


@pytest.mark.parametrize("hexes", [["#ff0000", "#00ff00"], ["#112233", "#445566", "#778899"]])
def test_color_hex_is_always_first_of_color_hexes(tmp_path, hexes):
    variant = crawl_variant(tmp_path, {"id": "red", "name": "Red", "color_hex": hexes})
    assert variant["color_hex"] == variant["color_hexes"][0]


def exported_multicolor_db():
    from ofd.builder.models import Database

    db = Database()
    db.brands = [{"id": "b1", "name": "Acme", "slug": "acme", "origin": "US"}]
    db.materials = [{"id": "m1", "brand_id": "b1", "material": "PLA", "slug": "PLA"}]
    db.filaments = [{"id": "f1", "material_id": "m1", "name": "Basic", "slug": "basic"}]
    db.variants = [
        {
            "id": "v1",
            "filament_id": "f1",
            "name": "Duo",
            "slug": "duo",
            "color_hex": "#FF0000",
            "color_hexes": ["#FF0000", "#0000FF"],
            "moved_from": "old/path",
        },
        {
            "id": "v2",
            "filament_id": "f1",
            "name": "Black",
            "slug": "black",
            "color_hex": "#000000",
        },
    ]
    return db


def test_json_and_api_exports_carry_color_hexes_only_where_present(tmp_path):
    from ofd.builder.exporters import export_api
    from ofd.builder.exporters.json_exporter import database_to_dict

    exported = database_to_dict(exported_multicolor_db(), "t", "now")["variants"]
    assert exported[0]["color_hexes"] == ["#FF0000", "#0000FF"]
    assert "color_hexes" not in exported[1]

    export_api(
        exported_multicolor_db(),
        str(tmp_path / "dist"),
        "t",
        "now",
        schemas_dir=None,
        data_dir=str(tmp_path / "data"),
        stores_dir=str(tmp_path / "stores"),
    )
    root = (
        tmp_path
        / "dist"
        / "api"
        / "v1"
        / "brands"
        / "acme"
        / "materials"
        / "PLA"
        / "filaments"
        / "basic"
    )
    index = {v["slug"]: v for v in json.loads((root / "index.json").read_text())["variants"]}
    assert index["duo"]["color_hexes"] == ["#FF0000", "#0000FF"]
    assert "color_hexes" not in index["black"]
    leaf = json.loads((root / "variants" / "duo.json").read_text())
    assert leaf["color_hexes"] == ["#FF0000", "#0000FF"]


def test_csv_export_adds_color_hexes_as_the_last_variant_column(tmp_path):
    import csv

    from ofd.builder.exporters.csv_exporter import export_csv

    export_csv(exported_multicolor_db(), str(tmp_path), "t", "now")
    with open(tmp_path / "csv" / "variants.csv", newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    assert list(rows[0])[-2:] == ["moved_from", "color_hexes"]
    by_slug = {r["slug"]: r for r in rows}
    assert json.loads(by_slug["duo"]["color_hexes"]) == ["#FF0000", "#0000FF"]
    assert by_slug["black"]["color_hexes"] == ""
