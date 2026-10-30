"""Tests for the sustainability gate (ofd/review/sustainability.py).

The gate must fail closed: these pin every way a sustainability change can get past
review, so a regression shows up here before it shows up in consumer marketing.
"""

import pytest
from test_review import PLA, Repo, filament

from ofd.enrich.verify import Page, normalize
from ofd.review.gitdata import TreeReader, changed_files
from ofd.review.render import summary
from ofd.review.sustainability import (
    Entry,
    brand_site_name,
    check_quote,
    find_touches,
    gate,
    verify_all,
    verify_sourced,
)

URL = "https://blog.acme3d.com/recycled-pla"
PAGE = (
    "Acme rPLA is made from 100 % of recycled Acme PLA materials collected from our own "
    "factory floor. The results show 5.85 kg of CO2 with 1kg of pure Acme PETG, a study "
    "done in SimaPro 9.3.0.2."
)


class FakeFetcher:
    def __init__(self, pages=None, fail=()):
        self.pages = pages or {URL: PAGE}
        self.fail = set(fail)

    def get(self, url):
        if url in self.fail or url not in self.pages:
            return Page(url, False, error="HTTP 403")
        return Page(url, True, normalize(self.pages[url]))


def recycled(**extra):
    return {
        "pct": 100,
        "type": "post_industrial",
        "evidence": "supplier_declaration",
        "source_type": "primary",
        "source_url": URL,
        "source_quote": "made from 100 % of recycled Acme PLA materials",
        "retrieved": "2026-10-21",
        **extra,
    }


def footprint(**extra):
    return {
        "value_kg_co2e": 5.85,
        "declared_unit": "per_kg_filament",
        "boundary": "filament_cradle_to_gate",
        "packaging_included": "unknown",
        "biogenic_carbon": "unknown",
        "recycled_allocation": "not_applicable",
        "method": "lca",
        "verification": "none",
        "publicly_available": True,
        "source_type": "primary",
        "source_url": URL,
        "source_quote": "The results show 5.85 kg of CO2 with 1kg of pure Acme PETG",
        "retrieved": "2026-10-21",
        **extra,
    }


def errors_for(section, data, fetcher=None):
    return verify_sourced(section, data, fetcher or FakeFetcher(), "acme3d")


# --- verification of one entry ---------------------------------------------------


def test_a_correct_entry_passes():
    assert errors_for("recycled_content", recycled()) == ([], [])
    errors, _ = errors_for("carbon_footprints", footprint(tool="SimaPro 9.3.0.2"))
    assert errors == []


def test_quote_must_be_on_the_page():
    errors, _ = errors_for(
        "recycled_content", recycled(source_quote="made from 100 % recycled materials")
    )
    assert any("not found on the source page" in e for e in errors)


def test_number_must_be_in_the_quote():
    errors, _ = errors_for("recycled_content", recycled(pct=90))
    assert any("90 is not in source_quote" in e for e in errors)


def test_ellipsis_cannot_splice_a_number_out_of_context():
    """'100 % … materials' would show the number without what it is about."""
    errors, _ = errors_for(
        "recycled_content", recycled(source_quote="100 %… recycled Acme PLA materials")
    )
    assert errors


def test_unreachable_source_fails_closed():
    errors, _ = errors_for("recycled_content", recycled(), FakeFetcher(fail={URL}))
    assert any("could not verify" in e for e in errors)


def test_offset_wording_is_never_stored():
    errors, _ = errors_for("recycled_content", recycled(notes="Offset to carbon neutral"))
    assert any("must never be stored" in e for e in errors)


def test_invented_details_are_errors():
    errors, _ = errors_for("carbon_footprints", footprint(standard="ISO 14067", verifier="TÜV"))
    assert sum("is not on the source page" in e for e in errors) == 2


def test_iso_evidence_needs_the_standard_on_the_page():
    errors, _ = errors_for("recycled_content", recycled(evidence="iso_14021"))
    assert any("14021" in e for e in errors)


def test_qualified_percentage_must_not_be_exact():
    page = {URL: "Our spools contain up to 89 % recycled material from partners."}
    data = recycled(pct=89, source_quote="contain up to 89 % recycled material")
    errors, _ = errors_for("recycled_content", data, FakeFetcher(page))
    assert any("pct_qualifier" in e for e in errors)
    errors, _ = errors_for(
        "recycled_content", {**data, "pct_qualifier": "up_to"}, FakeFetcher(page)
    )
    assert errors == []


def test_primary_source_off_the_brand_site_warns():
    other = "https://www.retailer.com/acme"
    data = recycled(source_url=other)
    errors, warnings = errors_for("recycled_content", data, FakeFetcher({other: PAGE}))
    assert errors == []
    assert any("not on the brand's own site" in w for w in warnings)


