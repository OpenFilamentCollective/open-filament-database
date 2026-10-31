"""
Markdown for the summary comment and the inline review comments.

The summary is one comment per PR, found by ``MARKER`` and edited in place. It says
only what needs doing: what the PR does, its problems, and whether it can auto-merge.
The reasons behind the rules live in ``docs/automated-review.md``, linked from it.
The AI part sits between ``AI_START``/``AI_END`` so a free re-check after a push can
keep the last model review instead of wiping it.
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
DOC = "docs/automated-review.md"


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
    lines = [_value_line(e) for e in suggestion.enrichments]
    lines += ["", "```suggestion", *suggestion.replacement, "```"]
    return "\n".join(lines)


def finding_tag(finding: dict, verdicts: dict | None) -> str:
    """How far a model finding has been checked by a script."""
    verdict = (verdicts or {}).get((finding.get("path"), finding.get("pointer") or ""))
    if verdict and verdict.get("verdict") == "verified":
        return " **(verified on the brand's site)**"
    if finding.get("evidence"):
        reason = f": {quiet(verdict['reason'])}" if verdict and verdict.get("reason") else ""
        return f" _(unverified{reason})_"
    return " _(AI opinion)_"


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


def doc_link(result: dict, anchor: str = "") -> str:
    repo = result.get("repo") or ""
    base = f"https://github.com/{repo}/blob/main/{DOC}" if repo else DOC
    return base + (f"#{anchor}" if anchor else "")


def ai_section(result: dict) -> str:
    model = result.get("model")
    if not model:
        return ""
    reviewed = model.get("carried_from") or result["head_sha"]
    lines = [AI_START, f"<!-- ofd-ai-review:sha={reviewed} -->"]
    if model.get("error"):
        lines += [f"_The AI review didn't complete: {quiet(model['error'])}_", ""]
        return "\n".join(lines + [AI_END])
    if model.get("carried_from"):
        lines += [
            f"_AI review of `{reviewed[:7]}`, carried over: the new commits only apply its "
            "suggestions._",
            "",
        ]
    if model.get("summary", "").strip():
        lines += [quiet(model["summary"].strip()), ""]

    verdicts = verdict_map(result)
    lines += [
        _bullet(f["severity"], f["path"], f["message"], f.get("pointer", ""))
        + finding_tag(f, verdicts)
        for f in _sorted(result.get("not_placed") or [], "severity")
    ]
    unread = [s for s in result.get("sources", []) if not s.get("ok")]
    if unread:
        lines.append(
            "- ⚪ Couldn't read, check by hand: "
            + ", ".join(f"<{s['url']}> ({quiet(s['error'])})" for s in unread)
        )
    inline = len(model.get("findings", [])) - len(result.get("not_placed") or [])
    suggestions = result.get("suggestion_count", 0)
    bits = []
    if inline:
        bits.append(f"{inline} comment{'s' if inline != 1 else ''}")
    if suggestions:
        bits.append(f"{suggestions} suggestion{'s' if suggestions != 1 else ''}")
    if bits:
        lines.append(f"- 💬 {' and '.join(bits)} on the diff")
    if lines[-1] != "":
        lines.append("")

    if result.get("manual"):
        lines += ["<details><summary>Data found outside the diff (add by hand)</summary>", ""]
        for enrichment, why in result["manual"]:
            lines.append(f"`{enrichment['path']}`, {why}:")
            lines.append(_value_line(enrichment))
        lines += ["", "</details>", ""]
    lines.append(f"<sub>{model.get('model')} · ${model.get('cost_usd', 0):.2f}</sub>")
    return "\n".join(lines + [AI_END])


def verdict_map(result: dict) -> dict:
    return {(v["path"], v["pointer"]): v for v in result.get("finding_verdicts") or []}


def proofs_section(result: dict) -> list[str]:
    """The changed values a script checked on the brand's site, folded away."""
    from ofd.automerge.proof import HUMAN, PROVABLE, Leaf, classify

    leaves = [Leaf(**d) for d in result.get("leaves") or []]
    changed = [leaf for leaf in leaves if classify(leaf) in (PROVABLE, HUMAN)]
    provable = [leaf for leaf in changed if classify(leaf) == PROVABLE]
    if not provable:
        return []
    proofs = result.get("proofs") or {}
    proven = sum(1 for leaf in provable if (proofs.get(leaf.key) or {}).get("ok"))
    lines = [
        f"<details><summary>Changed values: {proven} of {len(changed)} proven</summary>",
        "",
        "| Value | | Source |",
        "|---|---|---|",
    ]
    for leaf in provable:
        verdict = proofs.get(leaf.key) or {}
        value = quiet(json.dumps(leaf.after, ensure_ascii=False))
        if verdict.get("ok"):
            source = (verdict.get("proof") or {}).get("source_url", "")
            cell = f"✅ | [brand page]({source})"
        else:
            cell = f"❌ | {quiet(verdict.get('reason') or 'no proof found')}"
        lines.append(f"| `{leaf.path}` `{leaf.pointer}` = `{value}` | {cell} |")
    return lines + ["", "</details>", ""]


