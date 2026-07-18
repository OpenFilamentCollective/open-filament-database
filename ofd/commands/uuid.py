"""
UUID command - Manage canonical UUIDs for database entities.

Every OFD entity (brand, material, filament, variant, spool/size, store) carries a
canonical UUIDv4 stored in its source JSON, independent of its slug (see
ofd/uuids.py and schemas/*.json). This command creates, assigns, finds, lists, and
checks those UUIDs.

Sub-actions:
    ofd uuid new [-n N]        Print fresh canonical UUID(s)
    ofd uuid assign [--check]  Assign a UUID to every entity missing one (writes files)
    ofd uuid find <uuid>       Locate the file/entity for a canonical UUID
    ofd uuid check             Verify UUIDs are present, valid, and globally unique
    ofd uuid list              Print the uuid -> path index

On merge, CI runs ``ofd uuid assign`` (see .github/workflows/style_data.yaml) so
contributors never author UUIDs by hand.
"""

import argparse
import json
import sys
from pathlib import Path

from ofd.uuids import (
    assign_uuid as _assign_uuid,
)
from ofd.uuids import (
    generate_canonical_uuid,
    iter_entities,
    save_container,
)

# Project root for resolving relative paths (ofd/commands/uuid.py -> repo root).
project_root = Path(__file__).parent.parent.parent


