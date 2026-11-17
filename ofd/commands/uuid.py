"""
UUID command - Manage canonical UUIDs for database entities.

Every OFD entity (brand, material, filament, variant, spool/size, store) carries a
canonical UUIDv4 stored in its source JSON, independent of its slug (see
ofd/uuids.py and schemas/*.json). This command creates, assigns, finds, lists, and
checks those UUIDs.

Sub-actions:
    ofd uuid new [-n N]        Print fresh canonical UUID(s)
    ofd uuid assign [--check]  Assign a UUID to every entity missing one (writes files)
    ofd uuid find <uuid>       Locate the entity for a UUID (falls back to moved_from)
    ofd uuid check             Verify UUIDs (incl. moved_from) are valid and unique
    ofd uuid continuity --base <ref>
                               Fail if a UUID present at <ref> no longer resolves
    ofd uuid list              Print the uuid -> path index

A former UUID recorded in an entity's ``moved_from`` (see ofd/uuids.py) redirects to
that entity, so ``find`` resolves references to data that has since moved or merged.

On merge, CI runs ``ofd uuid assign`` (see .github/workflows/style_data.yaml) so
contributors never author UUIDs by hand.
"""

import argparse
import json
import os
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

from ofd.uuids import (
    UUID_RE,
    find_lost_uuids,
    generate_canonical_uuid,
    iter_entities,
    resolve_uuid,
    save_container,
)
from ofd.uuids import (
    assign_uuid as _assign_uuid,
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
  ofd uuid find <uuid>         Print the entity for a UUID (or where a moved_from UUID now lives)
  ofd uuid check               Verify every UUID is present, well-formed, and globally unique
  ofd uuid check --allow-missing-uuids   Skip the presence check (for PR / pre-merge checks)
  ofd uuid continuity --base origin/main  Fail if a UUID on main vanished without a redirect
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
    p_find = actions.add_parser(
        "find",
        help="Locate the entity for a canonical UUID (falls back to moved_from redirects)",
    )
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

    # continuity ------------------------------------------------------------
    p_cont = actions.add_parser(
        "continuity",
        help="Fail if a UUID present at a base git ref no longer resolves in the working tree",
    )
    p_cont.add_argument(
        "--base",
        required=True,
        metavar="REF",
        help="Git ref/commit to compare against (e.g. the PR's base sha)",
    )
    _add_dir_args(p_cont)
    p_cont.add_argument("--json", action="store_true", help="Output results as JSON")
    p_cont.set_defaults(func=run_continuity)

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


def _print_parse_errors(parse_errors: list[dict[str, str]]) -> None:
    """Print any unparseable-file records (text mode)."""
    if not parse_errors:
        return
    print(f"{len(parse_errors)} unparseable file(s):")
    for pe in parse_errors:
        print(f"  {pe['path']}  ->  {pe['error']}")


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

    # A malformed file can't be given a UUID; surface it instead of silently skipping.
    parse_errors: list[dict[str, str]] = []
    entities = list(iter_entities(data_dir, stores_dir, parse_errors))
    existing = {e.raw_uuid for e in entities if e.assigned}
    missing = [e for e in entities if not e.assigned]

    if args.check:
        ok = not (missing or parse_errors)
        if args.json:
            print(
                json.dumps(
                    {
                        "success": ok,
                        "missing": [
                            {"type": e.entity_type, "path": e.describe(project_root)}
                            for e in missing
                        ],
                        "missing_count": len(missing),
                        "parse_errors": parse_errors,
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
            _print_parse_errors(parse_errors)
            if ok:
                print(f"All {len(entities)} entities have a UUID.")
        return 0 if ok else 1

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
                    "success": not parse_errors,
                    "assigned": len(missing),
                    "files_written": len(dirty),
                    "parse_errors": parse_errors,
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
        _print_parse_errors(parse_errors)
    return 1 if parse_errors else 0


def run_find(args: argparse.Namespace) -> int:
    """Locate the file(s)/entity(ies) a canonical UUID resolves to.

    A live ``uuid`` matches directly. Failing that, the lookup falls back to
    ``moved_from``, so a former (now-deleted) UUID redirects to the entity that
    superseded it — this is how a consumer turns a dangling old UUID into a live one.
    """
    dirs = _resolve_dirs(args)
    if dirs is None:
        return 1
    data_dir, stores_dir = dirs

    target = args.uuid.strip().lower()
    matches, matched_via = resolve_uuid(target, iter_entities(data_dir, stores_dir))
    moved = matched_via == "moved_from"

    if args.json:
        print(
            json.dumps(
                {
                    "success": bool(matches),
                    "uuid": target,
                    "matched_via": matched_via,
                    "moved": moved,
                    "matches": [
                        {
                            "type": e.entity_type,
                            "path": e.describe(project_root),
                            "current_uuid": e.raw_uuid,
                        }
                        for e in matches
                    ],
                },
                indent=2,
            )
        )
    elif not matches:
        print(f"No entity found with UUID {target}", file=sys.stderr)
    else:
        for e in matches:
            suffix = f"  (moved; now {e.raw_uuid})" if moved else ""
            print(f"{e.entity_type:9} {e.describe(project_root)}{suffix}")
    return 0 if matches else 1


def run_check(args: argparse.Namespace) -> int:
    """Verify UUIDs are present, well-formed, and globally unique.

    Presence is required by default; ``--allow-missing-uuids`` relaxes only that.
    Malformed/duplicate UUIDs and unparseable files always fail.
    """
    dirs = _resolve_dirs(args)
    if dirs is None:
        return 1
    data_dir, stores_dir = dirs

    parse_errors: list[dict[str, str]] = []
    entities = list(iter_entities(data_dir, stores_dir, parse_errors))
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

    # moved_from integrity: each former UUID must be a well-formed UUIDv4, must not
    # point at its own owner, must not collide with a live uuid (that would make the
    # old id ambiguous), and must be claimed by only one entity (a unique redirect
    # target). These run regardless of --allow-missing-uuids.
    live_uuids = set(by_uuid)
    moved_malformed: list[tuple] = []  # (entity, value)
    moved_self: list[tuple] = []  # (entity, value): owner listed its own uuid
    moved_conflicts: list[tuple] = []  # (entity, value): value equals a live uuid
    moved_index: dict[str, list] = {}
    for e in entities:
        # Dedupe within one entity so a repeated entry isn't miscounted as two
        # separate claims (which would falsely read as a cross-entity duplicate).
        for old in dict.fromkeys(e.moved_from):
            if not UUID_RE.match(old):
                moved_malformed.append((e, old))
                continue
            if e.valid and old == e.raw_uuid:
                moved_self.append((e, old))
                continue
            if old in live_uuids:
                moved_conflicts.append((e, old))
            moved_index.setdefault(old, []).append(e)
    moved_duplicates = {old: es for old, es in moved_index.items() if len(es) > 1}

    # Unparseable files are always fatal, independent of --allow-missing-uuids: an
    # entity that can't be read can't be verified to have a UUID at all.
    ok = not (
        malformed
        or missing
        or duplicates
        or parse_errors
        or moved_malformed
        or moved_self
        or moved_conflicts
        or moved_duplicates
    )

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
                    "moved_from": {
                        "malformed": [
                            {
                                "type": e.entity_type,
                                "path": e.describe(project_root),
                                "moved_from": old,
                            }
                            for e, old in moved_malformed
                        ],
                        "self_references": [
                            {
                                "type": e.entity_type,
                                "path": e.describe(project_root),
                                "moved_from": old,
                            }
                            for e, old in moved_self
                        ],
                        "conflicts_with_live": [
                            {
                                "type": e.entity_type,
                                "path": e.describe(project_root),
                                "moved_from": old,
                            }
                            for e, old in moved_conflicts
                        ],
                        "duplicates": {
                            old: [e.describe(project_root) for e in es]
                            for old, es in moved_duplicates.items()
                        },
                    },
                    "parse_errors": parse_errors,
                },
                indent=2,
            )
        )
        return 0 if ok else 1

    _print_parse_errors(parse_errors)
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
    if moved_malformed:
        print(f"{len(moved_malformed)} malformed moved_from UUID(s):")
        for e, old in moved_malformed:
            print(f"  {e.entity_type:9} {e.describe(project_root)}  ->  {old!r}")
    if moved_self:
        print(f"{len(moved_self)} self-referential moved_from UUID(s):")
        for e, old in moved_self:
            print(f"  {e.entity_type:9} {e.describe(project_root)}  ->  {old}")
    if moved_conflicts:
        print(f"{len(moved_conflicts)} moved_from UUID(s) colliding with a live UUID:")
        for e, old in moved_conflicts:
            print(f"  {e.entity_type:9} {e.describe(project_root)}  ->  {old}")
    if moved_duplicates:
        print(f"{len(moved_duplicates)} moved_from UUID(s) claimed by multiple entities:")
        for old, es in moved_duplicates.items():
            print(f"  {old}")
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


def _extract_ref(ref: str, data_dir: Path, stores_dir: Path, dest: Path) -> tuple[Path, Path]:
    """Write ``data_dir``/``stores_dir`` as they are at git ``ref`` under ``dest``.

    Returns the extracted (data, stores) directories. Raises CalledProcessError when
    ``ref`` (or either directory at ``ref``) doesn't exist.
    """
    top = Path(
        subprocess.run(
            ["git", "-C", str(data_dir), "rev-parse", "--show-toplevel"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    ).resolve()
    rel = [d.resolve().relative_to(top).as_posix() for d in (data_dir, stores_dir)]
    with subprocess.Popen(
        ["git", "-C", str(top), "archive", "--format=tar", ref, "--", *rel],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    ) as proc:
        tar_error: tarfile.TarError | None = None
        try:
            with tarfile.open(fileobj=proc.stdout, mode="r|") as tar:
                tar.extractall(dest, filter="data")
        except tarfile.TarError as exc:  # e.g. an unknown ref yields an empty stream
            tar_error = exc
        stderr = proc.stderr.read().decode(errors="replace")
    if proc.returncode:
        raise subprocess.CalledProcessError(proc.returncode, "git archive", stderr=stderr)
    if tar_error is not None:
        raise ValueError(f"unreadable archive: {tar_error}")
    return dest / rel[0], dest / rel[1]


CONTINUITY_HINT = (
    "Each UUID above existed at the base but is neither live nor listed in any "
    "moved_from now. A rename/move must keep the entity's uuid (and its children's); "
    "an entity replaced by another should be deleted with a redirect, so the old uuid "
    "lands in the replacement's moved_from. If this is a genuine deletion with no "
    "replacement, a maintainer can accept it with the `uuid-removal-ok` PR label."
)


def _write_step_summary(ref: str, rows: list[dict[str, str]]) -> None:
    """Append a markdown report to the GitHub Actions job summary, when running there."""
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary:
        return
    lines = [f"### {len(rows)} canonical UUID(s) lost relative to `{ref}`", ""]
    lines += ["| UUID | Type | Path at base |", "| --- | --- | --- |"]
    lines += [f"| `{r['uuid']}` | {r['type']} | `{r['path']}` |" for r in rows]
    lines += ["", CONTINUITY_HINT, ""]
    with open(summary, "a", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


def run_continuity(args: argparse.Namespace) -> int:
    """Fail when a canonical UUID present at ``--base`` no longer resolves.

    ``ofd uuid check`` only sees the current tree, so it cannot notice a UUID that
    disappeared — e.g. an entity deleted and re-created under a new folder (the shape
    of PR #636), which drops its uuid and every child's. This compares against the
    base: each base UUID must still be live, or recorded in some ``moved_from``.
    """
    dirs = _resolve_dirs(args)
    if dirs is None:
        return 1
    data_dir, stores_dir = dirs

    with tempfile.TemporaryDirectory(prefix="ofd-uuid-base-") as tmp:
        try:
            base_data, base_stores = _extract_ref(args.base, data_dir, stores_dir, Path(tmp))
        except (subprocess.CalledProcessError, ValueError) as exc:
            detail = getattr(exc, "stderr", "") or str(exc)
            print(f"Error: could not read '{args.base}': {detail.strip()}", file=sys.stderr)
            return 1
        lost = find_lost_uuids(
            iter_entities(base_data, base_stores), iter_entities(data_dir, stores_dir)
        )
        rows = [
            {"uuid": e.raw_uuid, "type": e.entity_type, "path": e.describe(Path(tmp))} for e in lost
        ]

    if args.json:
        print(json.dumps({"success": not rows, "base": args.base, "lost": rows}, indent=2))
    elif rows:
        print(f"{len(rows)} canonical UUID(s) present at {args.base} no longer resolve:")
        for r in rows:
            print(f"  {r['uuid']}  {r['type']:9} {r['path']}")
        print()
        print(CONTINUITY_HINT)
    else:
        print(f"Every canonical UUID present at {args.base} still resolves.")

    if rows:
        _write_step_summary(args.base, rows)
    return 1 if rows else 0


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
