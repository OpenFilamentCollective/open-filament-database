import uuid

import pytest

from ofd.builder import utils


def test_generate_brand_uuid_matches_spec() -> None:
    assert utils.generate_brand_uuid("Prusament") == "ae5ff34e-298e-50c9-8f77-92a97fb30b09"


def test_generate_material_uuid_matches_spec() -> None:
    brand_uuid = utils.generate_brand_uuid("Prusament")
    assert utils.generate_material_uuid(brand_uuid, "PLA Prusa Galaxy Black") == "1aaca54a-431f-5601-adf5-85dd018f487f"


def test_generate_material_uuid_accepts_uuid_object() -> None:
    brand_str = utils.generate_brand_uuid("Prusament")
    brand_obj = uuid.UUID(brand_str)
    assert utils.generate_material_uuid(brand_str, "PLA") == utils.generate_material_uuid(brand_obj, "PLA")


@pytest.mark.parametrize("text, expected", [
    ("MixedCase",       "mixedcase"),
    ("PLA Basic",       "pla_basic"),
    ("pla-basic",       "pla_basic"),
    ("Support@Plus!",   "supportplus"),
    ("multiple   spaces", "multiple_spaces"),
    ("_leading_",       "leading"),
    ("PLA+",            "pla+"),
    ("!!!",             ""),
])
def test_slugify(text: str, expected: str) -> None:
    assert utils.slugify(text) == expected


@pytest.mark.parametrize("color, expected", [
    ("#FF0000",              "#FF0000"),
    ("#ff0000",              "#FF0000"),
    ("#fff",                 "#FFFFFF"),
    ("fff",                  "#FFFFFF"),
    ("FF0000",               "#FF0000"),
    (None,                   None),
    ("",                     None),
    (["#ff0000", "#00ff00"], "#FF0000"),
    ("not-a-color",          "not-a-color"),
])
def test_normalize_color_hex(color: str, expected: str | None) -> None:
    assert utils.normalize_color_hex(color) == expected


def test_ensure_list_none_returns_empty() -> None:
    assert utils.ensure_list(None) == []


def test_ensure_list_scalar_string_wrapped() -> None:
    assert utils.ensure_list("pla") == ["pla"]


def test_ensure_list_scalar_int_wrapped() -> None:
    assert utils.ensure_list(42) == [42]


def test_ensure_list_list_returned_unchanged() -> None:
    assert utils.ensure_list(["a", "b"]) == ["a", "b"]


def test_ensure_list_dict_wrapped() -> None:
    assert utils.ensure_list({"k": "v"}) == [{"k": "v"}]
