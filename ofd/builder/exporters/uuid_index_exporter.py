"""
Canonical-UUID redirect index for downstream consumers.

Emits a single ``/api/v1/uuid-index.json`` mapping every *former* canonical UUID
(declared in an entity's ``moved_from``) to the current UUID it now resolves to. A
consumer that stored a UUID which has since been deleted or merged (SimplyPrint, an
NFC tag, a slicer profile) can look it up here and follow the redirect to the live
entity — the offline equivalent of ``ofd uuid find <old-uuid>``.

The map is built from the same source tree walk (:func:`ofd.uuids.iter_entities`)
the ``ofd uuid`` command uses, *not* from the crawled ``Database`` — the crawler
drops incomplete entities, so building from it could silently lose redirects.

Artifact shape:
    { "version", "generated_at", "count", "redirects": { old_uuid: current_uuid } }
"""

from pathlib import Path

from .api_exporter import write_json


def build_redirect_index(data_dir: str | Path, stores_dir: str | Path) -> dict[str, str]:
    """Build the ``{old_uuid: current_uuid}`` redirect map from the source tree."""
    # Imported lazily: ofd.uuids pulls in ofd.builder (for generate_canonical_uuid),
    # so a module-level import here would create an import cycle through this package.
    from ofd.uuids import build_redirect_map, iter_entities

    entities = iter_entities(Path(data_dir), Path(stores_dir))
    return build_redirect_map(entities)


def export_uuid_index(
    data_dir: str | Path,
    stores_dir: str | Path,
    out_path: str | Path,
    version: str,
    generated_at: str,
) -> int:
    """Write the UUID redirect index to ``out_path``. Returns the redirect count."""
    redirects = build_redirect_index(data_dir, stores_dir)

    write_json(
        Path(out_path),
        {
            "version": version,
            "generated_at": generated_at,
            "count": len(redirects),
            # Sorted for deterministic output (stable diffs and checksums).
            "redirects": dict(sorted(redirects.items())),
        },
    )

    return len(redirects)
