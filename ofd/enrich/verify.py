"""
Independent proof for every value the model proposes.

The model is asked for the URL it read a value from and the verbatim text containing
it. Here that page is fetched again, without the model, and the value survives only
if the quote is on the page and the value is in the quote. A model that misreads,
guesses or invents fails this, which is the point: Haiku is cheap enough to run on
every brand because a wrong answer is dropped, never merged.

Pages behind bot protection fail too. Those are reported in the PR as "could not
verify" for a human to check, rather than trusted.
"""

import http.client
import io
import json
import logging
import re
import unicodedata
import urllib.error
import urllib.request
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

from ofd.review.checks import looks_like_product_page
from ofd.validation.data_quality import is_storefront_root

USER_AGENT = (
    "Mozilla/5.0 (compatible; OpenFilamentDatabase-enrich/1.0; "
    "+https://github.com/OpenFilamentCollective/open-filament-database)"
)
MAX_BYTES = 15 * 1024 * 1024
TIMEOUT = 25

# pypdf logs a warning for every font it can't fully decode; the text is still usable.
logging.getLogger("pypdf").setLevel(logging.ERROR)

TEMPERATURE_FIELDS = {
    "min_print_temperature",
    "max_print_temperature",
    "min_bed_temperature",
    "max_bed_temperature",
    "max_dry_temperature",
    "dry_temperature",
}
# An unheated bed is a real spec ("Bed: 0-60 °C"); a nozzle or dryer at 0 °C is not.
ZERO_OK_TEMPERATURES = {"min_bed_temperature", "max_bed_temperature"}
SHEET_FIELDS = {"data_sheet_url", "safety_sheet_url"}

# Other copied numbers (#767): field -> (whole numbers only, lowest, highest).
NUMBER_FIELDS = {
    "dry_time": (False, 0, 72),
    "max_volumetric_speed": (False, 0, 200),
    "min_fan_speed": (True, 0, 100),
    "max_fan_speed": (True, 0, 100),
    "transmission_distance": (False, 0, 100),
}
ENCLOSURE_VALUES = {"required", "recommended", "not_needed"}
# The quote must be about the enclosure itself: a chamber temperature alone ("Chamber:
# 90 °C") is a setting, not a statement that an enclosure is required.
_ENCLOSURE_WORDS = re.compile(r"enclos|closed (?:printer|frame|chamber)|open[- ]frame")
# And its wording must match the value.
_ENCLOSURE_VALUE_WORDS = {
    "required": re.compile(r"requir|must|necessary|needed|essential|mandatory"),
    "recommended": re.compile(r"recommend|advis|suggest|prefer|ideal|best|helps?\b"),
    "not_needed": re.compile(r"\bno\b|\bnot\b|without|n't|unnecessary|open[- ]frame"),
}


@dataclass
class Page:
    url: str
    ok: bool
    text: str = ""
    is_pdf: bool = False
    error: str = ""
    # Where the request ended up after redirects; "" when it never loaded.
    final_url: str = ""
    # The <title> and first <h1>, normalized: what the page says it is about.
    title: str = ""
    # ``text`` without site chrome (nav, header, footer, aside): what the page is
    # about, as opposed to the menu listing every product of the brand.
    main: str = ""

    @property
    def content(self) -> str:
        return self.main or self.text


_CHROME_TAGS = {"nav", "header", "footer", "aside"}


class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.main: list[str] = []
        self.title: list[str] = []
        self._skip = 0
        # [tag, nesting] for each open chrome element (nav, header, role=navigation...).
        self._chrome: list[list] = []
        self._in_title = False
        self._in_h1 = False
        self._h1_done = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "svg"):
            self._skip += 1
        if self._chrome and tag == self._chrome[-1][0]:
            self._chrome[-1][1] += 1
        elif tag in _CHROME_TAGS or dict(attrs).get("role") in (
            "navigation",
            "banner",
            "contentinfo",
        ):
            self._chrome.append([tag, 1])
        if tag == "title":
            self._in_title = True
        if tag == "h1" and not self._h1_done and not self._chrome:
            self._in_h1 = True

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg") and self._skip:
            self._skip -= 1
        if self._chrome and tag == self._chrome[-1][0]:
            self._chrome[-1][1] -= 1
            if self._chrome[-1][1] == 0:
                self._chrome.pop()
        if tag == "title":
            self._in_title = False
        if tag == "h1" and self._in_h1:
            self._in_h1, self._h1_done = False, True

    def handle_data(self, data):
        if self._in_title or self._in_h1:
            self.title.append(data)
        if self._skip or self._in_title:
            return
        self.parts.append(data)
        if not self._chrome:
            self.main.append(data)


def html_text(html: str) -> str:
    return html_parts(html)[0]


def html_parts(html: str) -> tuple[str, str, str]:
    """``(all text, text outside site chrome, title + first h1)``."""
    parser = _TextExtractor()
    parser.feed(html)
    return " ".join(parser.parts), " ".join(parser.main), " ".join(parser.title)


