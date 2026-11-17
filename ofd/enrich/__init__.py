"""
Enrichment of existing data: research what a brand's entries are missing, prove it,
and write it into the tree for a maintainer to review as a normal PR.

Where ``ofd review`` looks at what a contributor changed, this looks at what is
already merged:

1. ``gaps``   - which filaments and spools of the brand lack temperatures, datasheets,
                GTINs or purchase links, or still carry the generic template values.
2. one Claude pass (``ofd.review.model``, Haiku by default) researches them and
                returns values with the URL and the verbatim text it read them from.
3. ``verify`` - fetches every source again, independently of the model, and keeps a
                value only if the quote is really on that page and the value is really
                in the quote. Links must load, GTINs must pass the checksum.
4. ``apply``  - writes the survivors in the repo's JSON style and re-checks the schema.

The workflow (``.github/workflows/enrich.yaml``) commits each brand to its own branch
and opens a PR, where the usual validation and AI review run on it like on any other
contribution. Nothing is merged without a human.
"""
