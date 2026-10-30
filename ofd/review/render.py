"""
Markdown for the summary comment and the inline review comments.

The summary is one comment per PR, found by ``MARKER`` and edited in place. The AI
part sits between ``AI_START``/``AI_END`` so a free re-check after a push can keep the
last model review instead of wiping it.
"""

import json
import re

from ofd.review.gitdata import ChangedFile
from ofd.review.jsonlines import line_of

MARKER = "<!-- ofd-ai-review -->"
AI_START = "<!-- ofd-ai-review:ai -->"
AI_END = "<!-- /ofd-ai-review:ai -->"

# Hidden markers: the commit the AI section reviewed, and the PR's model spend so far
# (read back by run.previous_spend for the per-PR budget).
AI_SHA = re.compile(r"<!-- ofd-ai-review:sha=([0-9a-f]{7,40}) -->")
SPEND = re.compile(r"<!-- ofd-ai-review:spent=([0-9.]+) -->")

ICONS = {"error": "🔴", "warning": "🟡", "note": "🔵"}


def quiet(text) -> str:
    """Text from the PR or the model, with @mentions defused so it can't ping anyone."""
    return re.sub(r"@(?=[A-Za-z0-9])", "@\u2060", str(text))


def parse_spend(body: str) -> float:
    match = SPEND.search(body or "")
    return float(match.group(1)) if match else 0.0


SEVERITY_ORDER = {"error": 0, "warning": 1, "note": 2}


def _bullet(level: str, path: str, message: str, pointer: str = "") -> str:
    where = f"`{path}`" + (f" `{pointer}`" if pointer else "")
    return f"- {ICONS.get(level, '•')} {where}: {quiet(message)}"


def _sorted(items: list[dict], key: str) -> list[dict]:
    return sorted(items, key=lambda f: (SEVERITY_ORDER.get(f.get(key), 9), f.get("path", "")))


def _value_line(e: dict) -> str:
    note = f" ({quiet(e['note'])})" if e.get("note") else ""
    value = json.dumps(e["value"], ensure_ascii=False)
    return f"- `{e['pointer']}` = `{value}` ({e['confidence']}, [source]({e['source_url']})){note}"


def suggestion_body(suggestion) -> str:
    lines = ["**Suggested data**, from the linked sources. Commit it if it checks out:", ""]
    lines += [_value_line(e) for e in suggestion.enrichments]
    lines += ["", "```suggestion", *suggestion.replacement, "```"]
    return "\n".join(lines)


def finding_tag(finding: dict, verdicts: dict | None) -> str:
    """How far a model finding has been checked by a script."""
    verdict = (verdicts or {}).get((finding.get("path"), finding.get("pointer") or ""))
    if verdict and verdict.get("verdict") == "verified":
        return " **(verified against the brand's site)**"
    if finding.get("evidence"):
        reason = f": {quiet(verdict['reason'])}" if verdict and verdict.get("reason") else ""
        return f" _(unverified{reason})_"
    return " _(unverified: AI opinion)_"


def inline_comments(
    model_review: dict | None,
    outcome,
    changes: list[ChangedFile],
    verdicts: dict | None = None,
) -> tuple[list[dict], list[dict]]:
    """``(comments, not_placed)`` for the PR review API.

    Model findings go inline when GitHub will accept their line; the rest are
    returned so the summary can list them.
    """
    by_path = {c.path: c for c in changes}
    comments: list[dict] = []
    not_placed: list[dict] = []
    for finding in (model_review or {}).get("findings", []):
        change = by_path.get(finding.get("path"))
        line = None
        if change and change.head_text:
            line = line_of(change.head_text, finding.get("pointer") or "")
        if change is None or line not in change.commentable:
            not_placed.append(finding)
            continue
        comments.append(
            {
                "path": change.path,
                "line": line,
                "side": "RIGHT",
                "body": f"{ICONS.get(finding['severity'], '')} {quiet(finding['message'])}"
                + finding_tag(finding, verdicts),
            }
        )
    for suggestion in outcome.suggestions if outcome else []:
        comment = {
            "path": suggestion.path,
            "line": suggestion.end_line,
            "side": "RIGHT",
            "body": suggestion_body(suggestion),
        }
        if suggestion.start_line != suggestion.end_line:
            comment["start_line"] = suggestion.start_line
            comment["start_side"] = "RIGHT"
        comments.append(comment)
    return comments, not_placed


