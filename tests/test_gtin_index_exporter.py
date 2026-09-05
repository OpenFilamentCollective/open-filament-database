"""Tests for the barcode (GTIN/EAN/UPC) lookup index exporter (#479)."""

import json

from ofd.builder.exporters.gtin_index_exporter import build_gtin_index, export_gtin_index
from ofd.builder.models import Database
from ofd.builder.utils import normalize_gtin


def make_db(sizes):
    """A one-brand/material/filament/variant database carrying the given sizes."""
    db = Database()
    db.brands = [{"id": "b1", "name": "Polymaker", "slug": "polymaker"}]
    db.materials = [{"id": "m1", "brand_id": "b1", "material": "PETG", "slug": "PETG"}]
    db.filaments = [
        {"id": "f1", "material_id": "m1", "name": "Polylite PETG", "slug": "polylite_petg"}
    ]
    db.variants = [{"id": "v1", "filament_id": "f1", "name": "Purple", "slug": "purple"}]
    db.sizes = [{"variant_id": "v1", "filament_weight": 1000, "diameter": 1.75, **s} for s in sizes]
    return db


# --- normalize_gtin -----------------------------------------------------------


def test_upc12_ean13_and_gtin14_collapse_to_one_key():
    # The same product scanned three ways must resolve to the same entry — this is
    # the whole point of the index.
    assert normalize_gtin("012345678905") == normalize_gtin("0012345678905")
    assert normalize_gtin("012345678905") == normalize_gtin("00012345678905")
    assert normalize_gtin("012345678905") == "00012345678905"


def test_separators_are_tolerated():
    assert normalize_gtin("0 12345 67890 5") == normalize_gtin("012345678905")
    assert normalize_gtin("6938936-710103") == normalize_gtin("6938936710103")


def test_non_gtins_are_rejected_rather_than_padded():
    # A truncated or free-text value padded to 14 would collide with a real code.
    for value in (None, "", "   ", "abc", "123", "1234567", "123456789012345"):
        assert normalize_gtin(value) is None


# --- build_gtin_index ---------------------------------------------------------


def test_a_size_is_indexed_under_its_padded_code():
    index = build_gtin_index(make_db([{"gtin": "6938936710103"}]))
    assert list(index) == ["06938936710103"]
    (entry,) = index["06938936710103"]
    # The stored spelling is echoed back so a consumer can show what was typed.
    assert entry["gtin"] == "6938936710103"
    assert entry["brand_name"] == "Polymaker"
    assert entry["variant_slug"] == "purple"
    assert entry["href"] == (
        "brands/polymaker/materials/PETG/filaments/polylite_petg/variants/purple.json"
    )


def test_a_shared_code_returns_every_size():
    # 88 of the 2,595 codes in the real tree cover more than one size (up to five),
    # typically a spool and its refill; a single-object value would drop all but one.
    index = build_gtin_index(
        make_db([{"gtin": "6938936710103"}, {"gtin": "6938936710103", "spool_refill": True}])
    )
    assert len(index["06938936710103"]) == 2


def test_sizes_without_a_usable_code_are_skipped():
    # `crawler._create_size` can pass an empty-string gtin straight through.
    index = build_gtin_index(make_db([{}, {"gtin": ""}, {"gtin": "  "}, {"gtin": "nope"}]))
    assert index == {}


def test_an_orphaned_size_is_skipped_rather_than_crashing():
    db = make_db([{"gtin": "6938936710103"}])
    db.sizes.append({"variant_id": "missing", "gtin": "5901234123457"})
    assert list(build_gtin_index(db)) == ["06938936710103"]


def test_legacy_ean_needs_no_special_handling():
    # The crawler folds `ean` into `gtin` before the exporter ever sees a size, so a
    # bare `ean` key is simply not a code as far as this module is concerned.
    assert build_gtin_index(make_db([{"ean": "6938936710103"}])) == {}


# --- export_gtin_index --------------------------------------------------------


def test_export_writes_a_sorted_deterministic_artifact(tmp_path):
    out = tmp_path / "gtin-index.json"
    count = export_gtin_index(
        make_db([{"gtin": "6938936710103"}, {"gtin": "0012345678905"}]),
        out,
        "2026.09.05",
        "2026-09-05T00:00:00Z",
    )

    assert count == 2
    written = json.loads(out.read_text(encoding="utf-8"))
    assert written["version"] == "2026.09.05"
    assert written["count"] == 2
    assert list(written["codes"]) == sorted(written["codes"])
    assert all(len(k) == 14 and k.isdigit() for k in written["codes"])
