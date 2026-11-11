"""Tests for the data-quality validation rules.

Each rule is anchored to the submission that motivated it, so a regression is
traceable back to the review comment it was meant to make unnecessary.
"""

import json

from ofd.validation.data_quality import CATEGORY, check_data_quality


def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj), encoding="utf-8")


def build(
    data_dir,
    *,
    brand="acme",
    material="PLA",
    filament="basic",
    filament_extra=None,
    variants=(),
):
    """Lay out data/<brand>/<material>/<filament>/<variant>/{variant,sizes}.json.

    `variants` items are dicts: {id, name?, traits?, sustainability?, sizes?}.
    """
    fil_dir = data_dir / brand / material / filament
    write(data_dir / brand / "brand.json", {"id": brand, "name": brand.title()})
    write(data_dir / brand / material / "material.json", {"material": material})

    filament_obj = {"id": filament, "name": filament.replace("_", " ").title()}
    filament_obj.update(filament_extra or {})
    write(fil_dir / "filament.json", filament_obj)

    for v in variants:
        vdir = fil_dir / v["id"]
        variant_obj = {
            "id": v["id"],
            "name": v.get("name", v["id"]),
            "color_hex": "#000000",
        }
        if "traits" in v:
            variant_obj["traits"] = v["traits"]
        if "sustainability" in v:
            variant_obj["sustainability"] = v["sustainability"]
        write(vdir / "variant.json", variant_obj)
        write(
            vdir / "sizes.json",
            v.get("sizes", [{"filament_weight": 1000, "diameter": 1.75}]),
        )

    return data_dir


def messages(errors, needle):
    return [e for e in errors if needle in e.message]


def test_clean_data_has_no_findings(tmp_path):
    data = build(
        tmp_path / "data",
        variants=[{"id": "black", "name": "Black"}, {"id": "red", "name": "Red"}],
    )
    assert check_data_quality(data) == []


def test_missing_data_dir_is_not_an_error(tmp_path):
    assert check_data_quality(tmp_path / "nope") == []


def test_every_finding_is_tagged_with_the_category(tmp_path):
    data = build(
        tmp_path / "data",
        filament_extra={"certifications": [""]},
        variants=[{"id": "black", "name": "Black"}],
    )
    findings = check_data_quality(data)
    assert findings
    assert all(e.category == CATEGORY for e in findings)


# --- placeholder_value (#453: `certifications: [""]`) -------------------------


def test_empty_string_in_an_array_is_an_error(tmp_path):
    data = build(
        tmp_path / "data",
        filament_extra={"certifications": [""]},
        variants=[{"id": "black", "name": "Black"}],
    )
    found = messages(check_data_quality(data), "is blank")
    assert len(found) == 1
    assert "certifications[0]" in found[0].message
    assert found[0].level.value == "ERROR"


def test_an_empty_array_is_fine(tmp_path):
    data = build(
        tmp_path / "data",
        filament_extra={"certifications": []},
        variants=[{"id": "black", "name": "Black"}],
    )
    assert messages(check_data_quality(data), "is blank") == []


def test_whitespace_only_string_is_an_error(tmp_path):
    """A blank-looking value is as meaningless as ``""`` — and the webui flags it too."""
    data = build(
        tmp_path / "data",
        filament_extra={"certifications": ["   "]},
        variants=[{"id": "black", "name": "Black"}],
    )
    found = messages(check_data_quality(data), "is blank")
    assert len(found) == 1
    assert "certifications[0]" in found[0].message


def test_empty_string_nested_in_a_purchase_link_is_found(tmp_path):
    data = build(
        tmp_path / "data",
        variants=[
            {
                "id": "black",
                "name": "Black",
                "sizes": [
                    {
                        "filament_weight": 1000,
                        "diameter": 1.75,
                        "purchase_links": [{"store_id": "shop", "url": ""}],
                    }
                ],
            }
        ],
    )
    found = messages(check_data_quality(data), "is blank")
    assert len(found) == 1
    assert "purchase_links[0].url" in found[0].message


