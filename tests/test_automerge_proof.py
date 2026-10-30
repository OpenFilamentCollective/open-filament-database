"""Tests for ofd/automerge/proof.py: what counts as proof that a PR's value is right.

Every way a value could look proven without being proven gets a case: an off-site
page, a quote stitched from far-apart pieces, the wrong end of a range, a sibling
product's page, another colour's barcode, a near-miss type.
"""

from pathlib import Path

from ofd.automerge.proof import (
    HUMAN,
    PROVABLE,
    Context,
    Leaf,
    classify,
    diff_leaves,
    verify_all,
    verify_finding,
    verify_proof,
)
from ofd.enrich.verify import Page, normalize
from ofd.review.gitdata import ChangedFile

FIL = "data/acme/PLA/basic/filament.json"
SIZES = "data/acme/PLA/basic/red/sizes.json"
URL = "https://acme.example/products/pla-basic"
STORES = Path("stores")


class FakeFetcher:
    def __init__(self, pages: dict[str, str], final: dict[str, str] | None = None, pdf=()):
        self.pages, self.final, self.pdf = pages, final or {}, set(pdf)

    def get(self, url):
        if url not in self.pages:
            return Page(url, False, error="HTTP 404")
        return Page(
            url,
            True,
            normalize(self.pages[url]),
            is_pdf=url in self.pdf,
            final_url=self.final.get(url, url),
        )


CTX = Context("acme", "PLA Basic", ["PLA Silk", "PETG Basic"])
VARIANT_CTX = Context("acme", "PLA Basic", [], "Red", ["Blue", "Black"])


def leaf(pointer="/max_print_temperature", after=220, path=FIL, kind="filament", op="modify"):
    return Leaf(path, pointer, op, 230, after, kind, "M")


def proof(
    value=220,
    quote="PLA Basic printing temperature: 190-220 °C",
    pointer="/max_print_temperature",
    url=URL,
    path=FIL,
):
    return {"path": path, "pointer": pointer, "value": value, "source_url": url, "quote": quote}


PAGE = "PLA Basic. PLA Basic printing temperature: 190-220 °C. Bed: 50-60 °C."


def check(lf, pr, pages=None, ctx=CTX, **kw):
    return verify_proof(lf, pr, FakeFetcher(pages or {URL: PAGE}, **kw), ctx, STORES)


# --- what can be proven -------------------------------------------------------


def test_diff_leaves_and_classification():
    change = ChangedFile(
        "M",
        FIL,
        before={"id": "basic", "name": "PLA Basic", "max_print_temperature": 230},
        after={"id": "basic", "name": "PLA Basic+", "max_print_temperature": 220, "dry_time": 8},
    )
    leaves = {lf.pointer: lf for lf in diff_leaves(change)}
    assert set(leaves) == {"/name", "/max_print_temperature", "/dry_time"}
    assert classify(leaves["/max_print_temperature"]) == PROVABLE
    assert classify(leaves["/dry_time"]) == PROVABLE  # an added field
    assert classify(leaves["/name"]) == HUMAN


def test_new_deleted_and_removed_values_always_need_a_human():
    new = ChangedFile("A", FIL, after={"id": "basic"})
    assert [classify(lf) for lf in diff_leaves(new)] == [HUMAN]
    gone = ChangedFile("M", FIL, before={"max_print_temperature": 230}, after={})
    assert [lf.op for lf in diff_leaves(gone)] == ["remove"]
    assert classify(diff_leaves(gone)[0]) == HUMAN


def test_sizes_compare_per_spool_only_when_the_spools_are_the_same():
    spool = {"uuid": "u1", "filament_weight": 1000, "diameter": 1.75}
    same = ChangedFile("M", SIZES, before=[spool], after=[{**spool, "gtin": "4006381333931"}])
    (lf,) = diff_leaves(same)
    assert lf.pointer == "/0/gtin" and classify(lf) == PROVABLE
    reordered = ChangedFile("M", SIZES, before=[spool], after=[{**spool, "filament_weight": 500}])
    assert [lf.op for lf in diff_leaves(reordered)] == ["structural"]


