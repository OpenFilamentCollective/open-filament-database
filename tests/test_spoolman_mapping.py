"""Tests for the OFD -> Spoolman mapping.

Each case pins one rule of Spoolman's ``ExternalFilament`` / ``ExternalMaterial``
model or one decision about how OFD data folds into it, so a regression shows up
as a failing test rather than as a catalog entry that quietly lies.
"""

from ofd.builder.spoolman_mapping import (
    FINISH_BY_TRAIT,
    ID_PREFIX,
    NAME_MAX_LENGTH,
    PATTERN_BY_TRAIT,
    build_filament,
    build_materials,
    display_name,
    norm,
    norm_hex,
    pick_temp,
    shorten_long_names,
    shorten_name,
)

BRAND = {"id": "b1", "name": "Acme", "slug": "acme"}


def filament(**overrides) -> dict:
    base = {
        "id": "f1",
        "brand_id": "b1",
        "name": "Acme PLA",
        "material": "PLA",
        "density": 1.24,
        "min_print_temperature": 190,
        "max_print_temperature": 220,
        "min_bed_temperature": 50,
        "max_bed_temperature": 60,
    }
    base.update(overrides)
    return base


def variant(**overrides) -> dict:
    base = {"id": "v1", "filament_id": "f1", "name": "Black", "color_hex": "#000000"}
    base.update(overrides)
    return base


def size(**overrides) -> dict:
    base = {
        "id": "s1",
        "uuid": "11111111-1111-4111-8111-111111111111",
        "variant_id": "v1",
        "diameter": 1.75,
        "filament_weight": 1000,
    }
    base.update(overrides)
    return base


def build(fil=None, var=None, siz=None, **kwargs):
    return build_filament(
        BRAND,
        fil if fil is not None else filament(),
        var if var is not None else variant(),
        siz if siz is not None else size(),
        **kwargs,
    )


# ---------------------------------------------------------------------------
# Normalisation helpers
# ---------------------------------------------------------------------------


def test_norm_keeps_plus():
    """Regression: stripping '+' made 'PETG+' indistinguishable from bare 'PETG'."""
    assert norm("PETG+") == "petg+"
    assert norm("PETG+") != norm("PETG")
    assert norm("Hello, World-1!") == "helloworld1"


def test_norm_hex_lowercases_and_strips_hash():
    assert norm_hex("#FF5733") == "ff5733"
    assert norm_hex("  #aabbccdd ") == "aabbccdd"


def test_norm_hex_discards_malformed():
    assert norm_hex("#12345") is None
    assert norm_hex("#GGGGGG") is None
    assert norm_hex("red") is None
    assert norm_hex("") is None
    assert norm_hex(None) is None


def test_pick_temp_midpoint():
    assert pick_temp(190, 220) == 205
    assert pick_temp(200, 200) == 200


def test_pick_temp_ignores_zero_bound():
    """A bed minimum of 0 means 'unheated is fine'; averaging it would give nonsense."""
    assert pick_temp(0, 60) == 60
    assert pick_temp(50, 0) == 50
    assert pick_temp(0, 0) is None
    assert pick_temp(None, None) is None
    assert pick_temp(None, 70) == 70


# ---------------------------------------------------------------------------
# Names
# ---------------------------------------------------------------------------


def test_name_strips_brand_and_bare_material():
    assert display_name("Acme PLA", "Acme", "PLA", "Red") == "Red"


def test_name_keeps_product_line():
    assert display_name("Acme PLA Matte", "Acme", "PLA", "Red") == "PLA Matte Red"


def test_petg_plus_survives():
    assert display_name("PETG+", "Acme", "PETG", "Black") == "PETG+ Black"
    assert display_name("Acme PETG+", "Acme", "PETG", "Black") == "PETG+ Black"


def test_brand_stripped_only_at_word_boundary():
    """'Acme' must not be cut out of 'Acmeflex'."""
    assert display_name("Acmeflex PLA", "Acme", "PLA", "Red") == "Acmeflex PLA Red"


