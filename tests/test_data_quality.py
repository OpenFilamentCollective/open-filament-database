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

    `variants` items are dicts: {id, name?, traits?, sizes?}.
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
