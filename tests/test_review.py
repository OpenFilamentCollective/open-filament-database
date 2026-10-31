"""Tests for the automated PR review (ofd/review).

Every case builds a throwaway git repo, commits a "base" and a "PR head", and runs
the review tiers on the two SHAs, the same way CI does. Cases are anchored to the
PRs whose hand-fixes motivated them.
"""

import json
import os
import subprocess

import pytest

from ofd.review.checks import MaterialStats, run_checks
from ofd.review.flipflop import _MISSING, Change, FlipFlop, detect
from ofd.review.gitdata import TreeReader, changed_files
from ofd.review.jsonlines import line_of, pointer_lines
from ofd.review.render import extract_ai_section, inline_comments, summary
from ofd.review.suggest import build_suggestions

PLA = "data/acme/PLA"


class Repo:
    def __init__(self, path):
        self.path = path
        self._git("init", "-q", "-b", "main")

    def _git(self, *args, author="Alice"):
        env = {
            **os.environ,
            "GIT_AUTHOR_NAME": author,
            "GIT_AUTHOR_EMAIL": f"{author.lower()}@example.com",
            "GIT_COMMITTER_NAME": author,
            "GIT_COMMITTER_EMAIL": f"{author.lower()}@example.com",
        }
        return subprocess.run(
            ["git", *args], cwd=self.path, env=env, check=True, capture_output=True, text=True
        ).stdout.strip()

    def write(self, rel, obj):
        target = self.path / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    def commit(self, author="Alice", message="change"):
        self._git("add", "-A")
        self._git("commit", "-q", "--allow-empty", "-m", message, author=author)
        return self._git("rev-parse", "HEAD")


@pytest.fixture
def repo(tmp_path):
    return Repo(tmp_path)


def review(repo, base, head):
    changes, _ = changed_files(repo.path, base, head)
    findings = run_checks(changes, TreeReader(repo.path, base), TreeReader(repo.path, head))
    return changes, findings


def rules(findings):
    return sorted(f.rule for f in findings)


def filament(fid="basic", **extra):
    return {"id": fid, "name": fid.title(), "density": 1.24, "diameter_tolerance": 0.02, **extra}


TEMPLATE = {
    "min_print_temperature": 190,
    "max_print_temperature": 230,
    "min_bed_temperature": 50,
    "max_bed_temperature": 70,
}


# --- checks ---------------------------------------------------------------------


def test_template_temperatures_shared_by_many_brands_are_flagged(repo):
    """#699: 51 ROSA3D lines shipped with the generic PLA values."""
    for i in range(10):
        repo.write(f"data/brand{i}/PLA/basic/filament.json", filament(**TEMPLATE))
    base = repo.commit()
    repo.write(f"{PLA}/new/filament.json", filament("new", **TEMPLATE))
    head = repo.commit()
    _, findings = review(repo, base, head)
    assert rules(findings) == ["template_values"]
    assert "10 brands" in findings[0].message


def test_vendor_temperatures_are_not_flagged(repo):
    for i in range(10):
        repo.write(f"data/brand{i}/PLA/basic/filament.json", filament(**TEMPLATE))
    base = repo.commit()
    repo.write(
        f"{PLA}/new/filament.json", filament("new", **{**TEMPLATE, "max_bed_temperature": 60})
    )
    head = repo.commit()
    assert review(repo, base, head)[1] == []


def test_changed_id_is_an_error(repo):
    """#235: "We don't ever change IDs, they are atomic"."""
    repo.write(f"{PLA}/basic/filament.json", filament())
    base = repo.commit()
    repo.write(f"{PLA}/basic/filament.json", {**filament(), "id": "basic_pla"})
    head = repo.commit()
    _, findings = review(repo, base, head)
    assert rules(findings) == ["identity_changed"]
    assert findings[0].level == "error"


def test_collapsed_multicolor_hex_is_flagged_once(repo):
    """#327: eight ColorMorph variants lost their second colour."""
    path = f"{PLA}/colormorph/colormorph_blue_green/variant.json"
    repo.write(
        path,
        {
            "id": "colormorph_blue_green",
            "name": "ColorMorph Blue & Green",
            "color_hex": ["#0000FF", "#00FF00"],
        },
    )
    base = repo.commit()
    repo.write(
        path,
        {"id": "colormorph_blue_green", "name": "ColorMorph Blue & Green", "color_hex": "#0000FF"},
    )
    head = repo.commit()
    assert rules(review(repo, base, head)[1]) == ["multicolor_collapsed"]