def test_brand_with_digits_and_hyphen_stripped():
    assert display_name("123-3D Filament PLA", "123-3D", "PLA", "Red") == "Filament PLA Red"


def test_brand_separators_stripped():
    assert display_name("Brand - PLA", "Brand", "PLA", "Red") == "Red"
    assert display_name("Brand-PLA", "Brand", "PLA", "Red") == "Red"
    assert display_name("brand_PLA", "Brand", "PLA", "Red") == "Red"
    assert display_name("Brand", "Brand", "PLA", "Red") == "Red"


def test_bare_material_without_brand_dropped():
    assert display_name("PETG", "Acme", "PETG", "Black") == "Black"


# ---------------------------------------------------------------------------
# Whole-record mapping
# ---------------------------------------------------------------------------


def test_record_shape_and_id():
    record = build()
    assert record["id"] == f"{ID_PREFIX}11111111-1111-4111-8111-111111111111"
    assert record["manufacturer"] == "Acme"
    assert record["name"] == "Black"
    assert record["material"] == "PLA"
    assert record["density"] == 1.24
    assert record["weight"] == 1000.0
    assert record["diameter"] == 1.75
    assert record["color_hex"] == "000000"
    assert record["extruder_temp"] == 205
    assert record["bed_temp"] == 55
    assert set(record) == {
        "id",
        "manufacturer",
        "name",
        "material",
        "density",
        "weight",
        "spool_weight",
        "spool_type",
        "diameter",
        "color_hex",
        "color_hexes",
        "multi_color_direction",
        "extruder_temp",
        "bed_temp",
        "finish",
        "pattern",
        "translucent",
        "glow",
    }


def test_id_uses_canonical_uuid_not_derived_id():
    """The derived ``id`` changes when a name is fixed; the stored ``uuid`` does not."""
    record = build(siz=size(id="derived-id", uuid="canonical-uuid"))
    assert record["id"] == "ofd_canonical-uuid"
    assert "derived-id" not in record["id"]


def test_size_without_uuid_is_skipped_not_given_a_derived_id():
    assert build(siz=size(uuid=None)) is None
    assert build(siz=size(uuid="")) is None


def test_mapped_enum_values_are_valid_spoolman_enums():
    # Hard-coded from spoolman/externaldb.py (Finish, Pattern, MultiColorDirection).
    spoolman_finish = {"matte", "glossy"}
    spoolman_pattern = {"marble", "sparkle"}
    spoolman_direction = {"coaxial", "longitudinal"}
    assert set(FINISH_BY_TRAIT.values()) <= spoolman_finish
    assert set(PATTERN_BY_TRAIT.values()) <= spoolman_pattern
    everything = dict.fromkeys((*FINISH_BY_TRAIT, *PATTERN_BY_TRAIT), True)
    record = build(var=variant(traits=everything))
    assert record["finish"] in spoolman_finish
    assert record["pattern"] in spoolman_pattern
    assert record["multi_color_direction"] in spoolman_direction | {None}


MULTI = ["#FF0000", "#00ff00"]


def test_multicolour_emits_color_hexes_and_nulls_color_hex():
    record = build(var=variant(color_hex="#FF0000", color_hexes=MULTI, traits={"coextruded": True}))
    assert record["color_hexes"] == ["ff0000", "00ff00"]
    assert record["color_hex"] is None


def test_coextruded_is_coaxial():
    record = build(var=variant(color_hexes=MULTI, traits={"coextruded": True}))
    assert record["multi_color_direction"] == "coaxial"


def test_gradual_color_change_is_longitudinal():
    record = build(var=variant(color_hexes=MULTI, traits={"gradual_color_change": True}))
    assert record["multi_color_direction"] == "longitudinal"


