"""
Canonical UUID support for the Open Filament Database.

Historically OFD entities had only slug-based identity on disk, plus a UUIDv5
*derived* at build time (see ofd/builder/utils.py). Derived UUIDs change whenever a
slug or name changes, so they are not a stable external identity.

This module introduces the **canonical UUID**: a random UUIDv4 stored directly in
each source JSON file, in an optional ``uuid`` field (see schemas/*.json). It stays
constant across renames and is left empty on manual/webui creation, then assigned by
CI on merge.

Here lives the single tree walk shared by every ``ofd uuid`` sub-command
(new / assign / find / check / list): it yields one :class:`Entity` per
brand / material / filament / variant / spool(size) / store, each pointing back at
the JSON file (and array index, for spools) it came from so its ``uuid`` can be read
or written.
"""

import json
import re
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ofd.builder.utils import generate_canonical_uuid

__all__ = [
    "UUID_RE",
    "ENTITY_TYPES",
    "Entity",
    "iter_entities",
    "assign_uuid",
    "save_container",
    "generate_canonical_uuid",
]

# Canonical UUIDv4 pattern. An empty string means "unassigned" and mirrors the
# ``^$|<uuid>`` pattern the JSON schemas accept.
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")

# Entity levels that carry a canonical UUID, in tree order.
ENTITY_TYPES = ("brand", "material", "filament", "variant", "size", "store")


@dataclass
class Entity:
    """A single canonical-UUID-bearing entity discovered during the tree walk.

    ``obj`` is a live reference into ``container`` (for spools, ``container[index]``),
    so mutating ``obj`` and then calling :func:`save_container` on ``file`` persists
    the change.
    """

    entity_type: str  # one of ENTITY_TYPES
    file: Path  # JSON file the entity lives in
    obj: dict[str, Any]  # the entity dict (a reference into ``container``)
    container: Any  # top-level parsed JSON (a dict, or a list for sizes.json)
    index: int | None = None  # array index for ``size`` entities, else None

    @property
    def raw_uuid(self) -> str:
        """The stored uuid string, or "" when the field is missing/non-string."""
        value = self.obj.get("uuid")
        return value if isinstance(value, str) else ""

    @property
    def assigned(self) -> bool:
        """True when a non-empty uuid is present (regardless of validity)."""
        return bool(self.raw_uuid)

    @property
    def valid(self) -> bool:
        """True when the stored uuid is a well-formed canonical UUIDv4."""
        return bool(UUID_RE.match(self.raw_uuid))

    def describe(self, root: Path | None = None) -> str:
        """Human-friendly location, e.g. ``data/brand/.../sizes.json[1]``."""
        path = self.file
        if root is not None:
            try:
                path = self.file.relative_to(root)
            except ValueError:
                path = self.file
        if self.index is None:
            return str(path)
        return f"{path}[{self.index}]"


def _load(path: Path) -> Any:
    """Parse a JSON file, returning None on missing file or parse error."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def save_container(file: Path, container: Any) -> None:
    """Write a parsed container back to disk using the repo's JSON formatting.

    Matches ``style_data``'s ``save_json`` (2-space indent, no ASCII escaping,
    trailing newline) so a standalone ``ofd uuid assign`` produces the same output
    the post-merge style step would.
    """
    with open(file, "w", encoding="utf-8") as fh:
        json.dump(container, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def assign_uuid(entity: Entity, value: str) -> None:
    """Set ``entity``'s uuid to ``value``, ordered first among its keys.

    Reorders in place (clear + re-insert) so the same object reference is kept and
    the container stays consistent; callers still persist via :func:`save_container`.
    """
    ordered = [("uuid", value)] + [(k, v) for k, v in entity.obj.items() if k != "uuid"]
    entity.obj.clear()
    entity.obj.update(ordered)


def iter_entities(data_dir: Path, stores_dir: Path) -> Iterator[Entity]:
    """Yield every canonical-UUID-bearing entity under ``data_dir`` and ``stores_dir``.

    Mirrors the crawler's traversal (brand -> material -> filament -> variant ->
    sizes[]) plus flat stores. Files that are missing or fail to parse are skipped;
    ``ofd validate --json-files`` is responsible for reporting malformed JSON.
    """
    yield from _iter_data(data_dir)
    yield from _iter_stores(stores_dir)


def _iter_data(data_dir: Path) -> Iterator[Entity]:
    if not data_dir.exists():
        return
    for brand_dir in sorted(data_dir.iterdir()):
        if not brand_dir.is_dir() or brand_dir.name.startswith("."):
            continue

        brand_file = brand_dir / "brand.json"
        brand_container = _load(brand_file)
        if isinstance(brand_container, dict):
            yield Entity("brand", brand_file, brand_container, brand_container)

        for material_dir in sorted(brand_dir.iterdir()):
            if not material_dir.is_dir() or material_dir.name.startswith("."):
                continue

            material_file = material_dir / "material.json"
            material_container = _load(material_file)
            if isinstance(material_container, dict):
                yield Entity("material", material_file, material_container, material_container)

            for filament_dir in sorted(material_dir.iterdir()):
                if not filament_dir.is_dir() or filament_dir.name.startswith("."):
                    continue

                filament_file = filament_dir / "filament.json"
                filament_container = _load(filament_file)
                if isinstance(filament_container, dict):
                    yield Entity("filament", filament_file, filament_container, filament_container)

                for variant_dir in sorted(filament_dir.iterdir()):
                    if not variant_dir.is_dir() or variant_dir.name.startswith("."):
                        continue

                    variant_file = variant_dir / "variant.json"
                    variant_container = _load(variant_file)
                    if isinstance(variant_container, dict):
                        yield Entity("variant", variant_file, variant_container, variant_container)

                    sizes_file = variant_dir / "sizes.json"
                    sizes_container = _load(sizes_file)
                    if isinstance(sizes_container, list):
                        for idx, entry in enumerate(sizes_container):
                            if isinstance(entry, dict):
                                yield Entity("size", sizes_file, entry, sizes_container, idx)


def _iter_stores(stores_dir: Path) -> Iterator[Entity]:
    if not stores_dir.exists():
        return
    for store_dir in sorted(stores_dir.iterdir()):
        if not store_dir.is_dir() or store_dir.name.startswith("."):
            continue
        store_file = store_dir / "store.json"
        store_container = _load(store_file)
        if isinstance(store_container, dict):
            yield Entity("store", store_file, store_container, store_container)
