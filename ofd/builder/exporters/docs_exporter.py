"""
Documentation exporter that converts Markdown files to styled HTML pages.

Reads .md files from the docs/ directory, converts them to HTML using the
Python markdown library, wraps them in Adwaita-themed templates, and writes
them to dist/api/v1/editor/.
"""

import json
import re
from pathlib import Path

import markdown


def _slug_from_path(md_path: Path) -> str:
    """Derive a URL-safe slug from a markdown filename."""
    return md_path.stem.lower()


def _title_from_markdown(text: str, fallback: str) -> str:
    """Extract the first H1 heading from markdown text, or use the fallback."""
    match = re.match(r'^#\s+(.+)', text, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return fallback.replace('-', ' ').replace('_', ' ').title()


def _render_doc(md_text: str) -> str:
    """Convert markdown text to HTML with common extensions."""
    return markdown.markdown(
        md_text,
        extensions=['fenced_code', 'tables', 'toc', 'attr_list'],
        extension_configs={
            'toc': {'permalink': False},
        },
    )


def export_docs(output_dir: str, docs_dir: str = "docs", templates_dir: str = None, **kwargs):
    """Export documentation markdown files as styled HTML to dist/api/v1/editor/."""
    docs_path = Path(docs_dir)
    if not docs_path.exists():
        print(f"  Warning: Docs directory '{docs_path}' not found, skipping docs export")
        return

    # Resolve templates
    if templates_dir:
        tpl_dir = Path(templates_dir)
    else:
        tpl_dir = Path(__file__).parent.parent / "templates"

    doc_template_path = tpl_dir / "docs.html"
    index_template_path = tpl_dir / "docs_index.html"

    if not doc_template_path.exists():
        print(f"  Warning: Template not found at {doc_template_path}, skipping docs export")
        return

    doc_template = doc_template_path.read_text(encoding='utf-8')
    index_template = index_template_path.read_text(encoding='utf-8') if index_template_path.exists() else None

    editor_path = Path(output_dir) / "api" / "v1" / "editor"
    editor_path.mkdir(parents=True, exist_ok=True)

    # Collect and convert all markdown files
    md_files = sorted(docs_path.glob("*.md"))
    if not md_files:
        print("  Warning: No .md files found in docs/, skipping docs export")
        return

    doc_entries = []

    for md_file in md_files:
        slug = _slug_from_path(md_file)
        md_text = md_file.read_text(encoding='utf-8')
        title = _title_from_markdown(md_text, md_file.stem)
        html_content = _render_doc(md_text)

        # Fill template
        page_html = doc_template
        page_html = page_html.replace("<TITLE/>", title)
        page_html = page_html.replace("<CONTENT/>", html_content)
        page_html = page_html.replace("<SLUG/>", slug)

        out_file = editor_path / f"{slug}.html"
        out_file.write_text(page_html, encoding='utf-8')

        doc_entries.append({
            "slug": slug,
            "title": title,
            "file": f"{slug}.html",
            "source": md_file.name,
        })

    # Write index.json
    index_json = {
        "count": len(doc_entries),
        "docs": doc_entries,
    }
    index_json_path = editor_path / "index.json"
    with open(index_json_path, 'w', encoding='utf-8') as f:
        json.dump(index_json, f, indent=2, ensure_ascii=False)

    # Write index.html (doc listing page)
    if index_template:
        listing_items = []
        for entry in doc_entries:
            listing_items.append(
                f'<li><a href="{entry["file"]}">{entry["title"]}</a></li>'
            )
        listing_html = "<ul>\n" + "\n".join(listing_items) + "\n</ul>"

        index_page = index_template
        index_page = index_page.replace("<LISTING/>", listing_html)
        index_page = index_page.replace("<COUNT/>", str(len(doc_entries)))

        index_html_path = editor_path / "index.html"
        index_html_path.write_text(index_page, encoding='utf-8')

    print(f"  Written: {len(doc_entries)} docs to {editor_path}")
