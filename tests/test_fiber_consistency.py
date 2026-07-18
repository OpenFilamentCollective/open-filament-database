"""Tests for the carbon-fiber / glass-fiber consistency validation."""

import json

from ofd.validation.fiber_consistency import (
    CARBON_FIBER_TRAIT,
    GLASS_FIBER_TRAIT,
    check_fiber_consistency,
)


def make_filament(data_dir, variants, brand="acme", material="PA6", filament="pa6_x"):
    """Create data/<brand>/<material>/<filament>/<variant>/variant.json for each
    variant dict {name, traits?}. Returns the data dir."""
    fil_dir = data_dir / brand / material / filament
    fil_dir.mkdir(parents=True)
    for v in variants:
        vdir = fil_dir / v["name"]
        vdir.mkdir()
        obj = {"id": v["name"], "name": v["name"], "color_hex": "#000000"}
        if "traits" in v:
            obj["traits"] = v["traits"]
        (vdir / "variant.json").write_text(json.dumps(obj), encoding="utf-8")
    return data_dir


def test_no_errors_for_consistent_carbon_filament(tmp_path):
    data = tmp_path / "data"
    make_filament(
        data,
        [
            {"name": "black", "traits": {CARBON_FIBER_TRAIT: True, "abrasive": True}},
            {"name": "blue", "traits": {CARBON_FIBER_TRAIT: True, "abrasive": True}},
        ],
    )
    assert check_fiber_consistency(data) == []


def test_no_errors_for_plain_filament(tmp_path):
    data = tmp_path / "data"
    make_filament(data, [{"name": "black"}, {"name": "white", "traits": {"high_flow": True}}])
    assert check_fiber_consistency(data) == []


def test_flags_filament_mixing_cf_and_gf_across_variants(tmp_path):
    data = tmp_path / "data"
    make_filament(
        data,
        [
            {"name": "black", "traits": {CARBON_FIBER_TRAIT: True}},
            {"name": "natural", "traits": {GLASS_FIBER_TRAIT: True}},
        ],
    )
    errors = check_fiber_consistency(data)
    assert len(errors) == 1
    msg = errors[0].message
    assert "mixes carbon fiber" in msg
    assert "black" in msg and "natural" in msg


def test_flags_single_variant_carrying_both_fibers(tmp_path):
    data = tmp_path / "data"
    make_filament(
        data,
        [{"name": "weird", "traits": {CARBON_FIBER_TRAIT: True, GLASS_FIBER_TRAIT: True}}],
    )
    errors = check_fiber_consistency(data)
    assert len(errors) == 1
    assert "both carbon fiber and glass fiber" in errors[0].message


def test_only_true_traits_count(tmp_path):
    data = tmp_path / "data"
    # Glass trait explicitly false must not be treated as present.
    make_filament(
        data,
        [
            {"name": "black", "traits": {CARBON_FIBER_TRAIT: True, GLASS_FIBER_TRAIT: False}},
            {"name": "blue", "traits": {CARBON_FIBER_TRAIT: True}},
        ],
    )
    assert check_fiber_consistency(data) == []


def test_conflicts_are_isolated_per_filament(tmp_path):
    data = tmp_path / "data"
    # A CF filament and a separate GF filament under the same material is fine.
    make_filament(
        data, [{"name": "black", "traits": {CARBON_FIBER_TRAIT: True}}], filament="pa6_cf"
    )
    make_filament(data, [{"name": "black", "traits": {GLASS_FIBER_TRAIT: True}}], filament="pa6_gf")
    assert check_fiber_consistency(data) == []


def test_missing_data_dir_returns_no_errors(tmp_path):
    assert check_fiber_consistency(tmp_path / "does_not_exist") == []