def test_brand_site_without_a_scheme_or_on_a_marketplace():
    assert brand_site_name("bambulab.com") == "bambulab"
    assert brand_site_name("https://www.mosaicmfg.com") == "mosaicmfg"
    # A marketplace page as "website" must not make every listing there first-party.
    assert brand_site_name("https://www.amazon.com/stores/XZN/page/1") is None
    assert brand_site_name("https://www.microcenter.com/search/search_results.aspx") is None
    assert brand_site_name("") is None


def test_quote_too_short_around_the_number():
    page = Page(URL, True, normalize("blah 100 % blah"))
    assert any("too short" in e for e in check_quote("100 %", [100], page))


# --- what a PR touches -----------------------------------------------------------


@pytest.fixture
def repo(tmp_path):
    return Repo(tmp_path)


def touches(repo, base, head, extra_paths=()):
    changes, _ = changed_files(repo.path, base, head)
    paths = [c.path for c in changes] + list(extra_paths)
    touch = find_touches(changes, paths)
    verify_all(touch, TreeReader(repo.path, head), FakeFetcher())
    return touch


def ok_model(touch):
    return {
        "sustainability": {
            "verdict": "ok",
            "summary": "",
            "checked": [
                {"path": e.path, "pointer": e.pointer, "verdict": "ok", "note": ""}
                for e in touch.entries
            ],
        }
    }


def test_untouched_pr_passes_without_a_model(repo):
    repo.write(f"{PLA}/basic/filament.json", filament())
    base = repo.commit()
    repo.write(f"{PLA}/basic/filament.json", filament(min_print_temperature=200))
    touch = touches(repo, base, repo.commit())
    assert not touch.any
    assert gate(touch, None)["state"] == "success"


def test_new_entry_needs_the_model_even_when_sources_check_out(repo):
    repo.write(
        "data/acme/brand.json", {"id": "acme", "name": "Acme", "website": "https://acme3d.com"}
    )
    repo.write(f"{PLA}/basic/filament.json", filament())
    base = repo.commit()
    repo.write(
        f"{PLA}/basic/filament.json", filament(sustainability={"recycled_content": recycled()})
    )
    touch = touches(repo, base, repo.commit())
    assert [e.pointer for e in touch.entries] == ["/sustainability/recycled_content"]
    assert touch.entries[0].errors == []

    assert gate(touch, None)["state"] == "failure"
    assert gate(touch, {"error": "budget"})["state"] == "failure"
    assert gate(touch, {"sustainability": None})["state"] == "failure"
    assert gate(touch, ok_model(touch))["state"] == "success"


def test_model_problem_verdict_fails(repo):
    repo.write(f"{PLA}/basic/filament.json", filament())
    base = repo.commit()
    repo.write(
        f"{PLA}/basic/filament.json", filament(sustainability={"recycled_content": recycled()})
    )
    touch = touches(repo, base, repo.commit())
    model = ok_model(touch)
    model["sustainability"]["checked"][0]["verdict"] = "problem"
    assert gate(touch, model)["state"] == "failure"


def test_failed_source_check_fails_even_with_a_happy_model(repo):
    repo.write(f"{PLA}/basic/filament.json", filament())
    base = repo.commit()
    bad = recycled(pct=95, source_quote="made from 95 % of recycled Acme PLA materials")
    repo.write(f"{PLA}/basic/filament.json", filament(sustainability={"recycled_content": bad}))
    touch = touches(repo, base, repo.commit())
    assert gate(touch, ok_model(touch))["state"] == "failure"


def test_override_passes_but_keeps_the_failures(repo):
    repo.write(f"{PLA}/basic/filament.json", filament())
    base = repo.commit()
    repo.write(
        f"{PLA}/basic/filament.json", filament(sustainability={"recycled_content": recycled()})
    )
    touch = touches(repo, base, repo.commit())
    result = gate(touch, None, override="@maintainer")
    assert result["state"] == "success"
    assert result["failures"]


def test_removed_entry_fails(repo):
    repo.write(
        f"{PLA}/basic/filament.json", filament(sustainability={"recycled_content": recycled()})
    )
    base = repo.commit()
    repo.write(f"{PLA}/basic/filament.json", filament())
    touch = touches(repo, base, repo.commit())
    assert [e.status for e in touch.removed] == ["removed"]
    assert gate(touch, ok_model(touch))["state"] == "failure"


