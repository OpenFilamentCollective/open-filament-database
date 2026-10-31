"""Tests for what of the model's output reaches the PR (ofd/review/triage.py).

Every dropped case is a comment a maintainer had to answer by hand on #801-#831.
"""

import json

from ofd.enrich.verify import Page, normalize
from ofd.review.gitdata import ChangedFile
from ofd.review.triage import (
    clean_summary,
    filter_findings,
    proof_candidates,
    verify_enrichments,
)

SIZES = "data/insignia/PLA/silk_pla/gold/sizes.json"
VARIANT = "data/insignia/PLA/silk_pla/gold/variant.json"
FIL = "data/insignia/PLA/glitter_pla/filament.json"
URL = "https://www.example.com/silk-pla-gold"


class FakeFetcher:
    def __init__(self, pages: dict[str, str]):
        self.pages = pages

    def get(self, url):
        if url not in self.pages:
            return Page(url, False, error="HTTP 404")
        return Page(url, True, normalize(self.pages[url]))


CHANGES = [
    ChangedFile("A", SIZES, after=[{"filament_weight": 1000, "diameter": 1.75}]),
    ChangedFile("A", VARIANT, after={"id": "gold", "name": "Gold", "color_hex": ["#6D5980"]}),
    ChangedFile("A", FIL, after={"id": "glitter_pla", "max_print_speed": 300}),
]


def finding(path, message, pointer="", severity="note", **extra):
    return {"path": path, "pointer": pointer, "severity": severity, "message": message, **extra}


def dropped(*findings):
    kept, gone = filter_findings(list(findings), CHANGES)
    return [f["message"] for f in gone], kept


def test_findings_about_empty_fields_are_dropped():
    gone, kept = dropped(
        finding(SIZES, "The barcode (gtin) is empty. Add it from the packaging.", "/0/gtin"),
        finding(FIL, "The drying fields are empty.", "/dry_temperature"),
        finding(VARIANT, "Add the gradual_color_change trait.", "/traits/gradual_color_change"),
    )
    assert len(gone) == 3 and kept == []


def test_requests_to_confirm_or_strip_tracking_are_dropped():
    gone, _ = dropped(
        finding(FIL, "Please confirm which the maintainer treats as authoritative."),
        finding(SIZES, "Check that each slug is the live product page."),
        finding(SIZES, "Strip the tracking parameters (gad_campaignid).", severity="warning"),
    )
    assert len(gone) == 3


def test_real_findings_survive():
    _, kept = dropped(
        finding(FIL, "max_print_speed 300 is high for PLA and has no visible source.", "/x"),
        finding(SIZES, "This link returns 404; the product page has moved.", severity="warning"),
        finding(
            FIL,
            "Please confirm: the datasheet says 210 °C.",
            "/max_print_temperature",
            severity="warning",
            evidence={"source_url": URL, "quote": "210 °C", "value": 210},
        ),
        finding(FIL, "The sustainability figure has no source.", "/sustainability/x"),
    )
    assert len(kept) == 4


def test_an_error_is_kept_even_when_it_asks_to_check():
    _, kept = dropped(finding(FIL, "Nozzle 500 °C is impossible; check the TDS.", severity="error"))
    assert len(kept) == 1


def test_a_filled_field_is_not_an_empty_field():
    changes = [ChangedFile("A", SIZES, after=[{"gtin": "4006381333931"}])]
    kept, _ = filter_findings([finding(SIZES, "The GTIN looks like a UPC.", "/0/gtin")], changes)
    assert len(kept) == 1


def enrichment(pointer, value, quote="", path=SIZES, url=URL):
    return {
        "path": path,
        "pointer": pointer,
        "value": value,
        "source_url": url,
        "source_quote": quote,
        "confidence": "high",
    }


def test_enrichments_are_verified_against_the_page(tmp_path):
    page = "Insignia Silk PLA Gold. UPC 4006381333931. Model NS-3FSPLA2GD. Silk finish."
    fetcher = FakeFetcher({URL: page})
    good = [
        enrichment("/0/gtin", "4006381333931", "UPC 4006381333931"),
        enrichment("/0/article_number", "NS-3FSPLA2GD", "Model NS-3FSPLA2GD"),
        enrichment("/traits/silk", True, "Silk finish", path=VARIANT),
    ]
    bad = [
        enrichment("/0/gtin", "4006381333932", "UPC 4006381333932"),  # check digit
        enrichment("/0/article_number", "NS-XYZ", "Model NS-XYZ"),  # quote not on page
        enrichment("/traits/silk", True, "", path=VARIANT),  # no quote
        enrichment("/0/gtin", "4006381333931", "UPC 4006381333931", url=URL + "/gone"),
    ]
    verified, rejected = verify_enrichments(good + bad, fetcher, tmp_path)
    assert verified == good
    assert [e for e, _ in rejected] == bad


def test_purchase_links_need_a_known_store_on_its_own_site(tmp_path):
    (tmp_path / "best_buy").mkdir()
    (tmp_path / "best_buy/store.json").write_text(
        json.dumps({"storefront_url": "https://www.bestbuy.com/"})
    )
    link = "https://www.bestbuy.com/site/silk-pla-gold/123.p"
    fetcher = FakeFetcher({link: "Silk PLA Gold"})
    ok = enrichment("/0/purchase_links", [{"store_id": "best_buy", "url": link}])
    elsewhere = enrichment("/0/purchase_links", [{"store_id": "best_buy", "url": URL}])
    verified, rejected = verify_enrichments([ok, elsewhere], fetcher, tmp_path)
    assert verified == [ok] and [e for e, _ in rejected] == [elsewhere]


def test_quoted_enrichments_become_proof_candidates():
    (candidate,) = proof_candidates(
        [enrichment("/0/gtin", "4006381333931", "UPC 4006381333931"), enrichment("/x", 1)]
    )
    assert candidate["quote"] == "UPC 4006381333931" and candidate["pointer"] == "/0/gtin"


def test_summary_drops_empty_field_and_unreadable_page_sentences():
    text = (
        "Adds three new Voxel PLA colours. Nothing I checked is wrong, so it looks ready to "
        "merge; purchase links and transmission distance are still empty, but I found no "
        "colour-specific product URL to propose."
    )
    assert clean_summary(text) == (
        "Adds three new Voxel PLA colours. Nothing I checked is wrong, so it looks ready to merge."
    )
    text = "Changes 11 SUNLU colours. I could not reach the SUNLU product pages, so the links are unverified."
    assert clean_summary(text) == "Changes 11 SUNLU colours."
    text = (
        "Adds Glitter PLA. I found no manufacturer datasheet for the empty drying and GTIN "
        "fields, so I have not proposed values for them."
    )
    assert clean_summary(text) == "Adds Glitter PLA."
    text = (
        "Adds Gold. The PR looks ready to merge. No GTIN or purchase link could be "
        "sourced, so none are proposed."
    )
    assert clean_summary(text) == "Adds Gold. The PR looks ready to merge."
    assert clean_summary("Adds Best Buy. It looks ready to merge.") == (
        "Adds Best Buy. It looks ready to merge."
    )