def test_na_stand_in_is_a_placeholder(tmp_path):
    """#502 shipped ``certifications: ["NA"]`` — a certification called "NA"."""
    data = build(
        tmp_path / "data",
        filament_extra={"certifications": ["NA", "CE"]},
        variants=[{"id": "black", "name": "Black"}],
    )
    found = messages(check_data_quality(data), "is a placeholder")
    assert len(found) == 1
    assert "certifications[0]" in found[0].message
    assert "'NA'" in found[0].message
    assert found[0].level.value == "ERROR"


def test_words_merely_containing_na_are_not_placeholders(tmp_path):
    data = build(
        tmp_path / "data",
        filament_extra={"certifications": ["NANO", "UL 94"]},
        variants=[{"id": "black", "name": "Black"}],
    )
    assert messages(check_data_quality(data), "placeholder") == []


# --- purchase_link_storefront_root (#454) -------------------------------------


def _sizes_with_link(url):
    return [
        {
            "filament_weight": 1000,
            "diameter": 1.75,
            "purchase_links": [{"store_id": "shop", "url": url}],
        }
    ]


def test_storefront_root_link_is_an_error(tmp_path):
    data = build(
        tmp_path / "data",
        variants=[
            {
                "id": "black",
                "name": "Black",
                "sizes": _sizes_with_link("https://store.bambulab.com/"),
            }
        ],
    )
    found = messages(check_data_quality(data), "storefront root")
    assert len(found) == 1
    assert found[0].level.value == "ERROR"


# --- inverted_range (#767: min/max fan speed and drying temperature) ----------


def test_min_above_max_is_an_error(tmp_path):
    data = build(
        tmp_path / "data",
        filament_extra={"min_fan_speed": 80, "max_fan_speed": 20},
        variants=[{"id": "black", "name": "Black"}],
    )
    found = messages(check_data_quality(data), "'min_fan_speed' (80) is greater than")
    assert len(found) == 1
    assert found[0].level.value == "ERROR"


def test_product_page_link_is_fine(tmp_path):
    for url in (
        "https://store.bambulab.com/products/pla-basic",
        "https://shop.example.com/?product=123",
    ):
        data = build(
            tmp_path / "data",
            variants=[{"id": "black", "name": "Black", "sizes": _sizes_with_link(url)}],
        )
        assert messages(check_data_quality(data), "storefront root") == [], url


def test_dry_temperature_above_its_maximum_is_an_error(tmp_path):
    data = build(
        tmp_path / "data",
        filament_extra={"dry_temperature": 90, "max_dry_temperature": 60},
        variants=[{"id": "black", "name": "Black"}],
    )
    assert len(messages(check_data_quality(data), "'dry_temperature' (90)")) == 1


def test_equal_or_one_sided_ranges_are_fine(tmp_path):
    data = build(
        tmp_path / "data",
        filament_extra={"min_fan_speed": 50, "max_fan_speed": 50, "dry_temperature": 55},
        variants=[{"id": "black", "name": "Black"}],
    )
    assert messages(check_data_quality(data), "is greater than") == []


# --- name_whitespace (#460: a filament literally named "Silk ") ---------------


def test_trailing_whitespace_in_a_name_is_an_error(tmp_path):
    data = build(
        tmp_path / "data",
        filament_extra={"name": "Silk "},
        variants=[{"id": "black", "name": "Black"}],
    )
    found = messages(check_data_quality(data), "leading or trailing whitespace")
    assert len(found) == 1
    assert found[0].level.value == "ERROR"


def test_repeated_whitespace_in_a_name_is_an_error(tmp_path):
    data = build(
        tmp_path / "data",
        variants=[{"id": "sky_blue", "name": "Sky  Blue"}],
    )
    found = messages(check_data_quality(data), "repeated whitespace")
    assert len(found) == 1


def test_a_single_internal_space_is_fine(tmp_path):
    data = build(tmp_path / "data", variants=[{"id": "sky_blue", "name": "Sky Blue"}])
    assert messages(check_data_quality(data), "whitespace") == []


# --- duplicate_size_entry (#453) ----------------------------------------------


def test_identical_size_rows_are_an_error(tmp_path):
    data = build(
        tmp_path / "data",
        variants=[
            {
                "id": "black",
                "name": "Black",
                "sizes": [
                    {"filament_weight": 1000, "diameter": 1.75},
                    {"filament_weight": 1000, "diameter": 1.75},
                ],
            }
        ],
    )
    found = messages(check_data_quality(data), "adds nothing over size")
    assert len(found) == 1
    assert found[0].level.value == "ERROR"


