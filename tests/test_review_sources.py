"""Tests for ofd/review/sources.py: the PR's sources, fetched for the model.

The model's own WebFetch failed on PDFs, script-built pages and rate-limited shops,
and turned each failure into a "please confirm" note. These pin down which links get
fetched, the archived-copy fallback, and that unreadable ones are reported by the
script rather than by the model.
"""

from ofd.enrich.verify import Page, normalize
from ofd.review import sources
from ofd.review.gitdata import ChangedFile
from ofd.review.render import ai_section
from ofd.review.sources import collect_urls, context_section, fetch_sources

FIL = "data/acme/PLA/basic/filament.json"
SIZES = "data/acme/PLA/basic/red/sizes.json"
TEXT = "PLA Basic. Printing temperature: 190-220 °C. " * 20


class FakeFetcher:
    def __init__(self, pages):
        self.pages = pages

    def get(self, url):
        if url not in self.pages:
            return Page(url, False, error="HTTP 429")
        return Page(url, True, normalize(self.pages[url]), is_pdf=url.endswith(".pdf"))


def test_collects_body_commit_and_file_links_once():
    filament = ChangedFile(
        "M", FIL, after={"data_sheet_url": "https://acme.example/tds.pdf", "name": "PLA Basic"}
    )
    sizes = ChangedFile(
        "M",
        SIZES,
        after=[
            {
                "purchase_links": [
                    {"store_id": "acme", "url": "https://shop.acme.example/pla"},
                    {"store_id": "amazon", "url": "https://www.amazon.com/dp/B0"},
                ]
            }
        ],
    )
    body = (
        "Source: https://acme.example/pla-basic. Template https://acme.example/product/<handle>,"
        " session https://claude.ai/code/x, see https://github.com/o/r/issues/1"
    )
    urls = collect_urls(
        body, "TDS https://acme.example/tds.pdf\n", [filament, sizes], {"acme": "acme"}
    )
    assert urls == [
        "https://acme.example/pla-basic",
        "https://acme.example/tds.pdf",
        "https://shop.acme.example/pla",
    ]


def test_fetches_into_the_workdir_and_falls_back_to_an_archived_copy(tmp_path, monkeypatch):
    live = "https://acme.example/tds.pdf"
    blocked = "https://acme.example/pla"
    gone = "https://acme.example/old"
    fetcher = FakeFetcher({live: TEXT, f"https://web.archive.org/web/20261011id_/{blocked}": TEXT})

    def archived(url, fetcher):
        page = fetcher.get(f"https://web.archive.org/web/20261011id_/{url}")
        return (page, "20261011") if page.ok else (None, "")

    monkeypatch.setattr(sources, "_archived", archived)
    got = fetch_sources([live, blocked, gone], tmp_path, fetcher)

    assert [(s.ok, s.archived, s.is_pdf) for s in got] == [
        (True, "", True),
        (True, "20261011", False),
        (False, "", False),
    ]
    assert "printing temperature: 190-220°c" in (tmp_path / got[0].file).read_text()
    assert "Archived copy from 20261011" in (tmp_path / got[1].file).read_text()
    assert got[2].error == "HTTP 429; no archived copy"
    section = context_section(got)
    assert "`.ofd-sources/01.txt` (PDF" in section
    assert f"{gone} → could not be read: HTTP 429" in section


def test_a_near_empty_page_counts_as_unreadable(tmp_path, monkeypatch):
    shell = "https://acme.example/app"
    monkeypatch.setattr(sources, "_archived", lambda url, fetcher: (None, ""))
    [got] = fetch_sources([shell], tmp_path, FakeFetcher({shell: "Loading..."}))
    assert not got.ok and "almost no text" in got.error


def test_unreadable_sources_are_listed_by_the_script_in_the_comment():
    result = {
        "head_sha": "a" * 40,
        "model": {"summary": "Looks right.", "findings": [], "model": "m", "cost_usd": 0.01},
        "sources": [
            {"url": "https://acme.example/tds.pdf", "ok": True},
            {"url": "https://acme.example/pla", "ok": False, "error": "HTTP 429; no archived copy"},
        ],
    }
    text = ai_section(result)
    assert "Sources the bot couldn't read" in text
    assert "<https://acme.example/pla> (HTTP 429; no archived copy)" in text
    assert "tds.pdf" not in text


def test_a_script_built_page_gets_the_data_it_renders_from(tmp_path, monkeypatch):
    """Add-North's product pages are empty shells over one /initial-data.js catalogue."""
    pages = {
        "https://shop.example/p/1": (
            '<html><script src="/js/app.1a2b.js"></script><script src="/initial-data.js">'
            '</script><script src="https://cdn.other.example/data.js"></script></html>'
        ),
        "https://shop.example/p/2": '<html><script src="/initial-data.js"></script></html>',
        "https://shop.example/initial-data.js": 'window.d={"ESD PETG":{"dryingTemp":"65 °C"}}',
    }
    fetched = []

    def raw(url, limit):
        fetched.append(url)
        return pages.get(url, ""), url

    monkeypatch.setattr(sources, "_raw", raw)
    shells = FakeFetcher({"https://shop.example/p/1": "Loading", "https://shop.example/p/2": ""})
    got = fetch_sources(["https://shop.example/p/1", "https://shop.example/p/2"], tmp_path, shells)

    assert [(s.ok, s.scripted, s.file) for s in got] == [
        (True, True, ".ofd-sources/01-data.txt"),
        (True, True, ".ofd-sources/01-data.txt"),
    ]
    assert '"dryingTemp":"65 °C"' in (tmp_path / got[0].file).read_text()
    # Same-site data scripts only, each fetched once; never the app bundle or a CDN.
    assert fetched.count("https://shop.example/initial-data.js") == 1
    assert not any("app.1a2b" in u or "cdn.other" in u for u in fetched)
    assert "built by scripts" in context_section(got)
