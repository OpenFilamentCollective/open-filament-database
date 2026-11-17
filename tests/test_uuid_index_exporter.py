"""Tests for the canonical-UUID redirect index exporter."""

import json

from ofd.builder.exporters.uuid_index_exporter import (
    build_redirect_index,
    export_uuid_index,
)

U1 = "11111111-1111-4111-8111-111111111111"
U2 = "22222222-2222-4222-8222-222222222222"
U3 = "33333333-3333-4333-8333-333333333333"


def make_tree(tmp_path, brands):
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


def test_build_redirect_index_maps_old_to_current(tmp_path):
    data, stores = make_tree(tmp_path, [{"name": "acme", "uuid": U2, "moved_from": [U1]}])
    assert build_redirect_index(data, stores) == {U1: U2}


def test_build_redirect_index_excludes_live_collision(tmp_path):
    data, stores = make_tree(
        tmp_path,
        [
            {"name": "acme", "uuid": U1},
            {"name": "beta", "uuid": U2, "moved_from": [U1]},
        ],
    )
    # U1 is still live, so no redirect is emitted for it.
    assert build_redirect_index(data, stores) == {}


def test_export_writes_file(tmp_path):
    data, stores = make_tree(
        tmp_path,
        [
            {"name": "acme", "uuid": U2, "moved_from": [U1]},
            {"name": "beta", "uuid": U3},
        ],
    )
    out = tmp_path / "uuid-index.json"

    count = export_uuid_index(data, stores, out, "2026.07.01", "2026-07-01T00:00:00Z")

    assert out.exists()
    payload = json.loads(out.read_text(encoding="utf-8"))
    assert payload["count"] == count == 1
    assert payload["redirects"] == {U1: U2}
    assert payload["version"] == "2026.07.01"