def test_a_row_that_only_omits_fields_is_still_redundant(tmp_path):
    # The polylite / sunlu shape: the same spool listed again with less detail.
    data = build(
        tmp_path / "data",
        variants=[
            {
                "id": "black",
                "name": "Black",
                "sizes": [
                    {
                        "filament_weight": 5000,
                        "diameter": 1.75,
                        "empty_spool_weight": 819,
                    },
                    {"filament_weight": 5000, "diameter": 1.75},
                ],
            }
        ],
    )
    assert len(messages(check_data_quality(data), "adds nothing over size")) == 1


def test_rows_distinguished_by_a_gtin_are_kept(tmp_path):
    data = build(
        tmp_path / "data",
        variants=[
            {
                "id": "black",
                "name": "Black",
                "sizes": [
                    {"filament_weight": 1000, "diameter": 1.75, "gtin": "012345678905"},
                    {"filament_weight": 1000, "diameter": 1.75, "gtin": "012345678912"},
                ],
            }
        ],
    )
    assert messages(check_data_quality(data), "adds nothing over size") == []


def test_a_spool_is_not_redundant_to_its_refill(tmp_path):
    # Same weight and diameter; only the container tells the refill apart, whether
    # recorded as container_material or the deprecated spool_refill.
    for refill in ({"container_material": "refill"}, {"spool_refill": True}):
        data = build(
            tmp_path / "data" / str(len(refill)),
            variants=[
                {
                    "id": "black",
                    "name": "Black",
                    "sizes": [
                        {"filament_weight": 1000, "diameter": 1.75, **refill},
                        {"filament_weight": 1000, "diameter": 1.75},
                    ],
                }
            ],
        )
        assert messages(check_data_quality(data), "adds nothing over size") == []


def test_different_diameters_are_not_duplicates(tmp_path):
    data = build(
        tmp_path / "data",
        variants=[
            {
                "id": "black",
                "name": "Black",
                "sizes": [
                    {"filament_weight": 1000, "diameter": 1.75},
                    {"filament_weight": 1000, "diameter": 2.85},
                ],
            }
        ],
    )
    assert messages(check_data_quality(data), "adds nothing over size") == []


def test_a_differing_uuid_does_not_make_a_row_distinct(tmp_path):
    # Every real duplicate in the dataset carries its own UUID; identity fields must
    # not be what tells two rows apart.
    data = build(
        tmp_path / "data",
        variants=[
            {
                "id": "black",
                "name": "Black",
                "sizes": [
                    {"uuid": "a" * 8, "filament_weight": 1000, "diameter": 1.75},
                    {"uuid": "b" * 8, "filament_weight": 1000, "diameter": 1.75},
                ],
            }
        ],
    )
    assert len(messages(check_data_quality(data), "adds nothing over size")) == 1


def test_only_one_finding_per_redundant_row(tmp_path):
    data = build(
        tmp_path / "data",
        variants=[
            {
                "id": "black",
                "name": "Black",
                "sizes": [
                    {"filament_weight": 1000, "diameter": 1.75},
                    {"filament_weight": 1000, "diameter": 1.75},
                    {"filament_weight": 1000, "diameter": 1.75},
                ],
            }
        ],
    )
    # Rows 2 and 3 each report once, against the first row they duplicate.
    assert len(messages(check_data_quality(data), "adds nothing over size")) == 2


# --- name_casing (#451, #452) -------------------------------------------------


def test_lowercase_name_among_title_case_siblings_warns(tmp_path):
    data = build(
        tmp_path / "data",
        variants=[
            {"id": "purple", "name": "Purple"},
            {"id": "transparent", "name": "Transparent"},
            {"id": "translucent_blue", "name": "translucent blue"},
        ],
    )
    found = messages(check_data_quality(data), "is lowercase while its siblings")
    assert len(found) == 1
    assert "translucent blue" in found[0].message
    assert found[0].level.value == "WARNING"


