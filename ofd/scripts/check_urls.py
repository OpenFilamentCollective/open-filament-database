"""
Check URLs Script.

Collects every http(s) URL stored in ``data/`` and ``stores/`` (purchase links,
store fronts, brand websites, data/safety sheets, ...) and reports each one that
fails to load: HTTP errors (4xx/5xx) as well as DNS, TLS, connection and timeout
failures.

Each URL is requested once even if it appears in many files; the report lists
every file that references a failing URL. A HEAD request is tried first and a
GET is used when the server rejects HEAD.

Note that some shops answer scripted requests with 403 or 429 even though the page
works in a browser; those are reported with their status so they can be told apart
from real breakage (5xx, DNS failures, 404s).

Usage:
    ofd script check_urls                       # check everything
    ofd script check_urls --output broken.txt   # also write the list to a file
    ofd script check_urls --json                # machine-readable summary
    ofd script check_urls --limit 200           # only check the first 200 URLs
"""

import argparse
import json
import threading
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import requests

from ofd.base import BaseScript, ScriptResult, register_script

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36 OpenFilamentDatabase-LinkChecker"
)

# Keys whose values are references rather than links to fetch
_SKIP_KEYS = {"$schema", "$id", "$ref"}


def _walk_urls(node: Any, key: str | None = None):
    if isinstance(node, str):
        if key not in _SKIP_KEYS and node.startswith(("http://", "https://")):
            yield node.strip()
    elif isinstance(node, list):
        for item in node:
            yield from _walk_urls(item, key)
    elif isinstance(node, dict):
        for k, v in node.items():
            yield from _walk_urls(v, k)


def collect_urls(roots: list[Path], project_root: Path) -> dict[str, list[str]]:
    """Map each URL to the sorted list of files that reference it."""
    found: dict[str, set[str]] = defaultdict(set)
    for root in roots:
        for path in root.rglob("*.json"):
            try:
                with open(path, encoding="utf-8") as f:
                    data = json.load(f)
            except (json.JSONDecodeError, OSError):
                continue
            rel = str(path.relative_to(project_root))
            for url in _walk_urls(data):
                found[url].add(rel)
    return {url: sorted(files) for url, files in found.items()}


def check_url(session: requests.Session, url: str, timeout: float) -> str | None:
    """Return a failure description, or None when the URL loads."""
    try:
        # Many servers mishandle HEAD (an error status, or hanging until the read times
        # out or the connection drops); confirm with a GET before reporting.
        try:
            resp = session.head(url, timeout=timeout, allow_redirects=True)
        except (requests.exceptions.ReadTimeout, requests.exceptions.ConnectionError) as e:
            if isinstance(e, (requests.exceptions.SSLError, requests.exceptions.ConnectTimeout)):
                raise
            resp = None
        if resp is None or resp.status_code >= 400:
            if resp is not None:
                resp.close()
            resp = session.get(url, timeout=timeout, allow_redirects=True, stream=True)
        status = resp.status_code
        resp.close()
        if status >= 400:
            return f"HTTP {status}"
        return None
    except requests.exceptions.SSLError:
        return "SSL error"
    except requests.exceptions.ConnectTimeout:
        return "connect timeout"
    except requests.exceptions.ReadTimeout:
        return "read timeout"
    except requests.exceptions.TooManyRedirects:
        return "too many redirects"
    except requests.exceptions.ConnectionError as e:
        text = str(e)
        if "Name or service not known" in text or "getaddrinfo" in text or "nodename" in text:
            return "DNS failure"
        return "connection error"
    except requests.exceptions.RequestException as e:
        return f"error: {type(e).__name__}"


@register_script
class CheckUrlsScript(BaseScript):
    """List every URL in the database that fails to load."""

    name = "check_urls"
    description = "List every URL in data/ and stores/ that returns an error or cannot be loaded"

    def configure_parser(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument(
            "--workers", type=int, default=32, help="Parallel requests (default 32)"
        )
        parser.add_argument(
            "--per-host",
            type=int,
            default=2,
            help="Max simultaneous requests to one host (default 2)",
        )
        parser.add_argument(
            "--timeout", type=float, default=15.0, help="Seconds per request (default 15)"
        )
        parser.add_argument("--limit", type=int, default=0, help="Only check the first N URLs")
        parser.add_argument("--output", type=Path, help="Also write the failing URLs to this file")

    def run(self, args: argparse.Namespace) -> ScriptResult:
        roots = [d for d in (self.data_dir, self.stores_dir) if d.exists()]
        if not roots:
            return ScriptResult(success=False, message="No data/ or stores/ directory found")

        urls = collect_urls(roots, self.project_root)
        targets = sorted(urls)
        if args.limit:
            targets = targets[: args.limit]
        total = len(targets)
        self.log(f"Checking {total} unique URLs...")

        host_locks: dict[str, threading.Semaphore] = defaultdict(
            lambda: threading.Semaphore(args.per_host)
        )
        lock_guard = threading.Lock()
        local = threading.local()

        def work(url: str) -> tuple[str, str | None]:
            if not hasattr(local, "session"):
                local.session = requests.Session()
                local.session.headers["User-Agent"] = USER_AGENT
            host = urlsplit(url).netloc
            with lock_guard:
                sem = host_locks[host]
            with sem:
                return url, check_url(local.session, url, args.timeout)

        failures: dict[str, str] = {}
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = [pool.submit(work, u) for u in targets]
            for done, fut in enumerate(as_completed(futures), 1):
                url, error = fut.result()
                if error:
                    failures[url] = error
                if done % 100 == 0 or done == total:
                    self.emit_progress("checking", int(done * 100 / total), f"{done}/{total}")
                    self.log(f"  {done}/{total} checked, {len(failures)} failing")

        report = [
            {"url": url, "error": failures[url], "files": urls[url]} for url in sorted(failures)
        ]

        lines: list[str] = []
        for entry in report:
            lines.append(f"{entry['error']}\t{entry['url']}")
            lines.extend(f"\t\t{f}" for f in entry["files"])
        if lines:
            self.log("\nFailing URLs:")
            self.log("\n".join(lines))
        if args.output:
            args.output.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
            self.log(f"\nWrote {args.output}")

        message = f"{len(failures)} of {total} URLs failed to load"
        self.log(f"\n{message}")
        return ScriptResult(
            success=True,
            message=message,
            data={"checked": total, "failed": len(failures), "failures": report},
        )
