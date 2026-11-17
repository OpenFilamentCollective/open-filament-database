"""Tests for the ``ofd uuid`` find/check commands, incl. moved_from resolution."""

import argparse
import json
import shutil
import subprocess

import pytest

from ofd.commands.uuid import run_check, run_continuity, run_find
from ofd.uuids import find_lost_uuids, iter_entities

U1 = "11111111-1111-4111-8111-111111111111"
U2 = "22222222-2222-4222-8222-222222222222"
U3 = "33333333-3333-4333-8333-333333333333"
U4 = "44444444-4444-4444-8444-444444444444"


def make_tree(tmp_path, brands):
    """Create data/ + stores/ trees; each brand is {name, uuid?, moved_from?}."""
    data = tmp_path / "data"
    stores = tmp_path / "stores"
    data.mkdir()
    stores.mkdir()
    for b in brands:
        brand_dir = data / b["name"]
        brand_dir.mkdir()
        obj = {"id": b["name"], "name": b["name"]}
        if "uuid" in b:
            obj["uuid"] = b["uuid"]
        if "moved_from" in b:
            obj["moved_from"] = b["moved_from"]
        (brand_dir / "brand.json").write_text(json.dumps(obj), encoding="utf-8")
    return data, stores


def make_args(data, stores, **kw):
    kw.setdefault("json", False)
    kw.setdefault("allow_missing_uuids", False)
    return argparse.Namespace(data_dir=str(data), stores_dir=str(stores), **kw)


# --------------------------------------------------------------------------- #
# find
# --------------------------------------------------------------------------- #
def test_find_direct(tmp_path, capsys):
    data, stores = make_tree(tmp_path, [{"name": "acme", "uuid": U1}])
    rc = run_find(make_args(data, stores, uuid=U1, json=True))
    out = json.loads(capsys.readouterr().out)
    assert rc == 0
    assert out["matched_via"] == "uuid"
    assert out["moved"] is False
    assert out["matches"][0]["current_uuid"] == U1


def test_find_redirect_json(tmp_path, capsys):
    data, stores = make_tree(tmp_path, [{"name": "acme", "uuid": U2, "moved_from": [U1]}])
    rc = run_find(make_args(data, stores, uuid=U1, json=True))
    out = json.loads(capsys.readouterr().out)
    assert rc == 0
    assert out["matched_via"] == "moved_from"
    assert out["moved"] is True
    assert out["matches"][0]["current_uuid"] == U2


def test_find_redirect_text(tmp_path, capsys):
    data, stores = make_tree(tmp_path, [{"name": "acme", "uuid": U2, "moved_from": [U1]}])
    rc = run_find(make_args(data, stores, uuid=U1, json=False))
    captured = capsys.readouterr().out
    assert rc == 0
    assert f"(moved; now {U2})" in captured


def test_find_miss(tmp_path, capsys):
    data, stores = make_tree(tmp_path, [{"name": "acme", "uuid": U1}])
    rc = run_find(make_args(data, stores, uuid=U4, json=True))
    out = json.loads(capsys.readouterr().out)
    assert rc == 1
    assert out["success"] is False
    assert out["matched_via"] is None


def test_find_empty_uuid_matches_nothing(tmp_path, capsys):
    # An empty/whitespace argument must not resolve to every unassigned entity.
    data, stores = make_tree(tmp_path, [{"name": "acme"}, {"name": "beta"}])  # no uuids
    rc = run_find(make_args(data, stores, uuid="  ", json=True))
    out = json.loads(capsys.readouterr().out)
    assert rc == 1
    assert out["success"] is False
    assert out["matches"] == []


# --------------------------------------------------------------------------- #
# check
# --------------------------------------------------------------------------- #
def test_check_clean_moved_from(tmp_path, capsys):
    data, stores = make_tree(tmp_path, [{"name": "acme", "uuid": U2, "moved_from": [U1]}])
    rc = run_check(make_args(data, stores, json=True))
    out = json.loads(capsys.readouterr().out)
    assert rc == 0
    assert out["success"] is True


def test_check_malformed_moved_from(tmp_path, capsys):
    data, stores = make_tree(tmp_path, [{"name": "acme", "uuid": U2, "moved_from": ["nope"]}])
    rc = run_check(make_args(data, stores, json=True))
    out = json.loads(capsys.readouterr().out)
    assert rc == 1
    assert out["moved_from"]["malformed"]


def test_check_duplicate_moved_from(tmp_path, capsys):
    data, stores = make_tree(
        tmp_path,
        [
            {"name": "acme", "uuid": U2, "moved_from": [U1]},
            {"name": "beta", "uuid": U3, "moved_from": [U1]},
        ],
    )
    rc = run_check(make_args(data, stores, json=True))
    out = json.loads(capsys.readouterr().out)
    assert rc == 1
    assert U1 in out["moved_from"]["duplicates"]


def test_check_moved_from_collides_with_live(tmp_path, capsys):
    data, stores = make_tree(
        tmp_path,
        [
            {"name": "acme", "uuid": U1},  # U1 is live
            {"name": "beta", "uuid": U2, "moved_from": [U1]},  # ...and claimed as former
        ],
    )
    rc = run_check(make_args(data, stores, json=True))
    out = json.loads(capsys.readouterr().out)
    assert rc == 1
    assert out["moved_from"]["conflicts_with_live"]