def test_all_lowercase_siblings_are_left_alone(tmp_path):
    # No sibling establishes Title Case, so there is no house style to diverge from.
    data = build(
        tmp_path / "data",
        variants=[
            {"id": "black", "name": "black"},
            {"id": "blue", "name": "blue"},
        ],
    )
    assert messages(check_data_quality(data), "is lowercase while") == []


def test_minor_words_do_not_break_title_case_detection(tmp_path):
    data = build(
        tmp_path / "data",
        variants=[
            {"id": "black_and_white", "name": "Black and White"},
            {"id": "red", "name": "red"},
        ],
    )
    assert len(messages(check_data_quality(data), "is lowercase while")) == 1


def test_casing_is_scoped_to_siblings_not_the_whole_brand(tmp_path):
    data = tmp_path / "data"
    build(data, filament="basic", variants=[{"id": "black", "name": "Black"}])
    build(data, filament="matte", variants=[{"id": "red", "name": "red"}])
    # 'red' has no Title Case sibling inside `matte`, so it is not reported.
    assert messages(check_data_quality(data), "is lowercase while") == []


# --- fiber_trait_missing (#450) -----------------------------------------------


def test_carbon_fiber_name_without_traits_warns(tmp_path):
    data = build(
        tmp_path / "data",
        filament="pla_cf",
        variants=[{"id": "carbon_fiber_blue", "name": "carbon fiber blue"}],
    )
    found = messages(check_data_quality(data), "traits are not set")
    assert len(found) == 1
    assert "contains_carbon_fiber" in found[0].message
    assert "abrasive" in found[0].message
    assert found[0].level.value == "WARNING"


def test_carbon_fiber_name_with_traits_is_clean(tmp_path):
    data = build(
        tmp_path / "data",
        filament="pla_cf",
        variants=[
            {
                "id": "carbon_fiber_blue",
                "name": "carbon fiber blue",
                "traits": {"contains_carbon_fiber": True, "abrasive": True},
            }
        ],
    )
    assert messages(check_data_quality(data), "traits are not set") == []


def test_fiber_code_on_the_filament_applies_to_its_variants(tmp_path):
    data = build(
        tmp_path / "data",
        filament="pa6_gf",
        variants=[{"id": "black", "name": "Black"}],
    )
    found = messages(check_data_quality(data), "traits are not set")
    assert len(found) == 1
    assert "contains_glass_fiber" in found[0].message


def test_a_plain_name_needs_no_fiber_traits(tmp_path):
    data = build(tmp_path / "data", variants=[{"id": "black", "name": "Black"}])
    assert messages(check_data_quality(data), "traits are not set") == []


# --- name_leading_case --------------------------------------------------------


def test_lowercase_leading_name_warns(tmp_path):
    data = build(tmp_path / "data", variants=[{"id": "yellow", "name": "yellow"}])
    found = messages(check_data_quality(data), "starts with a lowercase letter")
    assert len(found) == 1
    assert found[0].level.value == "WARNING"
    assert "'Yellow'" in found[0].message


def test_only_the_first_letter_is_changed(tmp_path):
    # Title-casing the rest would rewrite the manufacturer's own styling.
    data = build(tmp_path / "data", variants=[{"id": "easy_petg", "name": "easy PETG"}])
    found = messages(check_data_quality(data), "starts with a lowercase letter")
    assert len(found) == 1
    assert "'Easy PETG'" in found[0].message


def test_intercapped_brand_styling_is_left_alone(tmp_path):
    for name in ("eSUN 3D", "iSANMATE", "rPLA pro", "rPETG", "ePAHT-CF"):
        data = build(tmp_path / name.replace(" ", "_"), variants=[{"id": "x", "name": name}])
        assert messages(check_data_quality(data), "starts with a lowercase letter") == []


def test_leading_digit_is_skipped_to_reach_the_first_letter(tmp_path):
    data = build(tmp_path / "data", variants=[{"id": "3d_gold", "name": "3d gold"}])
    found = messages(check_data_quality(data), "starts with a lowercase letter")
    assert len(found) == 1
    assert "'3D gold'" in found[0].message


