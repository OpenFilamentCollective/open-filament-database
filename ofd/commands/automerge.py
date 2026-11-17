"""
Automerge command - proof-based auto-merge for data PRs.

    ofd automerge evaluate --pr N [--review review.json] [--post]
    ofd automerge sweep [--dry-run]

``evaluate`` scores a PR against the eligibility checklist (see
ofd/automerge/eligibility.py) and, with ``--post``, records it as the ``Auto-merge``
check run. ``sweep`` merges every PR that has been eligible for an hour at its head.
``OFD_AUTOMERGE`` (off, shadow, on) decides whether anything is posted or merged;
see .github/workflows/auto_merge.yaml.
"""

import argparse
import json
import os
from pathlib import Path

from ofd.review.github import DEFAULT_REPO

project_root = Path(__file__).parent.parent.parent


def register_subcommand(subparsers: argparse._SubParsersAction) -> None:
    parser = subparsers.add_parser(
        "automerge",
        help="Proof-based auto-merge for data PRs",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    actions = parser.add_subparsers(dest="action", required=True, metavar="<action>")
    repo_default = os.environ.get("GITHUB_REPOSITORY", DEFAULT_REPO)

    p_eval = actions.add_parser("evaluate", help="Score one PR against the checklist")
    p_eval.add_argument("--pr", type=int, required=True, help="Pull request number")
    p_eval.add_argument("--repo", default=repo_default, help="owner/name (default: %(default)s)")
    p_eval.add_argument("--review", type=Path, help="review.json from the AI review run")
    p_eval.add_argument("--post", action="store_true", help="Post the Auto-merge check run")
    p_eval.add_argument("--json", action="store_true", help="Print the checklist as JSON")
    p_eval.set_defaults(func=run_evaluate)

    p_sweep = actions.add_parser("sweep", help="Merge PRs eligible for an hour")
    p_sweep.add_argument("--repo", default=repo_default, help="owner/name (default: %(default)s)")
    p_sweep.add_argument("--dry-run", action="store_true", help="Report, never merge or post")
    p_sweep.set_defaults(func=run_sweep)


def run_evaluate(args: argparse.Namespace) -> int:
    from ofd.automerge.merge import evaluate_pr

    review = json.loads(args.review.read_text(encoding="utf-8")) if args.review else None
    result = evaluate_pr(args.repo, project_root, args.pr, review, post=args.post)
    if args.json:
        print(
            json.dumps(
                {
                    "eligible": result.eligible,
                    "head_sha": result.head_sha,
                    "items": [vars(i) for i in result.items],
                },
                indent=2,
            )
        )
    else:
        verdict = (
            "eligible" if result.eligible else f"not eligible ({len(result.failures)} reasons)"
        )
        print(f"#{args.pr} at {result.head_sha[:7]}: {verdict}")
    return 0


def run_sweep(args: argparse.Namespace) -> int:
    from ofd.automerge.merge import sweep

    outcome = sweep(args.repo, project_root, dry_run=args.dry_run)
    for number, what in sorted(outcome.items()):
        if what != "not eligible":
            print(f"#{number}: {what}")
    return 1 if any(w.startswith("error") for w in outcome.values()) else 0