def test_uuid_changes_are_seen():
    change = ChangedFile("M", FIL, before={"uuid": "a"}, after={"uuid": "b"})
    assert [(lf.pointer, classify(lf)) for lf in diff_leaves(change)] == [("/uuid", HUMAN)]


# --- what counts as a proof -----------------------------------------------------


def test_a_good_proof_passes():
    assert check(leaf(), proof()) is None


def test_value_type_must_match_exactly():
    assert "not the PR's" in check(leaf(), proof(value=220.0))
    assert "not the PR's" in check(leaf(), proof(value="220"))


def test_off_site_or_user_written_pages_do_not_count():
    other = "https://blog.example.net/pla"
    assert "not the brand's own site" in check(leaf(), proof(url=other), {other: PAGE})
    # A brand URL that redirects elsewhere.
    assert "not the brand's own site" in check(
        leaf(), proof(), final={URL: "https://shady.example/x"}
    )
    forum = "https://forum.acme.example/t/1"
    assert "user-written" in check(leaf(), proof(url=forum), {forum: PAGE})


def test_an_unheated_bed_can_be_proven():
    """CookieCAD PETG: "Bed Temperature 0-80°C" was refused as not a temperature."""
    page = "PLA Basic. Bed Temperature 0-80°C."
    quote = "Bed Temperature 0-80°C"
    lf = leaf("/min_bed_temperature", 0)
    assert check(lf, proof(0, quote=quote, pointer="/min_bed_temperature"), {URL: page}) is None


def test_min_and_max_must_be_the_right_end_of_a_range():
    assert "top of the range" in check(
        leaf("/min_print_temperature", 220), proof(220, pointer="/min_print_temperature")
    )
    assert (
        check(leaf("/min_print_temperature", 190), proof(190, pointer="/min_print_temperature"))
        is None
    )


def test_quote_pieces_must_be_close_together():
    page = "PLA Basic printing temperature: " + "x " * 400 + "220 °C"
    quote = "PLA Basic printing temperature: … 220 °C"
    assert "too far apart" in check(leaf(), proof(quote=quote), {URL: page})


def test_a_sibling_products_page_needs_the_name_in_the_quote():
    page = "PLA Silk: 200-230 °C. PLA Basic: 190-220 °C."
    assert "doesn't name this one" in check(leaf(), proof(quote="190-220 °C"), {URL: page})
    assert check(leaf(), proof(quote="PLA Basic: 190-220 °C"), {URL: page}) is None
    assert "never names" in check(leaf(), proof(quote="190-220 °C"), {URL: "Printing: 190-220 °C"})


def test_a_barcode_must_belong_to_this_colour():
    lf = leaf("/0/gtin", "4006381333931", path=SIZES, kind="sizes")
    page = "PLA Basic Blue EAN 4006381333931. PLA Basic Red EAN 4006381333948."
    blue = proof("4006381333931", quote="Blue EAN 4006381333931", pointer="/0/gtin", path=SIZES)
    assert "colour 'Red'" in check(lf, blue, {URL: page}, ctx=VARIANT_CTX)


def test_a_datasheet_must_be_the_brands_document_for_this_product():
    pdf = "https://acme.example/tds/pla-basic.pdf"
    lf = leaf("/data_sheet_url", pdf, op="add")
    good = proof(pdf, quote="", pointer="/data_sheet_url", url=pdf)
    tds = {pdf: "Technical data sheet. PLA Basic."}
    assert check(lf, good, tds, pdf=[pdf]) is None
    assert "never names" in check(lf, good, {pdf: "Technical data sheet. PETG."}, pdf=[pdf])


def test_verify_all_marks_missing_proofs_unproven():
    lf = leaf()
    verdicts = verify_all([], [lf], FakeFetcher({}), lambda _: CTX, STORES)
    assert verdicts[lf.key] == {"ok": False, "reason": "no proof was found", "proof": None}


def test_made_up_proofs_are_rejected():
    """The model claiming a page says something it doesn't."""
    fake = proof(quote="PLA Basic printing temperature: 190-220 °C")
    verdicts = verify_all(
        [fake], [leaf()], FakeFetcher({URL: "PLA Basic. Out of stock."}), lambda _: CTX, STORES
    )
    assert verdicts[leaf().key]["ok"] is False