def test_no_direction_trait_falls_back_to_first_colour():
    """Spoolman rejects multi_color_hexes without a direction, and OFD also uses the list
    for glow, thermochromic and angle-shift colours, so without a trait it is single-colour."""
    record = build(var=variant(color_hex="#FF0000", color_hexes=MULTI))
    assert record["color_hex"] == "ff0000"
    assert record["color_hexes"] is None
    assert record["multi_color_direction"] is None
    matte = build(var=variant(color_hexes=MULTI, traits={"matte": True}))
    assert matte["color_hexes"] is None
    assert matte["color_hex"] == "ff0000"


def test_both_direction_traits_fall_back_to_first_colour():
    both = {"coextruded": True, "gradual_color_change": True}
    record = build(var=variant(color_hexes=MULTI, traits=both))
    assert record["color_hex"] == "ff0000"
    assert record["color_hexes"] is None
    assert record["multi_color_direction"] is None


def test_fallback_uses_first_valid_colour():
    record = build(var=variant(color_hex="#123456", color_hexes=["oops", "#00FF00", "#0000FF"]))
    assert record["color_hex"] == "00ff00"


def test_multicolour_always_has_a_direction():
    for traits in ({"coextruded": True}, {"gradual_color_change": True}, {}):
        record = build(var=variant(color_hexes=MULTI, traits=traits))
        assert (record["color_hexes"] is None) == (record["multi_color_direction"] is None)


def test_duplicate_colours_are_kept_not_deduplicated():
    record = build(var=variant(color_hexes=["#FF0000", "#ff0000"], traits={"coextruded": True}))
    assert record["color_hexes"] == ["ff0000", "ff0000"]
    assert record["multi_color_direction"] == "coaxial"


def test_invalid_entries_dropped_and_collapse_to_single_colour():
    record = build(
        var=variant(
            color_hex="#FF0000", color_hexes=["#FF0000", "oops"], traits={"coextruded": True}
        )
    )
    assert record["color_hexes"] is None
    assert record["color_hex"] == "ff0000"
    assert record["multi_color_direction"] is None


def test_invalid_entries_filtered_but_two_valid_remain():
    record = build(
        var=variant(color_hexes=["#FF0000", "oops", "#0000FF"], traits={"coextruded": True})
    )
    assert record["color_hexes"] == ["ff0000", "0000ff"]


def test_direction_ignored_for_single_colour_variants():
    """Traits alone never produce a direction: a single colour has none."""
    record = build(var=variant(traits={"coextruded": True}))
    assert record["multi_color_direction"] is None
    assert record["color_hexes"] is None
    assert record["color_hex"] == "000000"


def test_no_invented_values():
    """Where OFD has no value the record carries null, never a guess."""
    record = build(
        fil=filament(
            min_print_temperature=None,
            max_print_temperature=None,
            min_bed_temperature=0,
            max_bed_temperature=0,
        ),
        var=variant(color_hex="not-a-colour"),
    )
    assert record["spool_weight"] is None
    assert record["spool_type"] is None
    assert record["color_hex"] is None
    assert record["color_hexes"] is None
    assert record["multi_color_direction"] is None
    assert record["extruder_temp"] is None
    assert record["bed_temp"] is None
    assert record["finish"] is None
    assert record["pattern"] is None
    assert record["translucent"] is False
    assert record["glow"] is False


def test_spool_weight_from_empty_spool_weight():
    assert build(siz=size(empty_spool_weight=216))["spool_weight"] == 216.0
    assert build(siz=size(empty_spool_weight=0))["spool_weight"] is None


def test_refill_suffix():
    assert build(siz=size(spool_refill=True))["name"] == "Black (refill)"
    assert build(siz=size(spool_refill=False))["name"] == "Black"


def test_density_required():
    assert build(fil=filament(density=None)) is None
    assert build(fil=filament(density=0)) is None


def test_weight_and_diameter_required():
    assert build(siz=size(filament_weight=None)) is None
    assert build(siz=size(diameter=None)) is None


