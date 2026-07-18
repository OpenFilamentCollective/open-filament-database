"""Tests for canonical-UUID resolution and the moved_from deprecation helpers."""

import json
import shutil
from pathlib import Path

from ofd.uuids import (
    Entity,
    build_redirect_map,
    iter_entities,
    record_moved_from,
    resolve_uuid,
)

# Valid canonical UUIDv4s (version nibble 4, variant nibble 8-b).
U1 = "11111111-1111-4111-8111-111111111111"
U2 = "22222222-2222-4222-8222-222222222222"
U3 = "33333333-3333-4333-8333-333333333333"
U4 = "44444444-4444-4444-8444-444444444444"


def ent(entity_type: str, uuid: str | None = None, moved_from=None) -> Entity:
    """Build a standalone Entity with an in-memory obj (no file needed)."""
    obj: dict = {}
    if uuid is not None:
        obj["uuid"] = uuid
    if moved_from is not None:
        obj["moved_from"] = moved_from
    return Entity(entity_type, Path(f"{entity_type}.json"), obj, obj)


# --------------------------------------------------------------------------- #
# Entity.moved_from
# --------------------------------------------------------------------------- #
def test_moved_from_normalizes_and_filters():
    e = ent("brand", U1, moved_from=[U2.upper(), "  " + U3 + " ", "", 5, None])
    # Uppercased/whitespace values are normalized; empty and non-strings dropped.
    assert e.moved_from == [U2, U3]


def test_moved_from_defaults_to_empty():
    assert ent("brand", U1).moved_from == []
    # A non-list value is ignored rather than raising.
    assert Entity("brand", Path("b.json"), {"moved_from": "x"}, {}).moved_from == []


# --------------------------------------------------------------------------- #
# resolve_uuid
# --------------------------------------------------------------------------- #
def test_resolve_direct_match():
    entities = [ent("brand", U1), ent("store", U2)]
    matches, via = resolve_uuid(U1, entities)
    assert via == "uuid"
    assert [m.entity_type for m in matches] == ["brand"]


def test_resolve_redirect_via_moved_from():
    entities = [ent("variant", U2, moved_from=[U1])]
    matches, via = resolve_uuid(U1, entities)
    assert via == "moved_from"
    assert matches[0].raw_uuid == U2


def test_resolve_is_case_insensitive():
    matches, via = resolve_uuid(U1.upper(), [ent("variant", U2, moved_from=[U1])])
    assert via == "moved_from"
    assert matches[0].raw_uuid == U2


def test_resolve_direct_wins_over_alias():
    # U1 is a live uuid on A and also (incorrectly) an alias on B — direct wins.
    a = ent("brand", U1)
    b = ent("variant", U2, moved_from=[U1])
    matches, via = resolve_uuid(U1, [a, b])
    assert via == "uuid"
    assert matches == [a]


def test_resolve_miss_returns_none():
    matches, via = resolve_uuid(U4, [ent("brand", U1)])
    assert matches == []
    assert via is None


# --------------------------------------------------------------------------- #
# build_redirect_map
# --------------------------------------------------------------------------- #
def test_build_redirect_map_basic():
    entities = [ent("variant", U2, moved_from=[U1]), ent("brand", U3)]
    assert build_redirect_map(entities) == {U1: U2}


def test_build_redirect_map_excludes_live_collisions():
    # U1 is both a live uuid (on A) and claimed as a former uuid (by B): skip the
    # redirect so it never shadows the live entity.
    entities = [ent("brand", U1), ent("variant", U2, moved_from=[U1])]
    assert build_redirect_map(entities) == {}


def test_build_redirect_map_skips_malformed_and_unassigned():
    entities = [
        ent("variant", U2, moved_from=["not-a-uuid", U1]),
        ent("brand", "", moved_from=[U3]),  # owner has no valid uuid -> no redirect
    ]
    assert build_redirect_map(entities) == {U1: U2}


# --------------------------------------------------------------------------- #
# record_moved_from
# --------------------------------------------------------------------------- #
def _write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_record_moved_from_dict_entity(tmp_path):
    target = tmp_path / "target"
    source = tmp_path / "source"
    _write(target / "filament.json", {"uuid": U2, "name": "Keep"})
    _write(source / "filament.json", {"uuid": U1, "name": "Gone"})

    recorded = record_moved_from(target, source)

    assert recorded == [U1]
    assert _read(target / "filament.json")["moved_from"] == [U1]


def test_record_moved_from_flattens_chains(tmp_path):
    target = tmp_path / "target"
    source = tmp_path / "source"
    _write(target / "filament.json", {"uuid": U3})
    # Source itself already absorbed U1 earlier; both should land on the survivor.
    _write(source / "filament.json", {"uuid": U2, "moved_from": [U1]})

    recorded = record_moved_from(target, source)

    assert set(recorded) == {U1, U2}
    assert _read(target / "filament.json")["moved_from"] == [U2, U1]


def test_record_moved_from_skips_identical_identity(tmp_path):
    # Same uuid on both sides (entity copied wholesale) -> no self-redirect recorded.
    target = tmp_path / "target"
    source = tmp_path / "source"
    _write(target / "brand.json", {"uuid": U1})
    _write(source / "brand.json", {"uuid": U1})

    assert record_moved_from(target, source) == []
    assert "moved_from" not in _read(target / "brand.json")


def test_record_moved_from_pairs_sizes_by_key(tmp_path):
    target = tmp_path / "target"
    source = tmp_path / "source"
    _write(
        target / "sizes.json",
        [{"uuid": U3, "filament_weight": 1000, "diameter": 1.75}],
    )
    _write(
        source / "sizes.json",
        [
            {"uuid": U1, "filament_weight": 1000, "diameter": 1.75},  # matches by key
            {"uuid": U2, "filament_weight": 500, "diameter": 1.75},  # no match -> ignored
        ],
    )

    recorded = record_moved_from(target, source)

    assert recorded == [U1]
    sizes = _read(target / "sizes.json")
    assert sizes[0]["moved_from"] == [U1]


def test_record_moved_from_roundtrips_through_iter_entities(tmp_path):
    # After recording, the redirect is discoverable via the same walk the CLI uses.
    data = tmp_path / "data"
    stores = tmp_path / "stores"
    stores.mkdir()
    target = data / "keep"
    source = data / "gone"
    _write(target / "brand.json", {"uuid": U2, "id": "keep", "name": "Keep"})
    _write(source / "brand.json", {"uuid": U1, "id": "gone", "name": "Gone"})

    record_moved_from(target, source)
    # The caller (merge_data / deduplicate_data) removes the source afterwards, so
    # U1 is no longer a live uuid — only the redirect remains.
    shutil.rmtree(source)

    matches, via = resolve_uuid(U1, iter_entities(data, stores))
    assert via == "moved_from"
    assert matches[0].raw_uuid == U2