def pdf_text(data: bytes) -> str:
    from pypdf import PdfReader  # only needed for PDF sources

    reader = PdfReader(io.BytesIO(data))
    return " ".join(page.extract_text() or "" for page in reader.pages)


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).lower()
    text = re.sub(r"[‐-―−]", "-", text)  # dashes and minus signs
    text = text.replace(" ", " ").replace("’", "'").replace("“", '"').replace("”", '"')
    text = re.sub(r"\s+(?=[°%])", "", text)  # "60 °C" and "60°C" are the same quote
    return re.sub(r"\s+", " ", text).strip()


@dataclass
class Download:
    """A URL as served: the bytes and how to read them, or why it failed."""

    ok: bool
    data: bytes = b""
    content_type: str = ""
    charset: str = "utf-8"
    final_url: str = ""
    error: str = ""

    def text(self) -> str:
        try:
            return self.data.decode(self.charset, errors="replace")
        except LookupError:  # a charset Python doesn't know ("utf8mb4")
            return self.data.decode("utf-8", errors="replace")


class Fetcher:
    """Fetch each URL once per run."""

    def __init__(self):
        self._cache: dict[str, Page] = {}
        self._downloads: dict[str, Download] = {}

    def get(self, url: str) -> Page:
        if url not in self._cache:
            self._cache[url] = self._fetch(url)
        return self._cache[url]

    def download(self, url: str) -> Download:
        """The raw response, cached; never raises."""
        if url not in self._downloads:
            self._downloads[url] = self._download(url)
        return self._downloads[url]

    def _download(self, url: str) -> Download:
        if not url.startswith("https://"):
            return Download(False, error="not an https URL")
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                return Download(
                    True,
                    response.read(MAX_BYTES),
                    response.headers.get("Content-Type", ""),
                    response.headers.get_content_charset() or "utf-8",
                    response.geturl(),
                )
        except urllib.error.HTTPError as exc:
            return Download(False, error=f"HTTP {exc.code}")
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            return Download(False, error=str(getattr(exc, "reason", exc)))
        # InvalidURL (a ValueError), IncompleteRead and other http.client errors.
        except (ValueError, http.client.HTTPException) as exc:
            return Download(False, error=f"{type(exc).__name__}: {exc}")

    def _fetch(self, url: str) -> Page:
        got = self.download(url)
        if not got.ok:
            return Page(url, False, error=got.error)
        if "pdf" in got.content_type or got.data.startswith(b"%PDF"):
            try:
                text = normalize(pdf_text(got.data))
                return Page(url, True, text, is_pdf=True, final_url=got.final_url)
            except ImportError:
                return Page(url, False, is_pdf=True, error="pypdf is not installed")
            except Exception as exc:  # pypdf raises many kinds on broken files
                return Page(url, False, is_pdf=True, error=f"unreadable PDF ({exc})")
        text, main, title = html_parts(got.text())
        return Page(
            url,
            True,
            normalize(text),
            final_url=got.final_url,
            title=normalize(title),
            main=normalize(main),
        )


# A separator a reader inserts between spec-table cells ("Print Temp / 240-270") that
# the page text doesn't have ("print temp 240-270"). Only with whitespace on one side,
# so "1/2" or "12:30" inside a value are left alone.
_CELL_SEPARATOR = re.compile(r"\s*[/|:]\s+|\s+[/|:]\s*")


def _comparable(text: str) -> str:
    return re.sub(r"\s+", " ", _CELL_SEPARATOR.sub(" ", text)).strip()


def quote_on_page(quote: str, page: Page, max_gap: int | None = None) -> bool:
    """The quote, or each part of it around an ellipsis, appears on the page in order.

    ``max_gap`` caps how far apart consecutive parts may be, so "190 … 230" can't
    stitch two unrelated numbers together from opposite ends of a page.
    """
    fragments = [
        _comparable(f) for f in re.split(r"…|\.\.\.", normalize(quote)) if len(f.strip()) >= 4
    ]
    if not fragments:
        return False
    text = _comparable(page.text)
    position = None
    for fragment in fragments:
        start = 0 if position is None else position
        found = text.find(fragment.strip(), start)
        if found == -1:
            return False
        # find() returns the nearest occurrence, so nothing closer exists.
        if max_gap is not None and position is not None and found - position > max_gap:
            return False
        position = found + len(fragment.strip())
    return True


