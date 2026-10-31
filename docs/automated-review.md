# Automated review

Every pull request gets one comment from the bot, updated on each push. It sticks to what needs doing. This page covers why it says what it says.

## What it checks

1. **Scripts** check every changed file against the mistakes maintainers kept fixing by hand: template temperatures, a datasheet link that is really a shop page, a multi-colour spool with one hex, a changed `id` or UUID, and similar. 🔴 means wrong, 🟡 very likely wrong, 🔵 worth a look.
2. **History**: a value being set back to one another contributor already replaced shows up as going "back and forth".
3. **The AI review** reads the diff and the sources the PR links to, and looks up data the PR left empty.
   - Anything it finds arrives as a suggestion. **Commit suggestion** applies it, and a script has already re-fetched its source.
   - When it finds nothing, it says nothing.
   - It never asks contributors to fill in fields, or to "confirm" a page. It opens the page itself.
   - Its findings are opinions unless a script verified them against the brand's site.

Committing the bot's own suggestions doesn't trigger another AI pass: the last one is carried forward.

## Auto-merge

The **Auto-merge** check decides, after an hour with every check green. Adding the `hold` label stops it.

| The PR... | Bar |
|---|---|
| **adds** data: a new brand, filament, colour, spool, store or logo | Merges unless the AI review raises a 🔴 error on it. |
| **changes** existing values | Every changed value must be proven by a script on the brand's own site (temperatures, drying, fan, flow, enclosure, datasheets, TD, GTIN, article number). Anything else, such as a name, colour, trait or link, needs a maintainer. |
| **deletes** or renames anything | Always needs a maintainer. |

It never auto-merges claimed brands (their representative signs off), sustainability data, or PRs spanning several brands. The full checklist (E1–E22) is in [`ofd/automerge/eligibility.py`](../ofd/automerge/eligibility.py) and on each PR's Auto-merge check.

## Sustainability data

Sustainability figures feed CO2 calculations, so the `Sustainability sources` status fails closed. Every figure must be on its source, verbatim, and confirmed by the AI review. See [the manual](manual.md#-sustainability-data).

A maintainer who has checked a figure by hand can add the `sustainability-verified` label. A later push that touches sustainability data removes the label again.

A PR that changes the rules themselves (the schemas, `ofd/review/sustainability.py`, this workflow) needs a maintainer's eyes. That requirement is already met when a maintainer opened the PR.

## Commands

- `/review` (maintainers): run a fresh AI review.
- `ai-review` label: the same.
- `hold` label: stop auto-merge.

Known gaps are listed in [ai-review-known-issues.md](ai-review-known-issues.md).