def test_unchanged_entries_are_not_rechecked(repo):
    repo.write(
        f"{PLA}/basic/filament.json", filament(sustainability={"recycled_content": recycled()})
    )
    base = repo.commit()
    repo.write(
        f"{PLA}/basic/filament.json",
        filament(min_print_temperature=200, sustainability={"recycled_content": recycled()}),
    )
    assert not touches(repo, base, repo.commit()).any


def test_container_details_and_footprint_arrays_are_found(repo):
    path = f"{PLA}/basic/black/sizes.json"
    repo.write(path, [{"filament_weight": 1000, "diameter": 1.75}])
    repo.write(f"{PLA}/basic/filament.json", filament())
    base = repo.commit()
    details = {
        "recycled_pct": 100,
        **{k: v for k, v in recycled().items() if k.startswith("source") or k == "retrieved"},
    }
    repo.write(path, [{"filament_weight": 1000, "diameter": 1.75, "container_details": details}])
    repo.write(
        f"{PLA}/basic/filament.json", filament(sustainability={"carbon_footprints": [footprint()]})
    )
    touch = touches(repo, base, repo.commit())
    assert sorted(e.pointer for e in touch.entries) == [
        "/0/container_details",
        "/sustainability/carbon_footprints/0",
    ]


def test_trait_and_rule_changes_count_as_touching(repo):
    path = f"{PLA}/basic/black/variant.json"
    repo.write(path, {"id": "black", "name": "Black", "color_hex": "#000000"})
    base = repo.commit()
    repo.write(
        path, {"id": "black", "name": "Black", "color_hex": "#000000", "traits": {"recycled": True}}
    )
    touch = touches(repo, base, repo.commit(), ["schemas/sustainability_schema.json"])
    assert touch.traits and touch.rule_paths
    # A rule change always needs a maintainer, whatever the model says.
    assert gate(touch, ok_model(touch))["state"] == "failure"


def test_summary_shows_the_gate(repo):
    entry = Entry(
        f"{PLA}/basic/filament.json",
        "/sustainability/recycled_content",
        "recycled_content",
        recycled(),
    )
    entry.errors.append("quote text not found on the source page")
    result = {
        "head_sha": "abc1234",
        "sustainability": {
            "touched": True,
            "entries": [entry.to_dict()],
            "removed": [],
            "traits": [],
            "rule_paths": [],
            "gate": {"state": "failure", "description": "1 problem", "failures": ["x"]},
        },
    }
    text = summary(result)
    assert "🌱 Sustainability data ❌" in text
    assert "quote text not found" in text
    assert "**Blocked.**" in text


def test_reviewer_never_suggests_sustainability_values(repo):
    from ofd.review.suggest import build_suggestions

    repo.write(f"{PLA}/basic/filament.json", filament())
    base = repo.commit()
    repo.write(f"{PLA}/basic/filament.json", filament(min_print_temperature=200))
    changes, _ = changed_files(repo.path, base, repo.commit())
    path = f"{PLA}/basic/filament.json"
    outcome = build_suggestions(
        [
            {
                "path": path,
                "pointer": "/sustainability",
                "value": {},
                "source_url": URL,
                "confidence": "high",
            },
        ],
        changes,
    )
    assert outcome.suggestions == []
    assert outcome.rejected[0][1] == "sustainability data is never suggested"


# --- a new push always wins ------------------------------------------------------


class FakeGitHub:
    """Stands in for ofd.review.github; records every write."""

    def __init__(self, head):
        self.head = head
        self.writes = []

    def pull_request(self, repo, number):
        return {"head": {"sha": self.head}, "labels": []}

    def set_status(self, *args, **kwargs):
        self.writes.append(("status", args))

    def upsert_comment(self, *args):
        self.writes.append(("comment", args))

    def create_review(self, *args):
        self.writes.append(("review", args))

    def find_marker_comment(self, *args):
        return None


def _result(head):
    return {
        "pr": 1,
        "head_sha": head,
        "has_data": True,
        "labels": [],
        "findings": [],
        "flipflops": [],
        "model": None,
        "comments": [],
        "sustainability": {
            "touched": False,
            "entries": [],
            "removed": [],
            "traits": [],
            "rule_paths": [],
            "log_changed": False,
        },
    }


def test_superseded_review_posts_nothing(monkeypatch):
    from ofd.review import run

    fake = FakeGitHub(head="b" * 40)
    monkeypatch.setattr(run, "github", fake)
    assert run.post("o/r", _result("a" * 40)) == 0
    assert fake.writes == []

    flagged = {**_result("b" * 40), "superseded": True}
    assert run.post("o/r", flagged) == 0
    assert fake.writes == []


def test_current_review_posts_status_and_comment(monkeypatch):
    from ofd.review import run

    fake = FakeGitHub(head="a" * 40)
    monkeypatch.setattr(run, "github", fake)
    assert run.post("o/r", _result("a" * 40)) == 0
    assert [kind for kind, _ in fake.writes] == ["status", "comment"]


