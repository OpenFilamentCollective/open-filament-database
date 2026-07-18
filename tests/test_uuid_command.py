"""Tests for the ``ofd uuid`` find/check commands, incl. moved_from resolution."""

import argparse
import json

from ofd.commands.uuid import run_check, run_find

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