def ai_section(result: dict) -> str:
    model = result.get("model")
    if not model:
        return ""
    lines = [AI_START, f"<!-- ofd-ai-review:sha={result['head_sha']} -->", "### AI review", ""]
    if model.get("error"):
        lines += [f"The model pass did not complete: {quiet(model['error'])}", ""]
        return "\n".join(lines + [AI_END])

    lines += [quiet(model.get("summary", "").strip()), ""]
    unread = [s for s in result.get("sources", []) if not s.get("ok")]
    if unread:
        lines += [
            "Sources the bot couldn't read (a maintainer should check these by hand): "
            + ", ".join(f"<{s['url']}> ({quiet(s['error'])})" for s in unread),
            "",
        ]
    if result.get("not_placed"):
        lines += ["**Other findings**", ""]
        verdicts = verdict_map(result)
        lines += [
            _bullet(f["severity"], f["path"], f["message"], f.get("pointer", ""))
            + finding_tag(f, verdicts)
            for f in _sorted(result["not_placed"], "severity")
        ]
        lines.append("")

    inline_findings = len(model.get("findings", [])) - len(result.get("not_placed", []))
    suggestions = result.get("suggestion_count", 0)
    if inline_findings or suggestions:
        bits = []
        if inline_findings:
            bits.append(f"{inline_findings} finding{'s' if inline_findings != 1 else ''}")
        if suggestions:
            bits.append(
                f"{suggestions} data suggestion{'s' if suggestions != 1 else ''} "
                f"(**Commit suggestion** applies one)"
            )
        lines += [f"Inline on the diff: {', '.join(bits)}.", ""]

    if result.get("manual"):
        lines += [
            "<details><summary>Data found for lines outside this diff (add by hand)</summary>",
            "",
        ]
        for enrichment, why in result["manual"]:
            lines.append(f"`{enrichment['path']}`, {why}:")
            lines.append(_value_line(enrichment))
        lines += ["", "</details>", ""]
    if result.get("rejected"):
        lines += ["<details><summary>Proposed values dropped by validation</summary>", ""]
        for enrichment, why in result["rejected"]:
            lines.append(f"- `{enrichment.get('path')}` `{enrichment.get('pointer')}`: {why}")
        lines += ["", "</details>", ""]

    lines.append(
        f"<sub>{model.get('model')} · ${model.get('cost_usd', 0):.2f} · reviewed "
        f"{result['head_sha'][:7]}</sub>"
    )
    return "\n".join(lines + [AI_END])


def verdict_map(result: dict) -> dict:
    return {(v["path"], v["pointer"]): v for v in result.get("finding_verdicts") or []}


def proofs_section(result: dict) -> list[str]:
    """Which changed values a script proved against the brand's site."""
    from ofd.automerge.proof import PROVABLE, Leaf, classify

    leaves = [Leaf(**d) for d in result.get("leaves") or []]
    if not leaves:
        return []
    provable = [leaf for leaf in leaves if classify(leaf) == PROVABLE]
    human = len(leaves) - len(provable)
    proofs = result.get("proofs") or {}
    proven = sum(1 for leaf in provable if (proofs.get(leaf.key) or {}).get("ok"))
    lines = [
        f"### Changed values: {proven} of {len(leaves)} proven",
        "",
    ]
    if provable:
        lines += ["| Value | | Source |", "|---|---|---|"]
        for leaf in provable:
            verdict = proofs.get(leaf.key) or {}
            value = quiet(json.dumps(leaf.after, ensure_ascii=False))
            if verdict.get("ok"):
                source = (verdict.get("proof") or {}).get("source_url", "")
                lines.append(
                    f"| `{leaf.path}` `{leaf.pointer}` = `{value}` | ✅ | [brand page]({source}) |"
                )
            else:
                reason = quiet(verdict.get("reason") or "no proof found")
                lines.append(f"| `{leaf.path}` `{leaf.pointer}` = `{value}` | ❌ | {reason} |")
        lines.append("")
    if human:
        lines.append(
            f"{human} change{'s' if human != 1 else ''} (names, colours, new or removed "
            "entries, sustainability, density and similar) can't be proven by a script and "
            "need a maintainer."
        )
        lines.append("")
    return lines


def automerge_section(result: dict) -> list[str]:
    repo = result.get("repo") or ""
    if not result.get("leaves"):
        return []
    link = f"https://github.com/{repo}/pull/{result['pr']}/checks" if repo else ""
    check = f"[`Auto-merge` check]({link})" if link else "`Auto-merge` check"
    return [
        "### Auto-merge",
        "",
        f"The {check} decides, not this comment. A PR auto-merges after an hour (add the "
        "`hold` label to stop it) only if every changed value is proven above, nothing "
        "contradicts the brand, the brand isn't claimed, no sustainability data is touched "
        "and every check is green. Anything else waits for a maintainer.",
        "",
    ]