def test_head_change_before_the_model_pass_skips_it(monkeypatch, repo):
    from ofd.review import run

    repo.write(f"{PLA}/basic/filament.json", filament())
    base = repo.commit()
    repo.write(f"{PLA}/basic/filament.json", filament(min_print_temperature=200))
    head = repo.commit()

    calls = []
    monkeypatch.setattr(run, "fetch_pr", lambda *a: (base, head, base))
    monkeypatch.setattr(run, "github", FakeGitHub(head="f" * 40))
    monkeypatch.setattr(run, "_model_pass", lambda *a, **k: calls.append(a))
    result = run.review(repo.path, "o/r", 1, ai="always")
    assert calls == []
    assert result["superseded"] is True


# --- proof mode ---------------------------------------------------------------------


def _proof_result():
    path = f"{PLA}/basic/filament.json"
    leaves = [
        {
            "path": path,
            "pointer": "/min_print_temperature",
            "op": "modify",
            "before": 190,
            "after": 200,
            "kind": "filament",
            "file_status": "M",
        },
        {
            "path": path,
            "pointer": "/max_print_temperature",
            "op": "modify",
            "before": 230,
            "after": 240,
            "kind": "filament",
            "file_status": "M",
        },
        {
            "path": path,
            "pointer": "/density",
            "op": "modify",
            "before": 1.24,
            "after": 1.25,
            "kind": "filament",
            "file_status": "M",
        },
    ]
    proofs = {
        f"{path}#/min_print_temperature": {"ok": True, "reason": "", "proof": {"source_url": URL}},
        f"{path}#/max_print_temperature": {
            "ok": False,
            "reason": "quote not on the page",
            "proof": None,
        },
    }
    return {**_result("a" * 40), "repo": "o/r", "leaves": leaves, "proofs": proofs}


def test_summary_tables_proven_and_unproven_values():
    text = summary(_proof_result())
    assert "Changed values: 1 of 3 proven" in text
    assert "| ✅ | [brand page](" in text
    assert "quote not on the page" in text
    assert "1 change (names" in text
    assert "https://github.com/o/r/pull/1/checks" in text


def test_findings_are_tagged_by_script_verdict():
    from ofd.review.render import finding_tag

    finding = {
        "path": "p",
        "pointer": "/x",
        "evidence": {"source_url": URL, "quote": "q", "value": 1},
    }
    assert "verified against" in finding_tag(finding, {("p", "/x"): {"verdict": "verified"}})
    assert "unverified: off-site" in finding_tag(
        finding, {("p", "/x"): {"verdict": "unverified", "reason": "off-site"}}
    )
    assert "AI opinion" in finding_tag({"path": "p", "pointer": "/x"}, {})


def test_only_script_verified_contradictions_become_fixes(monkeypatch, repo):
    from ofd.automerge.proof import diff_leaves
    from ofd.review import run

    repo.write(f"{PLA}/basic/filament.json", filament(min_print_temperature=190))
    base = repo.commit()
    repo.write(f"{PLA}/basic/filament.json", filament(min_print_temperature=200))
    head = repo.commit()
    changes, _ = changed_files(repo.path, base, head)
    leaves = [leaf for c in changes for leaf in diff_leaves(c)]

    monkeypatch.setattr(run, "verify_proofs", lambda *a: {"k": {"ok": False}})
    monkeypatch.setattr(
        run,
        "verify_finding",
        lambda finding, *a: {
            "verdict": "verified" if finding["evidence"]["value"] == 210 else "unverified",
            "reason": "",
        },
    )
    path = f"{PLA}/basic/filament.json"
    ai = {
        "proofs": [],
        "findings": [
            {
                "path": path,
                "pointer": "/min_print_temperature",
                "severity": "error",
                "message": "m",
                "evidence": {"source_url": URL, "quote": "q", "value": 210},
            },
            {
                "path": path,
                "pointer": "/min_print_temperature",
                "severity": "error",
                "message": "m",
                "evidence": {"source_url": URL, "quote": "q", "value": 999},
            },
            {"path": path, "pointer": "/name", "severity": "note", "message": "opinion"},
        ],
    }
    result = {"finding_verdicts": []}
    fixes = run._check_model_claims(
        result, ai, changes, leaves, object(), TreeReader(repo.path, base), repo.path
    )
    assert [f["value"] for f in fixes] == [210]
    assert [v["verdict"] for v in result["finding_verdicts"]] == ["verified", "unverified"]
    assert result["proofs"] == {"k": {"ok": False}}
