# AI review and auto-merge: known issues

What still doesn't work, found by dry-running the review on the 19 open data PRs (#791 to #820) on 2026-10-30 and auditing every claim against the brands' own pages. The code lives in `ofd/review/` and `ofd/automerge/`; `python -m ofd review run --pr N` (without `--post`) reproduces any of this locally.

## Review accuracy

- **Script-built shops are still only partly readable.** The review now hands the model the data a script-built page renders from (inline JSON, or same-site `*data*.js` files such as Add-North's `/initial-data.js`). Matching a record in a multi-megabyte catalogue to the right product is still hit and miss: on #818 it catches 6 of the 11 drying temperatures that disagree with Add-North's data, all six correctly, and misses the other five. Shops that render through an API call rather than a data file aren't covered at all.
- **The model sometimes still says it couldn't read something.** The guidelines tell it not to, and the script now lists unreadable sources itself, but Haiku occasionally adds a sentence anyway (#818, #820). It no longer turns that into findings.
- **Sources behind bot protection** (HTTP 403 or 429 without a Wayback copy) are listed as unreadable for a maintainer. Nothing gets around them, deliberately.
- **Large PRs get a light review.** On PRs with more than ~70 values (#815, #816) the model spot-checks rather than checking every value.

## Changes after the first live day (#799 to #831)

Maintainer notes on the first 40 live PRs led to these changes:

- **Additions auto-merge.** New files under `data/` and `stores/` (brands, materials, filaments, colours, spools, stores, logos) and spool rows appended to an existing `sizes.json` no longer need a proof. They merge on green checks unless the AI review raises a 🔴 error on the PR (E22). Changes to existing values still need proofs. Deletions and renames never auto-merge. #823, #824, #826, #829 and #830 would now have merged.
- **Fill it in or say nothing.** The review no longer asks contributors to add empty fields, to "confirm" or "check" a page, or to strip tracking parameters (these are stripped on merge).
  - The guidelines tell the model to research such values into suggestions.
  - `ofd/review/triage.py` drops findings of this kind that still slip through. They are listed under `dropped_findings` in `review.json`.
  - The `missing_purchase_links`, `trait_from_name` and `sibling_trait_parity` checks are now research leads for the model, not posted notes.
- **Suggestions are checked by a script** with the `ofd enrich` rules: the page loads, the quote is on it, the GTIN's check digit holds, and the store exists. Each suggestion now needs a `source_quote`. A suggestion that has been committed can then be proven like any other value.
- **Applying the bot's own suggestions doesn't buy another model pass.** When every new commit is a "Commit suggestion" commit (`ofd/review/applied.py`), the free checks run on the new head and the last AI review is carried forward.
- **The brand sign-off relay failed on every PR review.** A `#` in its unquoted `run:` line started a YAML comment, and the failed `relay` check blocked auto-merge (E16). Fixed on main ("Fix formatting in workflow").

## Proofs and auto-merge

- **Proofs use the brand's website from main.** A brand whose `website` is wrong can't have anything proven until the fix is merged (#821 fixes 18 brands).
- **A product name that differs from the brand's naming blocks proof.** OFD calls Polymaker's line "PET CoPE", while Polymaker's table says "Panchroma CoPE", so none of #815's 69 correct values can be proven. That's the safe outcome. The fix is either renaming the filament or allowing an alias.
- **Generic product names** ("PLA") are weak anchors for "this page is about this product". The sibling-name and title checks reduce the risk, which is the reason for running shadow mode first.
- **The model attempts proofs for a minority of the values it could prove.** 52 of 596 values were proven in the dry run. Auto-merge of *changes* will therefore be rare at first; additions don't need proofs.
- **Proofs are re-fetched at merge time**, so a page that changed or started blocking bots makes a PR not eligible (fail-closed).
- **First-time contributors' checks wait for maintainer approval**, so their PRs can't qualify until a maintainer approves the workflow run.

## Data problems found along the way

Fixed in separate PRs: wrong brand websites (#821) and wrong origin country codes (#822). Still open:

- **`precision_3d_filament`:** its website now redirects to a gambling site. `website` is required, and no replacement was found.
- **`altana`:** ALTANA makes resins (Cubic Ink), not filament, and has no filaments in the database. It probably shouldn't be a brand here.
- **No site, or a marketplace page as website:** amazonbasics, ovv3d, locyfens and ameleis (domains dead or Amazon-only), kimya (defunct since 2024), and voxelab (broken certificate). The review now ignores marketplace "websites" (Amazon, Micro Center, Best Buy and so on) instead of treating every listing there as first-party.
- **Unconfirmed sites:** tinmorry (probably tinmorry.net), tecbears (Facebook page; probably tecbears.com), 3dpower (parked domain) and professional_lab.
- **Unconfirmed origins:** tinmorry, ovv3d and ataraxia_art say `CH`, probably meaning China. Hatchbox says `CN` but is a California company, depending on what `origin` means.