def test_discontinued_skipped_by_default_at_every_level():
    assert build(siz=size(discontinued=True)) is None
    assert build(var=variant(discontinued=True)) is None
    assert build(fil=filament(discontinued=True)) is None


def test_discontinued_kept_on_request():
    assert build(siz=size(discontinued=True), include_discontinued=True) is not None


def test_traits_map_to_spoolman_enums():
    assert build(var=variant(traits={"matte": True}))["finish"] == "matte"
    assert build(var=variant(traits={"matte": False}))["finish"] is None
    assert build(var=variant(traits={"imitates_marble": True}))["pattern"] == "marble"
    assert build(var=variant(traits={"glitter": True}))["pattern"] == "sparkle"
    both = {"glitter": True, "imitates_marble": True}
    assert build(var=variant(traits=both))["pattern"] == "marble"
    assert build(var=variant(traits={"translucent": True}))["translucent"] is True
    assert build(var=variant(traits={"transparent": True}))["translucent"] is True
    assert build(var=variant(traits={"glow": True}))["glow"] is True
    # Traits Spoolman has no equivalent for are simply not represented.
    assert build(var=variant(traits={"silk": True}))["finish"] is None


# ---------------------------------------------------------------------------
# materials.json
# ---------------------------------------------------------------------------


def test_materials_are_medians_of_ofd_filaments():
    filaments = [
        filament(id="a", density=1.20, min_print_temperature=200, max_print_temperature=200),
        filament(id="b", density=1.24, min_print_temperature=210, max_print_temperature=210),
        filament(id="c", density=1.30, min_print_temperature=220, max_print_temperature=220),
        filament(
            id="d", material="PETG", density=1.27, min_print_temperature=0, max_print_temperature=0
        ),
    ]
    materials = build_materials(filaments)
    assert [m["material"] for m in materials] == ["PETG", "PLA"]
    pla = materials[1]
    assert pla["density"] == 1.24
    assert pla["extruder_temp"] == 210
    assert pla["bed_temp"] == 55
    # A material with no temperatures anywhere gets null, not a made-up default.
    assert materials[0]["extruder_temp"] is None
    assert materials[0]["bed_temp"] == 55


def test_materials_empty():
    assert build_materials([]) == []


# ---------------------------------------------------------------------------
# Name length
# ---------------------------------------------------------------------------


def named(record_id: str, name: str, **overrides) -> dict:
    record = {
        "id": record_id,
        "manufacturer": "Acme",
        "material": "PLA",
        "weight": 1000.0,
        "diameter": 1.75,
        "name": name,
    }
    record.update(overrides)
    return record


def test_name_limit_is_spoolmans():
    assert NAME_MAX_LENGTH == 64


def test_short_names_untouched():
    exact = "x" * NAME_MAX_LENGTH
    assert shorten_name(exact) == exact
    records = [named("a", exact), named("b", "Red")]
    assert shorten_long_names(records) == []
    assert records[0]["name"] == exact


def test_just_over_the_limit_is_shortened_to_the_limit():
    name = " ".join(["word"] * 13)  # 64 chars
    assert len(name) == 64 and shorten_name(name) == name
    over = name + "s"
    assert len(over) == 65
    assert len(shorten_name(over)) <= NAME_MAX_LENGTH


def test_trailing_parenthetical_dropped_when_it_fits_and_is_unique():
    long_name = "PLA Silk High-Speed Quadruple Twilight Glow (Black & Red & Dark Purple & Gold)"
    records = [named("a", long_name)]
    changes = shorten_long_names(records)
    assert records[0]["name"] == "PLA Silk High-Speed Quadruple Twilight Glow"
    assert changes == [
        ("a", long_name, "PLA Silk High-Speed Quadruple Twilight Glow", "parenthetical")
    ]


