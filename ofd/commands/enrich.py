"""
Enrich command - Research and fill missing data for existing brands.

    ofd enrich run --brand <id> [--limit N] [--dry-run] [--report FILE] [--pr-body FILE]
    ofd enrich gaps --brand <id> [--limit N]

``run`` edits the working tree; review it with ``git diff``. See ofd/enrich/__init__.py
for how values are researched and verified, and .github/workflows/enrich.yaml for how
CI turns a run into one PR per brand.
"""

import argparse
import json
import sys
from pathlib import Path

from ofd.enrich.gaps import brand_gaps
from ofd.enrich.run import DEFAULT_LIMIT, claimed_by, enrich_brand, pr_body
from ofd.review.checks import MaterialStats
from ofd.review.gitdata import TreeReader
from ofd.review.model import DEFAULT_BUDGET_USD, DEFAULT_MODEL

# Project root for resolving relative paths (ofd/commands/enrich.py -> repo root).
project_root = Path(__file__).parent.parent.parent


def register_subcommand(subparsers: argparse._SubParsersAction) -> None:
    """Register the enrich subcommand and its actions."""
    parser = subparsers.add_parser(
        "enrich",
        help="Research and fill missing data for existing brands",
        description="Find a brand's missing fields, research them, verify every source and write the results.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  ofd enrich gaps --brand bambu_lab        List what is missing, no model call
  ofd enrich run --brand bambu_lab         Research, verify and edit the files
  ofd enrich run --brand bambu_lab --dry-run --pr-body body.md
        """,
    )
    actions = parser.add_subparsers(dest="action", required=True, metavar="<action>")

    p_gaps = actions.add_parser("gaps", help="List a brand's gaps")
    p_gaps.add_argument("--brand", required=True, help="Brand folder id")
    p_gaps.add_argument(
        "--limit", type=int, default=DEFAULT_LIMIT, help="Max gaps (default: %(default)s)"
    )
    p_gaps.add_argument(
        "--no-sustainability", action="store_true", help="Leave sustainability sections out"
    )
    p_gaps.set_defaults(func=run_gaps)

    p_run = actions.add_parser("run", help="Research and fill a brand's gaps")
    p_run.add_argument("--brand", required=True, help="Brand folder id")
    p_run.add_argument(
        "--limit", type=int, default=DEFAULT_LIMIT, help="Max gaps (default: %(default)s)"
    )
    p_run.add_argument("--model", default=DEFAULT_MODEL, help="Model id (default: %(default)s)")
    p_run.add_argument(
        "--budget", type=float, default=DEFAULT_BUDGET_USD, help="USD cap (default: %(default)s)"
    )
    p_run.add_argument("--dry-run", action="store_true", help="Verify but don't edit files")
    p_run.add_argument(
        "--no-sustainability",
        action="store_true",
        help="Don't research sustainability data (#768) this run",
    )
    p_run.add_argument("--report", type=Path, help="Write the run report JSON here")
    p_run.add_argument("--pr-body", type=Path, help="Write the PR description here")
    p_run.set_defaults(func=run_enrich)


def run_gaps(args: argparse.Namespace) -> int:
    stats = MaterialStats(TreeReader(project_root, "HEAD"))
    representatives = claimed_by(project_root, args.brand)
    if representatives:
        print(f"Claimed by {', '.join(representatives)}: template values are not re-checked.")
    gaps = brand_gaps(
        project_root,
        args.brand,
        stats,
        args.limit,
        sustainability=not args.no_sustainability,
        claimed=bool(representatives),
    )
    for gap in gaps:
        recheck = f" (recheck {', '.join(gap.recheck)})" if gap.recheck else ""
        print(f"{gap.label}: {', '.join(gap.missing) or '-'}{recheck}")
    return 0


def run_enrich(args: argparse.Namespace) -> int:
    try:
        report = enrich_brand(
            project_root,
            args.brand,
            limit=args.limit,
            model=args.model,
            budget_usd=args.budget,
            write=not args.dry_run,
            research_sustainability=not args.no_sustainability,
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    if args.report:
        args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    body = pr_body(report)
    if args.pr_body:
        args.pr_body.write_text(body, encoding="utf-8")
    else:
        print(body)
    return 1 if (report.get("model") or {}).get("error") else 0