def test_non_ascii_capitalised_name_is_left_alone(tmp_path):
    """data/ambrosia/ABS/uber is really named "Über ABS".

    Mirrors the webui check: an ASCII-only letter test would skip the "Ü", find the
    "b" and "fix" a real filament into "ÜBer ABS".
    """
    for name in ("Über ABS", "Ökofil", "Éclat Silk"):
        data = build(tmp_path / name.replace(" ", "_"), variants=[{"id": "x", "name": name}])
        assert messages(check_data_quality(data), "starts with a lowercase letter") == []


def test_genuinely_lowercase_non_ascii_name_still_warns(tmp_path):
    data = build(tmp_path / "data", variants=[{"id": "uber", "name": "über abs"}])
    found = messages(check_data_quality(data), "starts with a lowercase letter")
    assert len(found) == 1
    assert "'Über abs'" in found[0].message


def test_caseless_leading_character_is_no_evidence(tmp_path):
    data = build(tmp_path / "data", variants=[{"id": "tokyo", "name": "東京 Black"}])
    assert messages(check_data_quality(data), "starts with a lowercase letter") == []


def test_capitalised_name_is_clean(tmp_path):
    data = build(tmp_path / "data", variants=[{"id": "black", "name": "Galaxy Black"}])
    assert messages(check_data_quality(data), "starts with a lowercase letter") == []


# --- orphan_filament (#461) ---------------------------------------------------


def test_filament_with_no_variants_warns(tmp_path):
    data = build(tmp_path / "data", filament="silk_blue_green", variants=[])
    found = messages(check_data_quality(data), "has no colours yet")
    assert len(found) == 1
    assert found[0].level.value == "WARNING"


def test_filament_with_a_variant_is_clean(tmp_path):
    data = build(tmp_path / "data", variants=[{"id": "black", "name": "Black"}])
    assert messages(check_data_quality(data), "has no colours yet") == []


# --- sibling_near_duplicate ---------------------------------------------------


def test_word_order_duplicate_filaments_warn(tmp_path):
    data = tmp_path / "data"
    build(data, filament="cf_pla", variants=[{"id": "black", "name": "Black"}])
    build(data, filament="pla_cf", variants=[{"id": "black", "name": "Black"}])
    found = messages(check_data_quality(data), "word-order duplicate")
    assert len(found) == 1
    assert found[0].level.value == "WARNING"


def test_word_order_duplicate_variants_warn(tmp_path):
    data = build(
        tmp_path / "data",
        variants=[
            {"id": "blue_green_orange", "name": "Blue Green Orange"},
            {"id": "orange_blue_green", "name": "Orange Blue Green"},
        ],
    )
    assert len(messages(check_data_quality(data), "word-order duplicate")) == 1


def test_genuinely_different_siblings_are_not_duplicates(tmp_path):
    data = build(
        tmp_path / "data",
        variants=[
            {"id": "sky_blue", "name": "Sky Blue"},
            {"id": "navy_blue", "name": "Navy Blue"},
        ],
    )
    assert messages(check_data_quality(data), "word-order duplicate") == []


# --- shared trait-rule table --------------------------------------------------


def test_trait_rules_load_and_reference_real_traits():
    """`schemas/trait_rules.json` is decoupled from the schema defining traits.

    That decoupling is deliberate — a rule maps a name to trait keys and says nothing
    about which entity carries them, so it survives traits moving to the filament —
    but it means nothing structurally stops a typo'd key from silently suggesting a
    trait that does not exist. This is that check.
    """
    import json
    from pathlib import Path

    from ofd.scripts.apply_fiber_traits import SCHEMAS_DIR, load_trait_rules

    rules = load_trait_rules()
    assert rules, "trait_rules.json should load"

    schema = json.loads((Path(SCHEMAS_DIR) / "variant_schema.json").read_text(encoding="utf-8"))
    known = set(schema["properties"]["traits"]["properties"])
    for rule in rules:
        for trait in rule.traits:
            assert trait in known, f"rule {rule.id!r} names unknown trait {trait!r}"


def test_only_definitional_rules_are_enforced():
    """The soft appearance rules must stay suggestion-only.

    They sit at 70-85% precision, which is fine for a chip the user clicks and wrong
    for a validation warning or an automatic write.
    """
    from ofd.scripts.apply_fiber_traits import VALIDATE, load_trait_rules

    enforced = [r.id for r in load_trait_rules() if VALIDATE in r.applies_to]
    assert enforced == ["carbon_fiber", "glass_fiber", "high_flow"]