def test_parenthetical_not_dropped_when_it_would_collide():
    base = "PLA Matte High Speed Gradient Multi-Color"
    one = f"{base} (coffee & khaki & white & dark brown & yellow & light brown)"
    two = f"{base} (dark brown & yellow & light brown & coffee & khaki & white)"
    records = [named("a", one), named("b", two)]
    shorten_long_names(records)
    assert records[0]["name"] != records[1]["name"]
    assert all(len(r["name"]) <= NAME_MAX_LENGTH for r in records)
    assert all("…" in r["name"] for r in records)


def test_parenthetical_not_dropped_when_it_would_collide_with_a_short_record():
    long_name = "PLA Rainbow Long Product Line Name Gradient Multi-Colour Super (a & b & c & d)"
    stripped = "PLA Rainbow Long Product Line Name Gradient Multi-Colour Super"
    records = [named("a", long_name), named("b", stripped)]
    shorten_long_names(records)
    assert records[1]["name"] == stripped
    assert records[0]["name"] != stripped


def test_collision_is_judged_per_weight_and_diameter():
    long_name = "PLA Rainbow Long Product Line Name Gradient Multi-Colour Super (a & b & c & d)"
    stripped = "PLA Rainbow Long Product Line Name Gradient Multi-Colour Super"
    records = [named("a", long_name), named("b", stripped, weight=500.0)]
    shorten_long_names(records)
    assert records[0]["name"] == stripped


def test_middle_elision_keeps_start_and_trailing_colour():
    name = "Impact Abrasive Uv H2O Microbe Resistant ROSA TPU HardTech+ 83D Neon Yellow"
    assert len(name) > NAME_MAX_LENGTH
    short = shorten_name(name)
    assert len(short) <= NAME_MAX_LENGTH
    assert short.startswith("Impact Abrasive")
    assert short.endswith("Neon Yellow")
    assert short.count("…") == 1


def test_elision_is_idempotent_and_deterministic():
    name = "Impact Abrasive Uv H2O Microbe Resistant ROSA TPU HardTech+ 83D Neon Yellow"
    once = shorten_name(name)
    assert shorten_name(once) == once
    assert shorten_name(name) == once


def test_elision_of_unbroken_text_still_fits():
    short = shorten_name("x" * 200)
    assert len(short) <= NAME_MAX_LENGTH and "…" in short


def test_refill_marker_is_never_dropped_as_a_parenthetical():
    name = "PLA Silk High-Speed Quadruple Twilight Gorgeous Harmony Red (refill)"
    assert len(name) > NAME_MAX_LENGTH
    records = [named("a", name)]
    changes = shorten_long_names(records)
    assert changes[0][3] == "elided"
    assert records[0]["name"].endswith("(refill)") and len(records[0]["name"]) <= NAME_MAX_LENGTH


def test_elision_collision_shifts_the_cut_deterministically():
    names = [
        f"Impact Abrasive Uv H2O Microbe Resistant ROSA {mid} HardTech+ 83D Neon Yellow"
        for mid in ("TPU", "PLA", "ABS")
    ]
    assert len({shorten_name(n) for n in names}) == 1  # premise: plain elision collides
    forward = [named(str(i), n) for i, n in enumerate(names)]
    backward = [named(str(i), n) for i, n in reversed(list(enumerate(names)))]
    shorten_long_names(forward)
    shorten_long_names(backward)
    result = {r["id"]: r["name"] for r in forward}
    assert len(set(result.values())) == 3
    assert all("~" not in n and len(n) <= NAME_MAX_LENGTH for n in result.values())
    assert {r["id"]: r["name"] for r in backward} == result


def test_digest_tag_is_last_resort_when_no_cut_is_unique():
    names = [f"{'a' * 70}{c}{'b' * 10} Red" for c in "ABCD"]
    assert len({shorten_name(n) for n in names}) == 1
    records = [named(str(i), n) for i, n in enumerate(names)]
    shorten_long_names(records)
    result = [r["name"] for r in records]
    assert len(set(result)) == 4 and all(len(n) <= NAME_MAX_LENGTH for n in result)
    assert sum("~" in n for n in result) == 3