def automerge_section(result: dict) -> list[str]:
    """One line: can this merge on its own, and if not, what holds it."""
    from ofd.automerge.proof import HUMAN, NEW, PROVABLE, Leaf, classify

    leaves = [Leaf(**d) for d in result.get("leaves") or []]
    if not leaves:
        return []
    kinds = [classify(leaf) for leaf in leaves]
    proofs = result.get("proofs") or {}
    human = [leaf for leaf, kind in zip(leaves, kinds, strict=True) if kind == HUMAN]
    unproven = [
        leaf
        for leaf, kind in zip(leaves, kinds, strict=True)
        if kind == PROVABLE and not (proofs.get(leaf.key) or {}).get("ok")
    ]
    model = result.get("model") or {}
    holds = []
    if human:
        first = human[0]
        holds.append(
            f"{len(human)} change{'s' if len(human) != 1 else ''} to existing data "
            f"(e.g. `{first.path}` `{first.pointer or first.op}`)"
        )
    if unproven:
        holds.append(f"{len(unproven)} changed value{'s' if len(unproven) != 1 else ''} unproven")
    if NEW in kinds and any(f.get("severity") == "error" for f in model.get("findings") or []):
        holds.append("a 🔴 AI finding")
    if any(f.get("level") in ("error", "warning") for f in result.get("findings") or []):
        holds.append("the checks above")
    if result.get("flipflops"):
        holds.append("values going back and forth")
    if (result.get("sustainability") or {}).get("touched"):
        holds.append("sustainability data")
    if result.get("claimed_brands"):
        holds.append("a claimed brand")

    repo = result.get("repo") or ""
    link = f"https://github.com/{repo}/pull/{result['pr']}/checks" if repo else ""
    check = f"[Auto-merge check]({link})" if link else "Auto-merge check"
    if holds:
        verdict = f"needs a maintainer: {'; '.join(holds)}."
    else:
        verdict = "can merge on its own an hour after every check is green (`hold` stops it)."
    return [f"**Auto-merge:** {verdict} The {check} decides.", ""]


