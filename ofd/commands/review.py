"""
Review command - Automated review of a data pull request.

Sub-actions:
    ofd review run --pr N [--no-ai] [--output FILE] [--post]
                            Run the checks (and, unless --no-ai, one Claude pass) on
                            PR N and print the summary comment it would post
    ofd review post --input FILE
                            Post a result written by ``run --output``
    ofd review applied --pr N --head SHA [--since SHA]
                            Whether the commits since the last AI review only apply
                            its own suggestions (prints carry=<sha> for CI)

See ofd/review/__init__.py for what each tier does, and
.github/workflows/ai_review.yaml for how CI runs it.
"""

import argparse
import json
import os
import sys
from pathlib import Path

from ofd.review import applied, github
from ofd.review.model import DEFAULT_BUDGET_USD, DEFAULT_MODEL
from ofd.review.run import post, render, review

# Project root for resolving relative paths (ofd/commands/review.py -> repo root).
project_root = Path(__file__).parent.parent.parent


def register_subcommand(subparsers: argparse._SubParsersAction) -> None:
    """Register the review subcommand and its actions."""
    parser = subparsers.add_parser(
        "review",
        help="Automated review of a data pull request",
        description="Check a pull request for common data mistakes and research missing data.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  ofd review run --pr 699 --no-ai      Deterministic checks only, print the summary
  ofd review run --pr 699              Checks plus one Claude pass (needs the claude CLI)
  ofd review run --pr 699 --post       ...and post the summary and suggestions
        """,
    )
    actions = parser.add_subparsers(dest="action", required=True, metavar="<action>")

    repo_default = os.environ.get("GITHUB_REPOSITORY", github.DEFAULT_REPO)

    p_run = actions.add_parser("run", help="Review a pull request")
    p_run.add_argument("--pr", type=int, required=True, help="Pull request number")
    p_run.add_argument("--repo", default=repo_default, help="owner/name (default: %(default)s)")
    p_run.add_argument(
        "--ai",
        choices=("always", "auto", "never"),
        default="always",
        help="Model pass: always, never, or auto = only when sustainability data is touched "
        "(default: %(default)s). Sustainability changes fail the gate without one.",
    )
    p_run.add_argument(
        "--no-ai", dest="ai", action="store_const", const="never", help="Same as --ai never"
    )
    p_run.add_argument("--model", default=DEFAULT_MODEL, help="Model id (default: %(default)s)")
    p_run.add_argument(
        "--budget", type=float, default=DEFAULT_BUDGET_USD, help="USD cap (default: %(default)s)"
    )
    p_run.add_argument(
        "--head-dir", type=Path, help="Existing checkout of the PR head for the model to read"
    )
    p_run.add_argument(
        "--carry-from",
        metavar="SHA",
        help="Carry the AI review of this commit forward instead of a model pass "
        "(see `review applied`)",
    )
    p_run.add_argument("--output", type=Path, help="Write the result JSON here")
    p_run.add_argument("--post", action="store_true", help="Post to the pull request")
    p_run.add_argument(
        "--drop-override",
        action="store_true",
        help="Remove the sustainability-verified label if this PR touches sustainability",
    )
    p_run.set_defaults(func=run_review)

    p_post = actions.add_parser("post", help="Post a result written by `run --output`")
    p_post.add_argument("--input", type=Path, required=True, help="Result JSON")
    p_post.add_argument("--repo", default=repo_default, help="owner/name (default: %(default)s)")
    p_post.add_argument(
        "--drop-override",
        action="store_true",
        help="Remove the sustainability-verified label if this PR touches sustainability",
    )
    p_post.set_defaults(func=run_post)

    p_applied = actions.add_parser(
        "applied", help="Do the new commits only apply the review's own suggestions?"
    )
    p_applied.add_argument("--pr", type=int, required=True, help="Pull request number")
    p_applied.add_argument("--repo", default=repo_default, help="owner/name (default: %(default)s)")
    p_applied.add_argument("--head", required=True, help="The PR's head commit")
    p_applied.add_argument(
        "--since", help="The reviewed commit (default: from the summary comment)"
    )
    p_applied.set_defaults(func=run_applied)


def run_review(args: argparse.Namespace) -> int:
    try:
        result = review(
            project_root,
            args.repo,
            args.pr,
            ai=args.ai,
            model=args.model,
            budget_usd=args.budget,
            head_dir=args.head_dir,
            carry_from=args.carry_from,
        )
    except github.GitHubError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    if args.output:
        args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    if args.post:
        return post(args.repo, result, args.drop_override)
    print(render(result))
    for comment in result.get("comments", []):
        print(f"--- inline: {comment['path']}:{comment['line']}\n{comment['body']}\n")
    gate = result["sustainability"]["gate"]
    print(
        f"{gate['state'].upper()}: Sustainability sources: {gate['description']}", file=sys.stderr
    )
    return 0


def run_post(args: argparse.Namespace) -> int:
    result = json.loads(args.input.read_text(encoding="utf-8"))
    try:
        return post(args.repo, result, args.drop_override)
    except github.GitHubError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


def run_applied(args: argparse.Namespace) -> int:
    """Prints ``carry=<sha>`` (empty for a full review), for $GITHUB_OUTPUT."""
    sha, reason = applied.check(args.repo, args.pr, args.head, args.since)
    print(
        f"#{args.pr}: {'carry the review forward' if sha else 'full review'}: {reason}",
        file=sys.stderr,
    )
    print(f"carry={sha or ''}")
    return 0