def sustainability_section(result: dict) -> list[str]:
    sus = result.get("sustainability") or {}
    gate = sus.get("gate") or {}
    if not sus.get("touched"):
        return []
    icon = (
        "✅"
        if gate.get("state") == "success" and not gate.get("override")
        else ("⚠️" if gate.get("override") else "❌")
    )
    lines = [
        f"### 🌱 Sustainability data {icon}",
        "",
        "This PR touches sustainability data, so every figure was checked against its "
        "source (fetched, quote on the page, numbers in the quote, nothing invented) and "
        "by the AI review. The `Sustainability sources` status blocks the merge until all "
        "of it checks out.",
        "",
    ]
    model_checked = {
        (c.get("path"), c.get("pointer")): c
        for c in ((result.get("model") or {}).get("sustainability") or {}).get("checked") or []
    }
    for entry in sus.get("entries", []):
        ai = model_checked.get((entry["path"], entry["pointer"]))
        ok = not entry["errors"] and ai is not None and ai.get("verdict") == "ok"
        lines.append(
            f"- {'✅' if ok else '❌'} `{entry['path']}` `{entry['pointer']}` ({entry['status']})"
        )
        lines += [f"  - 🔴 {quiet(e)}" for e in entry["errors"]]
        lines += [f"  - 🟡 {quiet(w)}" for w in entry["warnings"]]
        if ai is None:
            lines.append("  - 🔴 not confirmed by the AI review")
        elif ai.get("verdict") != "ok":
            lines.append(f"  - 🔴 AI: {quiet(ai.get('note') or ai.get('verdict'))}")
    for entry in sus.get("removed", []):
        lines.append(f"- ❌ `{entry['path']}` `{entry['pointer']}` removed")
    lines += [f"- Trait changed: {t}" for t in sus.get("traits", [])]
    lines += [f"- ❌ Rule file changed: `{p}`" for p in sus.get("rule_paths", [])]
    lines.append("")
    if gate.get("override"):
        lines.append(
            f"**Overridden by {gate['override']}** with the `sustainability-verified` label "
            f"({len(gate.get('failures', []))} problem(s) above). Pushing new sustainability "
            "changes removes the label."
        )
    elif gate.get("state") != "success":
        lines.append(
            "**Blocked.** Fix the problems above and push, or, if a source can't be fetched "
            "automatically and a maintainer has checked it by hand, add the "
            "`sustainability-verified` label."
        )
    else:
        lines.append(f"**Verified:** {gate.get('description')}.")
    return lines + [""]


def claims_section(result: dict) -> list[str]:
    claimed = result.get("claimed_brands") or {}
    if not claimed:
        return []
    lines = ["### Claimed brands", ""]
    lines += [
        f"- `{brand}` is claimed by its manufacturer: {', '.join('@' + r for r in reps)} "
        "must approve this PR (the `Brand sign-off` status)."
        for brand, reps in claimed.items()
    ]
    return lines + [""]


def summary(result: dict, previous_ai: str = "", run_url: str = "", merge_url: str = "") -> str:
    lines = [
        MARKER,
        f"<!-- ofd-ai-review:spent={result.get('spent_usd', 0):.2f} -->",
        "## Automated review",
        "",
        f"Covers `{result['head_sha'][:7]}`.",
        "",
    ]
    lines += sustainability_section(result)
    lines += claims_section(result)
    lines += proofs_section(result)

    findings = _sorted(result.get("findings", []), "level")
    lines += ["### Checks", ""]
    if findings:
        lines += [
            _bullet(f["level"], f["path"], f["message"], f.get("pointer", "")) for f in findings
        ]
    else:
        lines.append("No issues found by the automated checks.")
    lines.append("")

    if result.get("flipflops"):
        lines += ["### Values going back and forth", ""]
        lines += [f"- `{ff['path']}`: {quiet(ff['message'])}" for ff in result["flipflops"]]
        lines.append("")

    ai = ai_section(result)
    if not ai and previous_ai:
        ai = mark_outdated(previous_ai, result["head_sha"])
    if ai:
        lines += [ai, ""]
    elif not result.get("model"):
        lines += [
            "<sub>No AI review on this run. A maintainer can ask for one by commenting "
            "`/review`.</sub>",
            "",
        ]

    lines += automerge_section(result)
    footer = f"<sub>Checks ran on {result['head_sha'][:7]}"
    footer += f" · [workflow run]({run_url})</sub>" if run_url else "</sub>"
    lines.append(footer)
    if merge_url:
        lines += ["", f"**Maintainers:** [✅ LGTM & merge]({merge_url})"]
    return "\n".join(lines) + "\n"


def mark_outdated(section: str, head: str) -> str:
    """Flag a carried-over AI section that reviewed an older commit."""
    match = AI_SHA.search(section)
    if match and head.startswith(match.group(1)):
        return section
    old = f" (`{match.group(1)[:7]}`)" if match else ""
    notice = (
        f"> ⚠️ **Outdated:** this AI review is of an earlier commit{old}, not "
        f"`{head[:7]}`. Comment `/review` for a fresh one."
    )
    # Replace any earlier notice rather than stacking them.
    section = re.sub(r"> ⚠️ \*\*Outdated:\*\*.*\n\n", "", section)
    return section.replace("### AI review\n", f"### AI review\n\n{notice}\n", 1)


def extract_ai_section(body: str) -> str:
    start, end = body.find(AI_START), body.find(AI_END)
    if start == -1 or end == -1:
        return ""
    return body[start : end + len(AI_END)]