def test_new_dual_color_with_one_hex_is_flagged(repo):
    """#373: "Dual Color Gold to Purple" with a single hex."""
    base = repo.commit()
    repo.write(
        f"{PLA}/silk/gold_purple/variant.json",
        {"id": "gold_purple", "name": "Dual Color Gold Purple", "color_hex": "#FFD700"},
    )
    head = repo.commit()
    assert "multicolor_single_hex" in rules(review(repo, base, head)[1])


def test_identical_tds_and_sds_and_shop_page_sheet(repo):
    """#323 (same link twice) and #337 (store listing as a datasheet)."""
    base = repo.commit()
    url = "https://shop.example.com/products/pla?variant=1"
    repo.write(f"{PLA}/basic/filament.json", filament(data_sheet_url=url, safety_sheet_url=url))
    head = repo.commit()
    found = rules(review(repo, base, head)[1])
    assert found.count("sheet_url_is_shop_page") == 2
    assert "sheet_urls_identical" in found


def test_nonstandard_diameter_is_flagged(repo):
    base = repo.commit()
    repo.write(f"{PLA}/basic/black/sizes.json", [{"filament_weight": 1000, "diameter": 1.25}])
    head = repo.commit()
    assert rules(review(repo, base, head)[1]) == ["nonstandard_diameter"]


def test_trait_hint_from_name(repo):
    base = repo.commit()
    repo.write(
        f"{PLA}/silk/gold/variant.json", {"id": "gold", "name": "Gold", "color_hex": "#FFD700"}
    )
    head = repo.commit()
    _, findings = review(repo, base, head)
    assert rules(findings) == ["trait_from_name"]
    assert "silk" in findings[0].message
    assert findings[0].level == "hint"  # a research lead for the model, never posted


def test_material_stats_ignore_small_samples(repo):
    repo.write(f"{PLA}/basic/filament.json", filament(**TEMPLATE))
    sha = repo.commit()
    stats = MaterialStats(TreeReader(repo.path, sha))
    assert stats.templates["PLA"] == {}
    assert stats.bounds == {}


# --- flip-flops -----------------------------------------------------------------


def test_setting_a_value_back_is_a_flip_flop(repo):
    """Inland Silk PLA's max nozzle went 230 <-> 220 depending on the source (#670)."""
    path = f"{PLA}/silk/filament.json"
    repo.write(path, filament("silk", max_print_temperature=230))
    repo.commit(author="Alice")
    repo.write(path, filament("silk", max_print_temperature=220))
    base = repo.commit(author="Bob")
    repo.write(path, filament("silk", max_print_temperature=230))
    head = repo.commit(author="Carol")

    changes, _ = changed_files(repo.path, base, head)
    found = detect(repo.path, base, changes)
    assert [(f.pointer, f.kind) for f in found] == [("/max_print_temperature", "revert")]
    assert "Bob" in found[0].describe()


def test_an_absent_value_serialises_as_null():
    """asdict deep-copies the sentinel, which then crashed json.dumps (#773)."""
    flip = FlipFlop("f.json", "/a", "revert", _MISSING, [Change(_MISSING, "Alice", "a" * 7, "")])
    data = json.loads(json.dumps(flip.to_dict()))
    assert data["new_value"] is None
    assert data["timeline"][0]["value"] is None
    assert "(absent)" in data["message"]


def test_bot_churn_is_not_a_flip_flop(repo):
    """The slicer-mapping job cycles ids on its own; that is not a human dispute."""
    path = f"{PLA}/basic/filament.json"
    repo.write(path, filament(slicer_id="abs"))
    repo.commit(author="Alice")
    repo.write(path, filament(slicer_id="GFB99"))
    base = repo.commit(author="github-actions[bot]")
    repo.write(path, filament(slicer_id="abs"))
    head = repo.commit(author="Carol")

    changes, _ = changed_files(repo.path, base, head)
    assert detect(repo.path, base, changes) == []


def test_a_fresh_value_is_not_a_flip_flop(repo):
    path = f"{PLA}/basic/filament.json"
    repo.write(path, filament(max_print_temperature=230))
    base = repo.commit()
    repo.write(path, filament(max_print_temperature=215))
    head = repo.commit(author="Bob")
    changes, _ = changed_files(repo.path, base, head)
    assert detect(repo.path, base, changes) == []


# --- json lines -----------------------------------------------------------------


def test_pointer_lines_map_members_and_items():
    text = json.dumps({"a": 1, "b": [{"c": 2}, 3]}, indent=2)
    lines = pointer_lines(text)
    assert lines["/a"] == 2
    assert lines["/b/0/c"] == 5
    assert line_of(text, "/b/0/missing") == 4