def register_subcommand(subparsers: argparse._SubParsersAction) -> None:
    """Register the uuid subcommand and its actions."""
    parser = subparsers.add_parser(
        "uuid",
        help="Manage canonical UUIDs for database entities",
        description=(
            "Create, assign, find, list, and check canonical UUIDs. Each entity "
            "(brand, material, filament, variant, spool, store) has one UUIDv4 "
            "stored in its JSON, independent of the slug."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  ofd uuid new                 Print one fresh canonical UUID
  ofd uuid new -n 5            Print five UUIDs
  ofd uuid assign              Assign a UUID to every entity missing one (writes files)
  ofd uuid assign --check      Report entities missing a UUID (exit 1 if any); writes nothing
  ofd uuid find <uuid>         Print the file/entity for a canonical UUID
  ofd uuid check               Verify every UUID is present, well-formed, and globally unique
  ofd uuid check --allow-missing-uuids   Skip the presence check (for PR / pre-merge checks)
  ofd uuid list                Print the uuid -> path index
        """,
    )

    actions = parser.add_subparsers(title="actions", dest="uuid_action", metavar="<action>")

    # new -------------------------------------------------------------------
    p_new = actions.add_parser("new", help="Print fresh canonical UUID(s)")
    p_new.add_argument("-n", "--count", type=int, default=1, help="How many UUIDs to print")
    p_new.add_argument("--json", action="store_true", help="Output results as JSON")
    p_new.set_defaults(func=run_new)

    # assign ----------------------------------------------------------------
    p_assign = actions.add_parser(
        "assign", help="Assign a UUID to every entity missing one (writes files)"
    )
    _add_dir_args(p_assign)
    p_assign.add_argument(
        "--check",
        action="store_true",
        help="Report entities missing a UUID and exit non-zero; do not write files",
    )
    p_assign.add_argument("--json", action="store_true", help="Output results as JSON")
    p_assign.set_defaults(func=run_assign)

    # find ------------------------------------------------------------------
    p_find = actions.add_parser("find", help="Locate the file/entity for a canonical UUID")
    p_find.add_argument("uuid", metavar="UUID", help="The canonical UUID to look up")
    _add_dir_args(p_find)
    p_find.add_argument("--json", action="store_true", help="Output results as JSON")
    p_find.set_defaults(func=run_find)

    # check -----------------------------------------------------------------
    p_check = actions.add_parser(
        "check", help="Verify UUIDs are present, well-formed, and globally unique"
    )
    _add_dir_args(p_check)
    p_check.add_argument(
        "--allow-missing-uuids",
        action="store_true",
        help="Don't fail on entities without a UUID. Use for pre-merge/PR checks, where "
        "UUIDs are expected to be empty (CI assigns them on merge). By default a missing "
        "UUID is an error.",
    )
    p_check.add_argument("--json", action="store_true", help="Output results as JSON")
    p_check.set_defaults(func=run_check)

    # list ------------------------------------------------------------------
    p_list = actions.add_parser("list", help="Print the uuid -> path index")
    _add_dir_args(p_list)
    p_list.add_argument("--json", action="store_true", help="Output results as JSON")
    p_list.set_defaults(func=run_list)

    parser.set_defaults(func=lambda args: _no_action(parser))


def _add_dir_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--data-dir", default="data", help="Data directory (default: data)")
    parser.add_argument("--stores-dir", default="stores", help="Stores directory (default: stores)")


def _no_action(parser: argparse.ArgumentParser) -> int:
    parser.print_help()
    return 1


def _resolve_dirs(args: argparse.Namespace) -> tuple[Path, Path] | None:
    data_dir = project_root / args.data_dir
    stores_dir = project_root / args.stores_dir
    if not data_dir.exists():
        print(f"Error: Data directory '{data_dir}' does not exist", file=sys.stderr)
        return None
    if not stores_dir.exists():
        print(f"Error: Stores directory '{stores_dir}' does not exist", file=sys.stderr)
        return None
    return data_dir, stores_dir


def run_new(args: argparse.Namespace) -> int:
    """Print one or more fresh canonical UUIDs."""
    count = max(1, args.count)
    uuids = [generate_canonical_uuid() for _ in range(count)]
    if getattr(args, "json", False):
        print(json.dumps({"success": True, "uuids": uuids}, indent=2))
    else:
        for value in uuids:
            print(value)
    return 0


def run_assign(args: argparse.Namespace) -> int:
    """Assign a UUID to every entity missing one, or (with --check) just report them."""
    dirs = _resolve_dirs(args)
    if dirs is None:
        return 1
    data_dir, stores_dir = dirs

    entities = list(iter_entities(data_dir, stores_dir))
    existing = {e.raw_uuid for e in entities if e.assigned}
    missing = [e for e in entities if not e.assigned]

    if args.check:
        if args.json:
            print(
                json.dumps(
                    {
                        "success": not missing,
                        "missing": [
                            {"type": e.entity_type, "path": e.describe(project_root)}
                            for e in missing
                        ],
                        "missing_count": len(missing),
                        "total": len(entities),
                    },
                    indent=2,
                )
            )
        else:
            if missing:
                print(f"{len(missing)} entit{'y' if len(missing) == 1 else 'ies'} missing a UUID:")
                for e in missing:
                    print(f"  {e.entity_type:9} {e.describe(project_root)}")
            else:
                print(f"All {len(entities)} entities have a UUID.")
        return 1 if missing else 0

    # Assign new UUIDs and persist each touched file once.
    dirty: dict[Path, object] = {}
    for e in missing:
        value = generate_canonical_uuid()
        while value in existing:
            value = generate_canonical_uuid()
        existing.add(value)
        _assign_uuid(e, value)
        dirty[e.file] = e.container

    for file, container in dirty.items():
        save_container(file, container)

    if args.json:
        print(
            json.dumps(
                {
                    "success": True,
                    "assigned": len(missing),
                    "files_written": len(dirty),
                    "total": len(entities),
                },
                indent=2,
            )
        )
    else:
        print(
            f"Assigned {len(missing)} UUID(s) across {len(dirty)} file(s) "
            f"({len(entities)} entities total)."
        )
    return 0


def run_find(args: argparse.Namespace) -> int:
    """Locate the file(s)/entity(ies) whose canonical UUID matches the argument."""
    dirs = _resolve_dirs(args)
    if dirs is None:
        return 1
    data_dir, stores_dir = dirs

    target = args.uuid.strip().lower()
    matches = [e for e in iter_entities(data_dir, stores_dir) if e.raw_uuid == target]

    if args.json:
        print(
            json.dumps(
                {
                    "success": bool(matches),
                    "uuid": target,
                    "matches": [
                        {"type": e.entity_type, "path": e.describe(project_root)} for e in matches
                    ],
                },
                indent=2,
            )
        )
    elif not matches:
        print(f"No entity found with UUID {target}", file=sys.stderr)
    else:
        for e in matches:
            print(f"{e.entity_type:9} {e.describe(project_root)}")
    return 0 if matches else 1


def run_check(args: argparse.Namespace) -> int:
    """Verify UUIDs are well-formed and globally unique (optionally require presence)."""
    dirs = _resolve_dirs(args)
    if dirs is None:
        return 1
    data_dir, stores_dir = dirs

    entities = list(iter_entities(data_dir, stores_dir))
    malformed: list = []
    missing: list = []
    by_uuid: dict[str, list] = {}

    for e in entities:
        if e.assigned:
            if e.valid:
                by_uuid.setdefault(e.raw_uuid, []).append(e)
            else:
                malformed.append(e)
        elif not args.allow_missing_uuids:
            missing.append(e)

    duplicates = {value: es for value, es in by_uuid.items() if len(es) > 1}
    ok = not (malformed or missing or duplicates)

    if args.json:
        print(
            json.dumps(
                {
                    "success": ok,
                    "total": len(entities),
                    "malformed": [
                        {
                            "type": e.entity_type,
                            "path": e.describe(project_root),
                            "uuid": e.raw_uuid,
                        }
                        for e in malformed
                    ],
                    "missing": [
                        {"type": e.entity_type, "path": e.describe(project_root)} for e in missing
                    ],
                    "duplicates": {
                        value: [e.describe(project_root) for e in es]
                        for value, es in duplicates.items()
                    },
                },
                indent=2,
            )
        )
        return 0 if ok else 1

    if malformed:
        print(f"{len(malformed)} malformed UUID(s):")
        for e in malformed:
            print(f"  {e.entity_type:9} {e.describe(project_root)}  ->  {e.raw_uuid!r}")
    if missing:
        print(f"{len(missing)} entit{'y' if len(missing) == 1 else 'ies'} missing a UUID:")
        for e in missing:
            print(f"  {e.entity_type:9} {e.describe(project_root)}")
    if duplicates:
        print(f"{len(duplicates)} duplicated UUID(s):")
        for value, es in duplicates.items():
            print(f"  {value}")
            for e in es:
                print(f"    {e.entity_type:9} {e.describe(project_root)}")
    if ok:
        assigned_count = sum(len(es) for es in by_uuid.values())
        if assigned_count == len(entities):
            print(f"All {len(entities)} entities have valid, unique UUIDs.")
        else:
            print(
                f"{assigned_count} of {len(entities)} entities have valid, unique UUIDs "
                f"({len(entities) - assigned_count} unassigned)."
            )
    return 0 if ok else 1


def run_list(args: argparse.Namespace) -> int:
    """Print the uuid -> path index for every assigned entity."""
    dirs = _resolve_dirs(args)
    if dirs is None:
        return 1
    data_dir, stores_dir = dirs

    rows = [
        (e.raw_uuid, e.entity_type, e.describe(project_root))
        for e in iter_entities(data_dir, stores_dir)
        if e.assigned
    ]

    if args.json:
        print(
            json.dumps(
                {
                    "success": True,
                    "count": len(rows),
                    "entities": [{"uuid": u, "type": t, "path": p} for u, t, p in rows],
                },
                indent=2,
            )
        )
    else:
        for value, entity_type, path in rows:
            print(f"{value}  {entity_type:9} {path}")
    return 0