def sustainability_section(result: dict) -> list[str]:
    sus = result.get("sustainability") or {}
    gate = sus.get("gate") or {}
    if not sus.get("touched"):
        return []
    why = f"([why]({doc_link(result, 'sustainability-data')}))"
    if gate.get("override"):
        return [
            f"- 🌱 Sustainability: {len(gate.get('failures', []))} problem(s) overridden by "
            f"{gate['override']}.",
        ]
    if gate.get("state") == "success":
        return [f"- 🌱 Sustainability: {gate.get('description')}."]

    model_checked = {
        (c.get("path"), c.get("pointer")): c
        for c in ((result.get("model") or {}).get("sustainability") or {}).get("checked") or []
    }
    lines = [f"- 🌱 **Sustainability blocked** {why}:"]
    for entry in sus.get("entries", []):
        where = f"`{entry['path']}` `{entry['pointer']}`"
        lines += [f"  - 🔴 {where}: {quiet(e)}" for e in entry["errors"]]
        lines += [f"  - 🟡 {where}: {quiet(w)}" for w in entry["warnings"]]
        ai = model_checked.get((entry["path"], entry["pointer"]))
        if ai is None:
            lines.append(f"  - 🔴 {where}: not confirmed by the AI review")
        elif ai.get("verdict") != "ok":
            lines.append(f"  - 🔴 {where}: {quiet(ai.get('note') or ai.get('verdict'))}")
    lines += [f"  - 🔴 `{e['path']}` `{e['pointer']}` removed" for e in sus.get("removed", [])]
    lines += [f"  - 🔴 `{p}` changes the rules" for p in sus.get("rule_paths", [])]
    return lines


def claims_section(result: dict) -> list[str]:
    return [
        f"- 🏷️ `{brand}` is claimed: {', '.join('@' + r for r in reps)} must approve "
        "(`Brand sign-off`)."
        for brand, reps in (result.get("claimed_brands") or {}).items()
    ]


def summary(result: dict, previous_ai: str = "", run_url: str = "", merge_url: str = "") -> str:
    lines = [
        MARKER,
        f"<!-- ofd-ai-review:spent={result.get('spent_usd', 0):.2f} -->",
        f"**Automated review** of `{result['head_sha'][:7]}` · "
        f"[how this works]({doc_link(result)})",
        "",
    ]
    ai = ai_section(result)
    if not ai and previous_ai:
        ai = mark_outdated(previous_ai, result["head_sha"])
    if ai:
        lines += [ai, ""]

    issues = sustainability_section(result) + claims_section(result)
    issues += [
        _bullet(f["level"], f["path"], f["message"], f.get("pointer", ""))
        for f in _sorted(result.get("findings", []), "level")
    ]
    issues += [
        f"- 🔁 `{ff['path']}`: {quiet(ff['message'])}" for ff in result.get("flipflops") or []
    ]
    if issues:
        lines += issues + [""]
    if not ai and not result.get("model") and result.get("has_data"):
        lines += ["<sub>No AI review on this run; comment `/review` for one.</sub>", ""]

    lines += automerge_section(result)
    lines += proofs_section(result)
    footer = []
    if merge_url:
        footer.append(f"**Maintainers:** [✅ LGTM & merge]({merge_url})")
    if run_url:
        footer.append(f"<sub>[workflow run]({run_url})</sub>")
    if footer:
        lines.append(" · ".join(footer))
    return "\n".join(lines).rstrip() + "\n"


def mark_outdated(section: str, head: str) -> str:
    """Flag a carried-over AI section that reviewed an older commit."""
    match = AI_SHA.search(section)
    if match and head.startswith(match.group(1)):
        return section
    old = f" (`{match.group(1)[:7]}`)" if match else ""
    notice = (
        f"> ⚠️ **Outdated:** this AI review is of an earlier commit{old}. "
        "Comment `/review` for a fresh one."
    )
    # Replace any earlier notice rather than stacking them.
    section = re.sub(r"> ⚠️ \*\*Outdated:\*\*.*\n\n", "", section)
    head_line = AI_SHA.search(section)
    if not head_line:
        return f"{notice}\n\n{section}"
    cut = head_line.end() + 1
    return f"{section[:cut]}{notice}\n\n{section[cut:]}"


def extract_ai_section(body: str) -> str:
    start, end = body.find(AI_START), body.find(AI_END)
    if start == -1 or end == -1:
        return ""
    return body[start : end + len(AI_END)]
