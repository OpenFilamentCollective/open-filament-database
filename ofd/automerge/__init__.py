"""
Proof-based auto-merge for data PRs.

A PR merges without a maintainer only when every value it changes is proven by the
brand's own site (``proof``), every condition of the checklist holds (``eligibility``),
and it has stayed that way at the same commit for an hour (``record``, ``merge``).
"""