def _brand(data_dir, brand, parent=None):
    obj = {"id": brand, "name": brand.title()}
    if parent:
        obj["parent_brand"] = parent
    write(data_dir / brand / "brand.json", obj)


def test_parent_brand_must_exist(tmp_path):
    data = tmp_path / "data"
    _brand(data, "polymaker")
    _brand(data, "panchroma", "polymaker")
    _brand(data, "fiberon", "polymakr")
    found = messages(check_data_quality(data), "parent_brand")
    assert [e.message for e in found] == [
        "parent_brand 'polymakr' is not a brand folder under data/"
    ]
    assert found[0].level.value == "ERROR"


def test_parent_brand_cannot_be_itself_or_a_cycle(tmp_path):
    data = tmp_path / "data"
    _brand(data, "solo", "solo")
    _brand(data, "a", "b")
    _brand(data, "b", "a")
    found = messages(check_data_quality(data), "parent_brand")
    assert sorted(e.message for e in found) == [
        "parent_brand forms a cycle through 'a'",
        "parent_brand forms a cycle through 'b'",
        "parent_brand names the brand itself",
    ]


# --- Sustainability data --------------------------------------------------------
#
# The sourcing rules from the sustainability brief: copy, never compute.

SOURCE = {
    "source_type": "primary",
    "source_url": "https://blog.prusa3d.com/introducing-prusament-petg-recycled/",
    "retrieved": "2026-10-21",
}


def footprint(value, quote, **extra):
    return {
        "value_kg_co2e": value,
        "declared_unit": "per_kg_filament",
        "boundary": "filament_cradle_to_gate",
        "packaging_included": "unknown",
        "biogenic_carbon": "unknown",
        "recycled_allocation": "not_applicable",
        "method": "lca",
        "verification": "none",
        "publicly_available": True,
        **SOURCE,
        "source_quote": quote,
        **extra,
    }


def recycled(pct, quote="made from 100% recycled material", **extra):
    return {
        "pct": pct,
        "type": "post_industrial",
        "evidence": "supplier_declaration",
        **SOURCE,
        "source_quote": quote,
        **extra,
    }


def sustainability_errors(tmp_path, *, filament=None, variant=None, traits=None, sizes=None):
    v = {"id": "black", "name": "Black"}
    if variant is not None:
        v["sustainability"] = variant
    if traits is not None:
        v["traits"] = traits
    if sizes is not None:
        v["sizes"] = sizes
    extra = {"sustainability": filament} if filament is not None else None
    data = build(tmp_path / "data", filament_extra=extra, variants=[v])
    return check_data_quality(data)


def test_sourced_footprint_passes(tmp_path):
    quote = "The results show 5.85 kg of CO2 with 1kg of pure Prusament PETG"
    errors = sustainability_errors(
        tmp_path, filament={"carbon_footprints": [footprint(5.85, quote)]}
    )
    assert errors == []


def test_quote_with_decimal_comma_passes(tmp_path):
    errors = sustainability_errors(
        tmp_path, filament={"carbon_footprints": [footprint(5.85, "5,85 kg CO2e")]}
    )
    assert messages(errors, "does not contain that number") == []


def test_quote_missing_the_number_is_an_error(tmp_path):
    errors = sustainability_errors(
        tmp_path, filament={"carbon_footprints": [footprint(5.85, "about six kilograms")]}
    )
    found = messages(errors, "does not contain that number")
    assert len(found) == 1
    assert found[0].level.value == "ERROR"


def test_number_inside_a_longer_number_does_not_count(tmp_path):
    errors = sustainability_errors(
        tmp_path, filament={"carbon_footprints": [footprint(5.85, "15.85 kg of CO2")]}
    )
    assert len(messages(errors, "does not contain that number")) == 1


def test_missing_source_fields_are_an_error(tmp_path):
    entry = footprint(5.85, "5.85 kg")
    del entry["source_url"]
    entry["retrieved"] = ""
    errors = sustainability_errors(tmp_path, filament={"carbon_footprints": [entry]})
    found = messages(errors, "is missing source_url, retrieved")
    assert len(found) == 1
    assert found[0].level.value == "ERROR"


