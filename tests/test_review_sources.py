"""Tests for ofd/review/sources.py: the PR's sources, fetched for the model.

The model's own WebFetch failed on PDFs, script-built pages and rate-limited shops,
and turned each failure into a "please confirm" note. These pin down which links get
fetched, the archived-copy fallback, and that unreadable ones are reported by the
script rather than by the model.
"""

from ofd.enrich.verify import Download, Fetcher
from ofd.review import sources
from ofd.review.gitdata import ChangedFile
from ofd.review.render import ai_section
from ofd.review.sources import collect_urls, context_section, fetch_sources

FIL = "data/acme/PLA/basic/filament.json"
SIZES = "data/acme/PLA/basic/red/sizes.json"
ROWS = "".join(
    f"<tr><td>CA1400{i}</td><td>PLA Basic Colour {i}</td><td>#00000{i}</td><td>2.{i}</td></tr>"
    for i in range(10)
)
PAGE = f"<html><body><h1>PLA Basic</h1><p>Printing temperature: 190-220 °C</p><table>{ROWS}</table></body></html>"


class FakeFetcher(Fetcher):
    """Serves ``pages`` (url -> HTML text or bytes); anything else is an HTTP 429."""

    def __init__(self, pages, final=None):
        super().__init__()
        self.pages, self.final, self.requested = pages, final or {}, []

    def _download(self, url):
        self.requested.append(url)
        if url not in self.pages:
            return Download(False, error="HTTP 429")
        body = self.pages[url]
        data = body if isinstance(body, bytes) else body.encode()
        kind = "application/pdf" if data.startswith(b"%PDF") else "text/html"
        return Download(True, data, kind, "utf-8", self.final.get(url, url))


def fetch(urls, pages, tmp_path, **kw):
    out = tmp_path / ".ofd-sources-x"
    out.mkdir()
    return fetch_sources(urls, out, tmp_path, FakeFetcher(pages, **kw))


def test_file_links_come_first_and_body_links_are_cleaned():
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
        "Source: **https://acme.example/pla-basic**. Template https://acme.example/product/<handle>,"
        " session https://claude.ai/code/x, see https://github.com/o/r/issues/1"
        + "".join(f" https://acme.example/ref{i}" for i in range(20))
    )
    urls = collect_urls(
        body, "TDS https://acme.example/tds.pdf\n", [filament, sizes], {"acme": "acme"}
    )
    # A body full of links must not push the datasheet out of the 15.
    assert urls[:3] == [
        "https://acme.example/tds.pdf",
        "https://shop.acme.example/pla",
        "https://acme.example/pla-basic",
    ]
    assert len(urls) == sources.MAX_SOURCES
    assert not any("<" in u or "claude.ai" in u or "github.com" in u for u in urls)


def test_pages_keep_their_case_and_rows(tmp_path):
    url = "https://acme.example/pla"
    [got] = fetch([url], {url: PAGE}, tmp_path)
    assert got.ok and got.file == ".ofd-sources-x/01.txt"
    text = (tmp_path / got.file).read_text()
    # One table row per line, original case: Grep returns the row, not the page.
    assert "CA14003 PLA Basic Colour 3 #000003 2.3" in text.splitlines()
    assert "Printing temperature: 190-220 °C" in text


def test_falls_back_to_an_archived_copy(tmp_path):
    blocked, gone = "https://acme.example/pla", "https://acme.example/old"
    snapshot = f"https://web.archive.org/web/20261011id_/{blocked}"
    query = f"https://archive.org/wayback/available?url={blocked.replace(':', '%3A').replace('/', '%2F')}"
    pages = {
        query: '{"archived_snapshots": {"closest": {"available": true, "timestamp": "20261011"}}}',
        snapshot: PAGE,
    }
    got = fetch([blocked, gone], pages, tmp_path)
    assert [(s.ok, s.archived) for s in got] == [(True, "20261011"), (False, "")]
    assert "Archived copy from 20261011" in (tmp_path / got[0].file).read_text()
    assert got[1].error == "HTTP 429; no archived copy"
    section = context_section(got)
    assert "archived copy from 20261011" in section
    assert f"{gone} → could not be read: HTTP 429" in section


def test_a_script_built_page_gets_the_data_it_renders_from(tmp_path):
    """Add-North's product pages are empty shells over one /initial-data.js catalogue."""
    shell = (
        '<html><script src="/js/app.1a2b.js"></script><script src="/initial-data.js">'
        '</script><script src="https://cdn.other.example/data.js"></script>'
        '<script src="/my data.js"></script></html>'
    )
    pages = {
        "https://shop.example/p/1": shell,
        "https://shop.example/p/2": '<html><script src="/initial-data.js"></script></html>',
        "https://shop.example/initial-data.js": 'window.d={"ESD PETG":{"dryingTemp":"65 °C"}}',
    }
    fetcher = FakeFetcher(pages)
    out = tmp_path / ".ofd-sources-x"
    out.mkdir()
    got = fetch_sources(
        ["https://shop.example/p/1", "https://shop.example/p/2"], out, tmp_path, fetcher
    )

    assert [(s.ok, s.scripted, s.file) for s in got] == [
        (True, True, ".ofd-sources-x/01-data.txt"),
        (True, True, ".ofd-sources-x/01-data.txt"),
    ]
    assert '"dryingTemp":"65 °C"' in (tmp_path / got[0].file).read_text()
    # Same-site data scripts only, each fetched once; never the app bundle or a CDN.
    assert fetcher.requested.count("https://shop.example/initial-data.js") == 1
    assert not any("app.1a2b" in u or "cdn.other" in u for u in fetcher.requested)
    assert "built by scripts" in context_section(got)


def test_a_near_empty_page_counts_as_unreadable(tmp_path):
    shell = "https://acme.example/app"
    [got] = fetch([shell], {shell: "<html>Loading...</html>"}, tmp_path)
    assert not got.ok and "almost no text" in got.error


def test_odd_responses_never_crash_the_review():
    """A bogus charset, or a script src with a space, used to escape the fetch."""
    assert Download(True, "Grüße".encode(), charset="utf8mb4").text() == "Grüße"
    got = Fetcher().download("https://acme.example/my data.js")
    assert not got.ok and got.error


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