def number_in(value, text: str) -> bool:
    """``value`` written in ``text``, as 1.24 or 1,24, not as part of a longer number."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    forms = {str(value)}
    if float(value).is_integer():
        forms.add(str(int(value)))
    forms |= {f.replace(".", ",") for f in forms}
    return any(re.search(rf"(?<![\d.,]){re.escape(f)}(?![\d])", text) for f in forms)


def gtin_valid(code: str) -> bool:
    """GS1 mod-10 check digit for GTIN-8/12/13/14."""
    if not re.fullmatch(r"\d{8}|\d{12,14}", code):
        return False
    digits = [int(c) for c in code]
    total = sum(d * (3 if i % 2 else 1) for i, d in enumerate(reversed(digits[:-1]), start=1))
    return (10 - total % 10) % 10 == digits[-1]


def _host(url: str) -> str:
    host = (urlsplit(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def site_name(host: str) -> str:
    """``amazon`` for amazon.com, www.amazon.co.uk and amazon.de alike.

    One store entry covers a shop's country sites (the ``amazon`` store links
    amazon.com, .co.uk, .de and .se today), so links are matched on the name, not
    the full host. Two-part country suffixes (co.uk, com.au) are dropped whole.
    """
    labels = host.split(".")
    if (
        len(labels) >= 3
        and labels[-2] in ("co", "com", "org", "net", "ac")
        and len(labels[-1]) == 2
    ):
        labels = labels[:-2]
    else:
        labels = labels[:-1]
    return labels[-1] if labels else host


def _store_host(stores_dir: Path, store_id: str) -> str | None:
    try:
        store = json.loads((stores_dir / store_id / "store.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return _host(store.get("storefront_url", "")) or None


def _verify_quoted(enrichment: dict, fetcher: Fetcher) -> str | None:
    """Shared rule: the source loads and the quote is on it."""
    quote = enrichment.get("source_quote") or ""
    if not quote.strip():
        return "no source_quote"
    page = fetcher.get(enrichment.get("source_url", ""))
    if not page.ok:
        return f"source did not load ({page.error})"
    if not quote_on_page(quote, page):
        return "quote not found on the source page"
    return None


def verify(enrichment: dict, fetcher: Fetcher, stores_dir: Path) -> str | None:
    """None when the enrichment is proven, otherwise why it is not."""
    field = enrichment["pointer"].rsplit("/", 1)[-1]
    value = enrichment["value"]
    quote = normalize(enrichment.get("source_quote") or "")

    if field in TEMPERATURE_FIELDS:
        low = 0 if field in ZERO_OK_TEMPERATURES else 1
        if isinstance(value, bool) or not isinstance(value, int) or not low <= value < 500:
            return f"temperature must be a whole number of °C from {low} to 499"
        if problem := _verify_quoted(enrichment, fetcher):
            return problem
        return None if number_in(value, quote) else "value is not in the quote"

    if field in NUMBER_FIELDS:
        whole, low, high = NUMBER_FIELDS[field]
        number = isinstance(value, (int, float)) and not isinstance(value, bool)
        if not number or (whole and not float(value).is_integer()) or not low <= value <= high:
            kind = "a whole number" if whole else "a number"
            return f"must be {kind} between {low} and {high}"
        if problem := _verify_quoted(enrichment, fetcher):
            return problem
        return None if number_in(value, quote) else "value is not in the quote"

    if field == "enclosure":
        if value not in ENCLOSURE_VALUES:
            return f"must be one of {', '.join(sorted(ENCLOSURE_VALUES))}"
        if problem := _verify_quoted(enrichment, fetcher):
            return problem
        if not _ENCLOSURE_WORDS.search(quote):
            return "the quote says nothing about an enclosure"
        if not _ENCLOSURE_VALUE_WORDS[value].search(quote):
            return f"the quote doesn't say an enclosure is {value.replace('_', ' ')}"
        return None

    if field in SHEET_FIELDS:
        if not isinstance(value, str):
            return "must be a URL"
        page = fetcher.get(value)
        if not page.ok:
            return f"document did not load ({page.error})"
        if not page.is_pdf and looks_like_product_page(value):
            return "is a shop listing, not a datasheet"
        keywords = (
            ("safety data", "sds", "msds")
            if field == "safety_sheet_url"
            else (
                "technical data",
                "data sheet",
                "datasheet",
                "tds",
            )
        )
        if not page.is_pdf and not any(k in page.text for k in keywords):
            return "page does not look like a datasheet"
        return None

    if field == "gtin":
        if not isinstance(value, str) or not gtin_valid(value):
            return "not a valid GTIN (check digit)"
        if problem := _verify_quoted(enrichment, fetcher):
            return problem
        return None if value in quote.replace(" ", "") else "GTIN is not in the quote"

    if field == "article_number":
        if not isinstance(value, str) or not value.strip():
            return "must be a string"
        if problem := _verify_quoted(enrichment, fetcher):
            return problem
        return None if normalize(value) in quote else "article number is not in the quote"

    if field == "purchase_links":
        if not isinstance(value, list) or not value:
            return "must be a non-empty list of links"
        for link in value:
            if not isinstance(link, dict):
                return "each link must be an object"
            url, store_id = link.get("url", ""), link.get("store_id", "")
            store_host = _store_host(stores_dir, store_id)
            if store_host is None:
                return f"store_id {store_id!r} is not a store under stores/"
            if site_name(_host(url)) != site_name(store_host):
                return f"{url} is not on {store_id}'s site ({store_host})"
            if is_storefront_root(url):
                return f"{url} is the shop's front page"
            page = fetcher.get(url)
            if not page.ok:
                return f"{url} did not load ({page.error})"
        return None

    return f"field {field!r} is not one enrichment writes"