def test_future_dates_are_an_error(tmp_path):
    entry = footprint(5.85, "5.85 kg", published="2999-01-01", reference_year=2999)
    entry["retrieved"] = "2999-01-02"
    errors = sustainability_errors(tmp_path, filament={"carbon_footprints": [entry]})
    assert len(messages(errors, "is in the future")) == 3


def test_pct_out_of_range_is_an_error(tmp_path):
    errors = sustainability_errors(
        tmp_path,
        filament={"recycled_content": recycled(120, "120% recycled")},
        traits={"recycled": True},
    )
    assert len(messages(errors, "between 0 and 100")) == 1


def test_recycled_pct_without_trait_is_an_error(tmp_path):
    errors = sustainability_errors(tmp_path, filament={"recycled_content": recycled(100)})
    found = messages(errors, "traits.recycled is not set")
    assert len(found) == 1
    assert found[0].level.value == "ERROR"


def test_recycled_pct_with_trait_passes(tmp_path):
    errors = sustainability_errors(
        tmp_path, filament={"recycled_content": recycled(100)}, traits={"recycled": True}
    )
    assert errors == []


def test_unknown_recycled_pct_does_not_require_trait(tmp_path):
    errors = sustainability_errors(
        tmp_path, filament={"recycled_content": recycled(None, "made from recycled scrap")}
    )
    assert messages(errors, "traits.recycled") == []


def test_variant_override_replaces_filament_recycled_content(tmp_path):
    # The filament says 100% recycled, but this variant overrides it with 0%,
    # so the variant needs no trait for the forward rule.
    errors = sustainability_errors(
        tmp_path,
        filament={"recycled_content": recycled(100)},
        variant={"recycled_content": recycled(0, "contains 0% recycled material")},
    )
    assert messages(errors, "traits.recycled is not set") == []


def test_trait_without_any_sustainability_block_is_silent(tmp_path):
    # 265 variants carry the trait before any brand has been researched.
    errors = sustainability_errors(tmp_path, traits={"recycled": True})
    assert messages(errors, "no recycled_content") == []


def test_trait_without_recycled_content_warns_once_block_exists(tmp_path):
    errors = sustainability_errors(
        tmp_path,
        filament={"carbon_footprints": [footprint(2.55, "only 2.55 kg CO2 emissions")]},
        traits={"recycled": True},
    )
    found = messages(errors, "no recycled_content")
    assert len(found) == 1
    assert found[0].level.value == "WARNING"


def test_container_details_are_checked(tmp_path):
    sizes = [
        {
            "filament_weight": 1000,
            "diameter": 1.75,
            "container_material": "mixed",
            "container_details": {
                "recycled_pct": 90,
                "pct_qualifier": "at_least",
                **SOURCE,
                "source_quote": "spools are based on 80 - 100% recycled raw material",
            },
        }
    ]
    errors = sustainability_errors(tmp_path, sizes=sizes)
    found = messages(errors, "container_details.recycled_pct is 90")
    assert len(found) == 1


# --- Mechanical data --------------------------------------------------------------
#
# Values from a brand's data sheet follow the same sourcing rules: copy, never compute.

SHEET = {
    "source_type": "primary",
    "source_url": "https://store.bblcdn.com/7166b20bc68f4c87b32c972b856eeb4b.pdf",
    "retrieved": "2026-11-08",
}


def mech(prop, direction, value, unit, quote, **extra):
    return {
        "property": prop,
        "direction": direction,
        "value": value,
        "unit": unit,
        **SHEET,
        "source_quote": quote,
        **extra,
    }


def modulus_xy(**extra):
    quote = "Young's Modulus (X-Y) ISO 527, GB/T 1040 3860 ± 230 MPa"
    return mech("tensile_modulus", "XY", 3860, "MPa", quote, plus_minus=230, **extra)


def mechanical_errors(tmp_path, *entries):
    data = build(
        tmp_path / "data",
        filament_extra={"mechanical": list(entries)},
        variants=[{"id": "black", "name": "Black"}],
    )
    return check_data_quality(data)


