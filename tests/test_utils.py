import uuid

import pytest

from ofd.builder import utils


def test_generate_brand_uuid_matches_spec() -> None:
    assert utils.generate_brand_uuid("Prusament") == "ae5ff34e-298e-50c9-8f77-92a97fb30b09"


def test_generate_material_uuid_matches_spec() -> None:
    brand_uuid = utils.generate_brand_uuid("Prusament")
    assert (
        utils.generate_material_uuid(brand_uuid, "PLA Prusa Galaxy Black")
        == "1aaca54a-431f-5601-adf5-85dd018f487f"
    )


def test_generate_material_uuid_accepts_uuid_object() -> None:
    brand_str = utils.generate_brand_uuid("Prusament")
    brand_obj = uuid.UUID(brand_str)
    assert utils.generate_material_uuid(brand_str, "PLA") == utils.generate_material_uuid(
        brand_obj, "PLA"
    )


@pytest.mark.parametrize(
    "text, expected",
    [
        ("MixedCase", "mixedcase"),
        ("PLA Basic", "pla_basic"),
        ("pla-basic", "pla_basic"),
        ("Support@Plus!", "supportplus"),
        ("multiple   spaces", "multiple_spaces"),
        ("_leading_", "leading"),
        ("PLA+", "pla+"),
        ("!!!", ""),
    ],
)
def test_slugify(text: str, expected: str) -> None:
    assert utils.slugify(text) == expected


@pytest.mark.parametrize(
    "color, expected",
    [
        ("#FF0000", "#FF0000"),
        ("#ff0000", "#FF0000"),
        ("#fff", "#FFFFFF"),
        ("fff", "#FFFFFF"),
        ("FF0000", "#FF0000"),
    ],
)
def test_normalize_color_hex(color: str, expected: str) -> None:
    assert utils.normalize_color_hex(color) == expected


# This seems a bit odd. I'd expect code to throw in case like this, but implemented based on current behaviour.
# Didn't fix type yet in source, because it's not yet certain what would be desired behaviour
def test_normalize_color_hex_list_takes_first() -> None:
    assert utils.normalize_color_hex(["#ff0000", "#00ff00"]) == "#FF0000"  # type: ignore[arg-type]


@pytest.mark.parametrize("color", [None, ""])
def test_normalize_color_hex_empty_returns_none(color: str | None) -> None:
    assert utils.normalize_color_hex(color) is None


def test_normalize_color_hex_unparseable_returned_as_is() -> None:
    assert utils.normalize_color_hex("not-a-color") == "not-a-color"


@pytest.mark.parametrize(
    "value, expected",
    [
        (None, []),
        ("pla", ["pla"]),
        (42, [42]),
        ({"k": "v"}, [{"k": "v"}]),
        (["a", "b"], ["a", "b"]),
    ],
)
def test_ensure_list(value: object, expected: list) -> None:
    assert utils.ensure_list(value) == expected