def test_check_self_referential_moved_from(tmp_path, capsys):
    data, stores = make_tree(tmp_path, [{"name": "acme", "uuid": U2, "moved_from": [U2]}])
    rc = run_check(make_args(data, stores, json=True))
    out = json.loads(capsys.readouterr().out)
    assert rc == 1
    assert out["moved_from"]["self_references"]


def test_check_intra_entity_duplicate_not_flagged_as_cross_entity(tmp_path, capsys):
    # One entity listing the same former UUID twice is a harmless intra-array
    # duplicate, not a cross-entity collision — it must not be reported as one.
    data, stores = make_tree(tmp_path, [{"name": "acme", "uuid": U2, "moved_from": [U1, U1]}])
    rc = run_check(make_args(data, stores, json=True))
    out = json.loads(capsys.readouterr().out)
    assert rc == 0
    assert out["success"] is True
    assert out["moved_from"]["duplicates"] == {}


# --------------------------------------------------------------------------- #
# continuity (base vs. head)
# --------------------------------------------------------------------------- #
FIL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
VAR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
SPOOL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj), encoding="utf-8")


def make_filament(root, filament_id="flex", variant_id="blanco", *, fil=FIL, var=VAR, spool=SPOOL):
    """data/acme/TPE/<filament_id>/<variant_id>/ with optional uuids (None = unassigned)."""
    data, stores = root / "data", root / "stores"
    stores.mkdir(parents=True, exist_ok=True)
    fdir = data / "acme" / "TPE" / filament_id
    write_json(data / "acme" / "brand.json", {"id": "acme", "name": "Acme"})
    write_json(fdir / "filament.json", {"id": filament_id, **({"uuid": fil} if fil else {})})
    write_json(
        fdir / variant_id / "variant.json", {"id": variant_id, **({"uuid": var} if var else {})}
    )
    write_json(
        fdir / variant_id / "sizes.json",
        [{"filament_weight": 1000, "diameter": 1.75, **({"uuid": spool} if spool else {})}],
    )
    return data, stores


def lost(base_root, head_root):
    base = iter_entities(base_root / "data", base_root / "stores")
    head = iter_entities(head_root / "data", head_root / "stores")
    return sorted(e.raw_uuid for e in find_lost_uuids(base, head))


def test_continuity_rename_keeping_uuids_passes(tmp_path):
    make_filament(tmp_path / "base")
    make_filament(tmp_path / "head", "flex_920", "natural")
    assert lost(tmp_path / "base", tmp_path / "head") == []


def test_continuity_pr636_shape_flags_children(tmp_path):
    # Filament kept its (copied) uuid at the new path; variant + spool were recreated.
    make_filament(tmp_path / "base")
    make_filament(tmp_path / "head", "flex_920", "natural", var=None, spool=None)
    assert lost(tmp_path / "base", tmp_path / "head") == sorted([VAR, SPOOL])


def test_continuity_dropped_spool_uuid_fails(tmp_path):
    make_filament(tmp_path / "base")
    make_filament(tmp_path / "head", spool=None)
    assert lost(tmp_path / "base", tmp_path / "head") == [SPOOL]


def test_continuity_moved_from_redirect_passes(tmp_path):
    make_filament(tmp_path / "base")
    data, _ = make_filament(tmp_path / "head", var=None, spool=None)
    variant = data / "acme" / "TPE" / "flex" / "blanco" / "variant.json"
    write_json(variant, {"id": "blanco", "moved_from": [VAR.upper()]})  # unassigned + redirect
    sizes = variant.parent / "sizes.json"
    write_json(sizes, [{"filament_weight": 1000, "diameter": 1.75, "moved_from": [SPOOL]}])
    assert lost(tmp_path / "base", tmp_path / "head") == []


def test_continuity_ignores_unassigned_base(tmp_path):
    make_filament(tmp_path / "base", fil=None, var=None, spool=None)
    make_filament(tmp_path / "head", "other", fil=None, var=None, spool=None)
    assert lost(tmp_path / "base", tmp_path / "head") == []


@pytest.mark.skipif(shutil.which("git") is None, reason="git not available")
def test_run_continuity_against_git_ref(tmp_path, capsys, monkeypatch):
    monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)
    data, stores = make_filament(tmp_path)
    (stores / ".keep").write_text("", encoding="utf-8")  # git doesn't track empty dirs

    def git(*argv):
        subprocess.run(
            ["git", "-c", "user.name=t", "-c", "user.email=t@t", *argv],
            cwd=tmp_path,
            check=True,
            capture_output=True,
        )

    git("init", "-q")
    git("add", "-A")
    git("commit", "-qm", "base")

    shutil.rmtree(data / "acme" / "TPE" / "flex")
    make_filament(tmp_path, "flex_920", "natural", var=None, spool=None)

    rc = run_continuity(make_args(data, stores, base="HEAD", json=True))
    out = json.loads(capsys.readouterr().out)
    assert rc == 1
    assert sorted(r["uuid"] for r in out["lost"]) == sorted([VAR, SPOOL])
    assert {r["path"] for r in out["lost"]} == {
        "data/acme/TPE/flex/blanco/variant.json",
        "data/acme/TPE/flex/blanco/sizes.json[0]",
    }

    rc = run_continuity(make_args(data, stores, base="no-such-ref"))
    assert rc == 1