def test_sourced_mechanical_entry_passes(tmp_path):
    quote = "Young's Modulus (Z) ISO 527, GB/T 1040 2180 ± 130 MPa"
    z = mech("tensile_modulus", "Z", 2180, "MPa", quote, plus_minus=130)
    assert mechanical_errors(tmp_path, modulus_xy(), z) == []


def test_mechanical_value_missing_from_quote_is_an_error(tmp_path):
    entry = modulus_xy(source_quote="Young's Modulus (X-Y) 3.86 GPa")
    found = messages(mechanical_errors(tmp_path, entry), "does not contain that number")
    assert len(found) == 2  # value and plus_minus
    assert found[0].level.value == "ERROR"


def test_mechanical_psi_with_thousands_separator_passes(tmp_path):
    entry = mech("tensile_strength", "XY", 7250, "psi", "Tensile Strength ASTM D638 7,250 psi")
    assert mechanical_errors(tmp_path, entry) == []


def test_mechanical_missing_source_is_an_error(tmp_path):
    entry = modulus_xy()
    del entry["source_url"]
    found = messages(mechanical_errors(tmp_path, entry), "is missing source_url")
    assert len(found) == 1
    assert "Every mechanical figure" in found[0].message


def test_mechanical_future_retrieved_is_an_error(tmp_path):
    errors = mechanical_errors(tmp_path, modulus_xy(retrieved="2999-01-01"))
    assert len(messages(errors, "is in the future")) == 1


def test_mechanical_unit_that_does_not_fit_is_an_error(tmp_path):
    entry = mech("elongation_at_break", "XY", 2.6, "MPa", "Elongation at Break (X-Y) 2.6 MPa")
    found = messages(mechanical_errors(tmp_path, entry), "does not fit elongation_at_break")
    assert len(found) == 1
    assert found[0].level.value == "ERROR"


def test_mechanical_direction_on_moulded_bars_warns(tmp_path):
    entry = modulus_xy(specimen={"process": "moulded"})
    found = messages(mechanical_errors(tmp_path, entry), "moulded bars have no print direction")
    assert len(found) == 1
    assert found[0].level.value == "WARNING"


def test_mechanical_repeat_warns(tmp_path):
    found = messages(mechanical_errors(tmp_path, modulus_xy(), modulus_xy()), "repeats")
    assert len(found) == 1
    assert found[0].level.value == "WARNING"


def test_mechanical_same_property_other_standard_is_not_a_repeat(tmp_path):
    iso = modulus_xy(standard="ISO 527")
    astm = modulus_xy(standard="ASTM D638")
    assert messages(mechanical_errors(tmp_path, iso, astm), "repeats") == []


def test_mechanical_value_never_matches_inside_a_grouped_number(tmp_path):
    for value in (7, 250):
        entry = mech("tensile_strength", "XY", value, "psi", "Tensile Strength 7,250 psi")
        found = messages(mechanical_errors(tmp_path, entry), "does not contain that number")
        assert len(found) == 1, value


def test_mechanical_comma_in_gpa_is_a_decimal_comma(tmp_path):
    # "2,350 GPa" is 2.35 GPa: a value 1000x too large must not pass.
    wrong = mech("tensile_modulus", "XY", 2350, "GPa", "Tensile modulus 2,350 GPa")
    assert len(messages(mechanical_errors(tmp_path, wrong), "does not contain that number")) == 1
    right = mech("tensile_modulus", "XY", 2.35, "GPa", "Tensile modulus 2,350 GPa")
    assert mechanical_errors(tmp_path / "ok", right) == []


def test_value_never_matches_the_start_of_a_decimal(tmp_path):
    entry = mech("elongation_at_break", "XY", 5, "%", "Elongation at break 5.85 %")
    found = messages(mechanical_errors(tmp_path, entry), "does not contain that number")
    assert len(found) == 1


def test_mechanical_same_property_other_specimen_is_not_a_repeat(tmp_path):
    full = modulus_xy(specimen={"process": "printed", "infill_percent": 100})
    sparse = modulus_xy(specimen={"infill_percent": 20, "process": "printed"})
    assert messages(mechanical_errors(tmp_path, full, sparse), "repeats") == []
    same = modulus_xy(specimen={"infill_percent": 100, "process": "printed"})
    assert len(messages(mechanical_errors(tmp_path / "b", full, same), "repeats")) == 1
