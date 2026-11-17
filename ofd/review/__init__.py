"""
Automated pull-request review for data contributions.

Cheapest first, the same shape as the translation tooling in SimplyPrint's site repo:

1. ``checks``   - deterministic, diff-aware rules for the mistakes reviewers kept
                  correcting by hand (template temperatures, collapsed multi-colour
                  hexes, changed ids, datasheet links that are shop pages...).
2. ``flipflop`` - walks the history of every field the PR changes and reports a
                  value that is being set back to something another author already
                  replaced (A -> B -> A).
3. ``model``    - one Claude pass over the diff, with the findings above as context,
                  that reviews what needs judgement and researches missing data.
                  Its output is schema-checked JSON; it never writes to the repo.
4. ``post``     - validates every proposed value against the schemas, turns the
                  survivors into GitHub ```suggestion``` blocks, and keeps a single
                  summary comment per PR up to date.

Nothing here executes code from the pull request: both sides of the diff are read
as blobs with ``git cat-file``, so the same code is safe for fork PRs under
``pull_request_target`` (see ``.github/workflows/ai_review.yaml``).
"""
