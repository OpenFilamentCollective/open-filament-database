"""
What of the model's output reaches the PR.

Maintainers kept answering the same kinds of noise on #799-#831: "these fields are
empty, add them", "please confirm which page is right", "strip the tracking
parameters". The guidelines say to research those instead, or say nothing, but
the model doesn't always listen, so this is the safety net:

- ``filter_findings`` drops findings about empty fields (researching them is the
  bot's job; anything it found arrives as a suggestion) and requests to confirm or
  check something without evidence (the bot can fetch the page itself). Tracking
  parameters are stripped on merge by ``style_data.py``, so they're never news.
- ``clean_summary`` drops the same kinds of sentence from the summary, plus "I
  couldn't reach the page" (the script lists unreadable sources itself).
- ``verify_enrichments`` re-checks every proposed value with the same rules
  ``ofd enrich`` uses before it becomes a suggestion: the page loads, the quote is
  on it, the value is in the quote, the GTIN's check digit holds, the store exists.
"""

import re
from pathlib import Path

from ofd.enrich import verify as rules
from ofd.enrich.verify import Fetcher, normalize, number_in
from ofd.review.checks import ENRICHABLE
from ofd.review.gitdata import ChangedFile
from ofd.review.jsonlines import resolve

# A finding that only asks someone else to do the checking.
_ASKS_TO_CHECK = re.compile(
    r"\b(?:please\s+)?(?:confirm|double[- ]check|verify)\b"
    r"|\bcheck (?:that|whether|if|the|each|every|it|this)\b"
    r"|\bif (?:you can|one exists|available|you have)\b",
    re.IGNORECASE,
)
_TRACKING = re.compile(r"tracking param|utm_|gclid|gad_|gbraid|stkn", re.IGNORECASE)

_KNOWN_FIELDS = (
    rules.TEMPERATURE_FIELDS
    | set(rules.NUMBER_FIELDS)
    | rules.SHEET_FIELDS
    | {"enclosure", "gtin", "article_number", "purchase_links"}
)


def _empty(value) -> bool:
    return value in (None, "", [], {})


def _head_value(change: ChangedFile | None, pointer: str):
    if change is None or change.after is None:
        return None
    try:
        return resolve(change.after, pointer)
    except (KeyError, IndexError, TypeError, ValueError):
        return None


def _about_empty_field(finding: dict, change: ChangedFile | None) -> bool:
    pointer = finding.get("pointer") or ""
    field = pointer.rsplit("/", 1)[-1]
    enrichable = change is not None and field in ENRICHABLE.get(change.kind, ())
    if not (enrichable or pointer.startswith("/traits") or "/traits/" in pointer):
        return False
    return _empty(_head_value(change, pointer))


def drop_reason(finding: dict, change: ChangedFile | None) -> str | None:
    """Why a model finding shouldn't be posted, or None to keep it."""
    pointer = finding.get("pointer") or ""
    # Evidence-backed findings are judged by a script, and sustainability findings
    # feed the gate: neither is ever dropped here.
    if finding.get("evidence") or "sustainability" in pointer or "container_details" in pointer:
        return None
    message = finding.get("message") or ""
    if _TRACKING.search(message):
        return "tracking parameters are stripped on merge"
    if _about_empty_field(finding, change):
        return "an empty field is for the bot to research, not to report"
    if finding.get("severity") != "error" and _ASKS_TO_CHECK.search(message):
        return "asks someone else to check instead of checking"
    return None


def filter_findings(findings: list[dict], changes: list[ChangedFile]) -> tuple[list, list]:
    """``(kept, dropped)``; each dropped item is ``{**finding, "dropped": reason}``."""
    by_path = {c.path: c for c in changes}
    kept, dropped = [], []
    for finding in findings:
        reason = drop_reason(finding, by_path.get(finding.get("path")))
        if reason:
            dropped.append({**finding, "dropped": reason})
        else:
            kept.append(finding)
    return kept, dropped


_SUMMARY_NOISE = re.compile(
    r"\b(?:are|is|remain|still) (?:still )?(?:empty|missing|blank|unset)\b"
    r"|\bno (?:gtin|barcode|article number|purchase links?|links?|datasheet)s? yet\b"
    r"|\bcould(?: not|n't) (?:reach|read|load|open|fetch|access|confirm|verify|find)"
    r"|\bunable to (?:reach|read|load|open|fetch|access|confirm|verify)"
    r"|\b(?:are|is|remain) unverified\b"
    r"|\bthe empty\b|\bfound no\b|\bnothing to propose\b|\bcould be sourced\b"
    r"|\bnone (?:are|were|is) (?:proposed|suggested)\b"
    r"|\b(?:have|has|did) not (?:proposed|suggested)\b"
    r"|tracking param",
    re.IGNORECASE,
)
# Sentences, and the clauses of a sentence joined by "; ".
_SENTENCE = re.compile(r"(?<=[.!?])\s+|;\s+")


def clean_summary(text: str) -> str:
    """The summary without sentences about empty fields or unreadable pages."""
    parts = [p for p in _SENTENCE.split(text.strip()) if p]
    kept = [p for p in parts if not _SUMMARY_NOISE.search(p)]
    if len(kept) == len(parts):
        return text.strip()
    out = " ".join(p if p.endswith((".", "!", "?")) else p + "." for p in kept)
    return out


def verify_enrichment(enrichment: dict, fetcher: Fetcher, stores_dir: Path) -> str | None:
    """None when a script could confirm the proposed value, otherwise why not."""
    pointer = str(enrichment.get("pointer") or "")
    field = pointer.rsplit("/", 1)[-1]
    value = enrichment.get("value")
    if field in _KNOWN_FIELDS:
        return rules.verify(enrichment, fetcher, stores_dir)
    if "/traits/" in pointer or pointer.startswith("/traits/"):
        if value is not True:
            return "a trait is only ever proposed as true"
        return rules._verify_quoted(enrichment, fetcher)
    # Anything else (empty spool weight, TD...): the quote must be on the page and,
    # for a number or a string, hold the value.
    if problem := rules._verify_quoted(enrichment, fetcher):
        return problem
    quote = normalize(enrichment.get("source_quote") or "")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return None if number_in(value, quote) else "value is not in the quote"
    if isinstance(value, str):
        return None if normalize(value) in quote else "value is not in the quote"
    return "only numbers, text and traits can be checked"


def verify_enrichments(
    enrichments: list[dict], fetcher: Fetcher, stores_dir: Path
) -> tuple[list[dict], list[tuple[dict, str]]]:
    """``(verified, rejected)``; rejected items carry the reason, as ``Outcome`` does."""
    verified, rejected = [], []
    for enrichment in enrichments:
        try:
            problem = verify_enrichment(enrichment, fetcher, stores_dir)
        except (KeyError, TypeError, ValueError) as exc:
            problem = f"could not be checked ({exc})"
        if problem:
            rejected.append((enrichment, problem))
        else:
            verified.append(enrichment)
    return verified, rejected


def proof_candidates(enrichments: list[dict]) -> list[dict]:
    """Enrichments in the shape of ``proofs``, so applied suggestions can be proven."""
    return [
        {
            "path": e["path"],
            "pointer": e["pointer"],
            "value": e["value"],
            "source_url": e["source_url"],
            "quote": e["source_quote"],
        }
        for e in enrichments
        if e.get("source_quote") and e.get("source_url") and e.get("path") and e.get("pointer")
    ]