# --- wrong-value findings ------------------------------------------------------


def test_a_finding_is_verified_only_by_the_brands_page():
    finding = {
        "path": FIL,
        "pointer": "/max_print_temperature",
        "evidence": {
            "source_url": URL,
            "quote": "PLA Basic printing temperature: 190-220 °C",
            "value": 220,
        },
    }
    fetcher = FakeFetcher({URL: PAGE})
    assert verify_finding(finding, 230, "filament", fetcher, CTX, STORES)["verdict"] == "verified"
    assert verify_finding(finding, 220, "filament", fetcher, CTX, STORES)["verdict"] == "unverified"
    no_evidence = {k: v for k, v in finding.items() if k != "evidence"}
    assert (
        verify_finding(no_evidence, 230, "filament", fetcher, CTX, STORES)["verdict"]
        == "unverified"
    )


def test_table_cell_separators_in_a_quote_still_match():
    """#787: the page text reads the spec table as one line; the model quoted it as cells."""
    page = "iSANMATE PLA Basic print temp 240-270 degrees hot bed temp. 80-100°c"
    lf = leaf("/max_print_temperature", 270)
    good = proof(270, quote="Print Temp / 240-270 degrees")
    assert check(lf, good, {URL: page}, ctx=Context("acme", "PLA Basic", [])) is None
    # The label still has to be next to the number on the page.
    split = proof(270, quote="Print Temp / 80-100°C")
    assert check(lf, split, {URL: page}, ctx=Context("acme", "PLA Basic", [])) is not None


class HtmlFetcher:
    """Pages given as HTML, parsed the way the real Fetcher does."""

    def __init__(self, pages: dict[str, str]):
        self.pages = pages

    def get(self, url):
        from ofd.enrich.verify import html_parts

        text, main, title = html_parts(self.pages[url])
        return Page(
            url, True, normalize(text), final_url=url, title=normalize(title), main=normalize(main)
        )


MENU = "<nav><a>PLA Basic</a><a>PLA Silk</a><a>PETG Basic</a></nav>"
TABLE = "<table><tr><td>Print Temp</td><td>190-220 °C</td></tr></table>"


def test_a_menu_listing_every_product_is_not_a_comparison_page():
    """#787: a single-product page whose site menu names every product line."""
    html = f"<html><body>{MENU}<main><h2>Specs</h2><p>PLA Basic</p>{TABLE}</main></body></html>"
    lf = leaf()
    pr = proof(quote="Print Temp 190-220 °C")
    assert verify_proof(lf, pr, HtmlFetcher({URL: html}), CTX, STORES) is None


def test_the_title_says_which_product_the_page_is():
    html = f"<html><head><title>PLA Basic | Acme</title></head><body>{TABLE}<p>Also try PLA Silk</p></body></html>"
    assert (
        verify_proof(
            leaf(), proof(quote="Print Temp 190-220 °C"), HtmlFetcher({URL: html}), CTX, STORES
        )
        is None
    )


def test_a_real_comparison_page_still_needs_the_name_in_the_quote():
    html = (
        "<html><head><title>All filaments | Acme</title></head><body><main>"
        "<p>PLA Silk 200-230 °C</p><p>PLA Basic Print Temp 190-220 °C</p></main></body></html>"
    )
    fetcher = HtmlFetcher({URL: html})
    assert "doesn't name this one" in verify_proof(
        leaf(), proof(quote="Print Temp 190-220 °C"), fetcher, CTX, STORES
    )
    assert (
        verify_proof(leaf(), proof(quote="PLA Basic Print Temp 190-220 °C"), fetcher, CTX, STORES)
        is None
    )


def test_an_official_brand_wiki_counts_but_other_wikis_do_not():
    """Polymaker publishes its TD and hex tables on wiki.polymaker.com."""
    wiki = "https://wiki.polymaker.com/tds"
    ctx = Context("polymaker", "PLA Basic", [])
    assert check(leaf(), proof(url=wiki), {wiki: PAGE}, ctx=ctx) is None
    community = "https://wiki.acme.example/pla"
    assert "user-written" in check(leaf(), proof(url=community), {community: PAGE})