# --- suggestions ----------------------------------------------------------------


def _added_filament(repo, obj):
    base = repo.commit()
    repo.write(f"{PLA}/basic/filament.json", obj)
    head = repo.commit()
    changes, _ = changed_files(repo.path, base, head)
    return changes


def test_enrichment_becomes_a_suggestion_in_schema_order(repo):
    changes = _added_filament(
        repo, {"id": "basic", "name": "Basic", "density": 1.24, "diameter_tolerance": 0.02}
    )
    enrichment = {
        "path": f"{PLA}/basic/filament.json",
        "pointer": "/max_print_temperature",
        "value": 220,
        "source_url": "https://example.com/tds.pdf",
        "confidence": "high",
    }
    outcome = build_suggestions([enrichment], changes)
    assert outcome.rejected == [] and outcome.manual == []
    [suggestion] = outcome.suggestions
    # Inserted after diameter_tolerance (schema order), which gains a comma.
    assert suggestion.replacement == [
        '  "diameter_tolerance": 0.02,',
        '  "max_print_temperature": 220',
    ]
    assert (suggestion.start_line, suggestion.end_line) == (5, 5)


def test_enrichment_that_breaks_the_schema_is_rejected(repo):
    changes = _added_filament(
        repo, {"id": "basic", "name": "Basic", "density": 1.24, "diameter_tolerance": 0.02}
    )
    bad = [
        {
            "path": f"{PLA}/basic/filament.json",
            "pointer": "/density",
            "value": "heavy",
            "source_url": "https://x.example/",
            "confidence": "high",
        },
        {
            "path": f"{PLA}/basic/filament.json",
            "pointer": "/max_print_temperature",
            "value": 220,
            "source_url": "http://x.example/",
            "confidence": "high",
        },
        {
            "path": "data/other/brand.json",
            "pointer": "/name",
            "value": "X",
            "source_url": "https://x.example/",
            "confidence": "high",
        },
    ]
    outcome = build_suggestions(bad, changes)
    assert outcome.suggestions == []
    reasons = sorted(why for _, why in outcome.rejected)
    assert reasons[0].startswith("fails the schema")
    assert reasons[1] == "no https source"
    assert reasons[2] == "not a file this PR adds or changes"


# --- rendering ------------------------------------------------------------------


def test_summary_keeps_the_previous_ai_section_on_a_free_rerun():
    first = summary(
        {
            "pr": 1,
            "head_sha": "a" * 40,
            "findings": [],
            "model": {"model": "m", "cost_usd": 0.1, "summary": "Looks good.", "findings": []},
        }
    )
    rerun = summary(
        {"pr": 1, "head_sha": "b" * 40, "findings": [], "model": None}, extract_ai_section(first)
    )
    assert "Looks good." in rerun
    assert "No AI review on this run" not in rerun
    # Carried over from commit a…, so it says it's outdated, once, however often it's carried.
    assert "**Outdated:**" in rerun and "`aaaaaaa`" in rerun
    again = summary(
        {"pr": 1, "head_sha": "c" * 40, "findings": [], "model": None}, extract_ai_section(rerun)
    )
    assert again.count("**Outdated:**") == 1
    assert "**Automated review** of `ccccccc`" in again


def test_model_text_cannot_ping_people():
    text = summary(
        {
            "pr": 1,
            "head_sha": "a" * 40,
            "findings": [],
            "model": {"model": "m", "cost_usd": 0, "summary": "Thanks @octocat", "findings": []},
        }
    )
    assert "@octocat" not in text
    assert "octocat" in text


def test_spend_marker_round_trips():
    from ofd.review.render import parse_spend

    text = summary({"pr": 1, "head_sha": "a" * 40, "findings": [], "spent_usd": 1.5})
    assert parse_spend(text) == 1.5


def test_model_findings_go_inline_only_on_diff_lines(repo):
    changes = _added_filament(
        repo, {"id": "basic", "name": "Basic", "density": 1.24, "diameter_tolerance": 0.02}
    )
    review_out = {
        "findings": [
            {
                "path": f"{PLA}/basic/filament.json",
                "pointer": "/name",
                "severity": "warning",
                "message": "Typo",
            },
            {"path": "data/elsewhere.json", "severity": "note", "message": "Elsewhere"},
        ]
    }
    comments, not_placed = inline_comments(review_out, None, changes)
    assert [(c["path"], c["line"]) for c in comments] == [(f"{PLA}/basic/filament.json", 3)]
    assert [f["message"] for f in not_placed] == ["Elsewhere"]
