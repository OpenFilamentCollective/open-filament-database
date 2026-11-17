"""
Brand claims - brands whose representatives must sign off on changes to their data.

A maintainer records a claim in ``ofd/brand_claims.json`` once a brand has verified
who speaks for it. Any PR that touches ``data/<brand_id>/`` of a claimed brand then
needs an approving review from one of that brand's representatives on the PR's current
head commit (or must be authored by one) before the ``Brand sign-off`` status passes.

This module is pure logic; the GitHub I/O lives in ``ofd/commands/claims.py``.
"""

import json
import re
from pathlib import Path

CLAIMS_FILE = Path("ofd") / "brand_claims.json"

# GitHub logins: alphanumerics and single hyphens, not at either end, max 39 chars.
LOGIN_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$")


def _claims_object(raw) -> dict | None:
    claims = raw.get("claims") if isinstance(raw, dict) else None
    return claims if isinstance(claims, dict) else None


def _representatives(entry) -> list | None:
    reps = entry.get("representatives") if isinstance(entry, dict) else None
    return reps if isinstance(reps, list) and reps else None


def load_claims(path: Path) -> dict[str, list[str]]:
    """Read the claims registry as ``{brand_id: [github_login, ...]}``.

    Raises ``ValueError`` when the registry is malformed (see ``validate_claims``).
    """
    raw = json.loads(path.read_text(encoding="utf-8"))
    claims = _claims_object(raw)
    if claims is None:
        raise ValueError(f"{path}: top-level 'claims' must be an object")
    result = {}
    for brand, entry in claims.items():
        reps = _representatives(entry)
        if reps is None:
            raise ValueError(f"{path}: {brand}: 'representatives' must be a non-empty list")
        result[brand] = list(reps)
    return result


def validate_claims(path: Path, data_dir: Path) -> list[str]:
    """Return a list of problems with the registry (empty when it is well-formed)."""
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        return [f"{path}: cannot read: {e}"]

    claims = _claims_object(raw)
    if claims is None:
        return [f"{path}: top-level 'claims' must be an object"]

    errors = []
    for brand, entry in claims.items():
        if not (data_dir / brand / "brand.json").is_file():
            errors.append(f"{brand}: no such brand (data/{brand}/brand.json missing)")
        reps = _representatives(entry)
        if reps is None:
            errors.append(f"{brand}: 'representatives' must be a non-empty list of GitHub logins")
            continue
        for login in reps:
            if not isinstance(login, str) or not LOGIN_RE.match(login):
                errors.append(f"{brand}: invalid GitHub login {login!r}")
    return errors


def brands_touched(paths: list[str]) -> set[str]:
    """Brand ids whose ``data/<brand_id>/`` folder contains any of ``paths``."""
    brands = set()
    for p in paths:
        parts = p.split("/")
        if len(parts) >= 3 and parts[0] == "data":
            brands.add(parts[1])
    return brands


def latest_review_states(reviews: list[dict]) -> dict[str, dict]:
    """Each reviewer's (lowercased login) review that currently counts.

    Mirrors GitHub: a plain COMMENTED review does not replace an earlier approval or
    change request, but a later APPROVED / CHANGES_REQUESTED / DISMISSED does. Reviews
    arrive from the API in chronological order.
    """
    latest: dict[str, dict] = {}
    for r in reviews:
        user = (r.get("user") or {}).get("login")
        if not user or r.get("state") in ("COMMENTED", "PENDING"):
            continue
        latest[user.lower()] = r
    return latest


def evaluate(
    changed_paths: list[str],
    claims: dict[str, list[str]],
    author: str,
    reviews: list[dict],
    head_sha: str,
) -> dict[str, dict]:
    """Sign-off state for every claimed brand the PR touches.

    Returns ``{brand_id: {"representatives": [...], "signed_off_by": login | None,
    "changes_requested_by": [...]}}``. An approval only counts when it was given on
    ``head_sha``: data pushed after a representative approved has not been seen by them.
    """
    latest = latest_review_states(reviews)
    result = {}
    for brand in sorted(brands_touched(changed_paths) & claims.keys()):
        reps = claims[brand]
        signed = None
        blocked = []
        for rep in reps:
            if rep.lower() == author.lower():
                signed = signed or rep
                continue
            r = latest.get(rep.lower())
            if not r:
                continue
            if r["state"] == "APPROVED" and r.get("commit_id") == head_sha:
                signed = signed or rep
            elif r["state"] == "CHANGES_REQUESTED":
                blocked.append(rep)
        result[brand] = {
            "representatives": reps,
            "signed_off_by": signed,
            "changes_requested_by": blocked,
        }
    return result


def pending_brands(state: dict[str, dict]) -> list[str]:
    """Brands still blocking: nobody signed off, or a representative requested changes."""
    return [b for b, s in state.items() if not s["signed_off_by"] or s["changes_requested_by"]]
