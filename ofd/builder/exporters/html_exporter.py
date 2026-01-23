"""
HTML exporter that generates a landing page from a template.

Uses templates/index.html and replaces placeholders:
- <VERSION/> - dataset version
- <GENERATED_AT/> - generation timestamp
- <STATS/> - dataset statistics grid
- <OUTPUTFILES/> - file tree with ul/li structure
"""

import shutil
from pathlib import Path

from ..models import Database


def build_abstract_file_tree(db: Database) -> str:
    """Build an abstract file tree showing the layout structure, not every file."""
    # Helper to create nested structure
    def li_file(name: str, href: str = None) -> str:
        if href:
            return f'<li><span class="file"><a href="{href}">{name}</a></span></li>'
        return f'<li><span class="file">{name}</span></li>'

    def li_dir(name: str, contents: str) -> str:
        return f'<li><span class="dir">{name}</span>\n<ul>\n{contents}\n</ul>\n</li>'

    def li_placeholder(text: str) -> str:
        return f'<li><span class="placeholder">{text}</span></li>'

    # Build the tree structure
    lines = ["<ul>"]

    # API structure
    api_variants = li_placeholder("{variant}.json")
    api_filaments = li_dir("{filament-slug}", li_dir("variants", api_variants) + "\n" + li_file("index.json"))
    api_materials = li_dir("{material-slug}", li_dir("filaments", api_filaments) + "\n" + li_file("index.json"))
    api_brands_inner = li_dir("{brand-slug}", li_dir("materials", api_materials) + "\n" + li_file("index.json"))
    api_brand_logos = li_dir("logo", li_placeholder("{logo-id}.json") + "\n" + li_placeholder("{logo-id}.{ext}") + "\n" + li_file("index.json", "api/v1/brands/logo/index.json"))
    api_brands = li_dir("brands", api_brands_inner + "\n" + api_brand_logos + "\n" + li_file("index.json", "api/v1/brands/index.json"))
    api_store_logos = li_dir("logo", li_placeholder("{logo-id}.json") + "\n" + li_placeholder("{logo-id}.{ext}") + "\n" + li_file("index.json", "api/v1/stores/logo/index.json"))
    api_stores = li_dir("stores", li_placeholder("{store-slug}.json") + "\n" + api_store_logos + "\n" + li_file("index.json", "api/v1/stores/index.json"))
    api_schemas = li_dir("schemas", li_placeholder("*.json") + "\n" + li_file("index.json", "api/v1/schemas/index.json"))
    api_v1 = li_dir("v1", api_brands + "\n" + api_stores + "\n" + api_schemas + "\n" + li_file("index.json", "api/v1/index.json"))
    lines.append(li_dir("api", api_v1))

    # CSV structure
    csv_files = "\n".join([
        li_file("brands.csv", "csv/brands.csv"),
        li_file("filaments.csv", "csv/filaments.csv"),
        li_file("materials.csv", "csv/materials.csv"),
        li_file("purchase_links.csv", "csv/purchase_links.csv"),
        li_file("sizes.csv", "csv/sizes.csv"),
        li_file("stores.csv", "csv/stores.csv"),
        li_file("variants.csv", "csv/variants.csv"),
    ])
    lines.append(li_dir("csv", csv_files))

    # JSON structure
    json_brands = li_dir("brands", li_placeholder("{brand-slug}.json") + "\n" + li_file("index.json", "json/brands/index.json"))
    json_files = "\n".join([
        json_brands,
        li_file("all.json", "json/all.json"),
        li_file("all.json.gz", "json/all.json.gz"),
        li_file("all.ndjson", "json/all.ndjson"),
    ])
    lines.append(li_dir("json", json_files))

    # SQLite structure
    sqlite_files = "\n".join([
        li_file("filaments.db", "sqlite/filaments.db"),
        li_file("filaments.db.xz", "sqlite/filaments.db.xz"),
        li_file("stores.db", "sqlite/stores.db"),
        li_file("stores.db.xz", "sqlite/stores.db.xz"),
    ])
    lines.append(li_dir("sqlite", sqlite_files))

    # Root files
    lines.append(li_file("manifest.json", "manifest.json"))

    lines.append("</ul>")
    return "\n".join(lines)


def generate_stats_html(db: Database) -> str:
    """Generate the stats grid HTML."""
    stats = [
        (len(db.brands), "Brands"),
        (len(db.materials), "Materials"),
        (len(db.filaments), "Filaments"),
        (len(db.variants), "Variants"),
        (len(db.sizes), "Sizes"),
        (len(db.stores), "Stores"),
    ]

    html_parts = ['<div class="stats">']
    for value, label in stats:
        html_parts.append(f'''<div class="stat">
    <div class="stat-value">{value}</div>
    <div class="stat-label">{label}</div>
</div>''')
    html_parts.append('</div>')

    return "\n".join(html_parts)


def process_template(
    template: str,
    db: Database,
    version: str,
    generated_at: str,
    output_dir: Path
) -> str:
    """Process the template and replace all placeholders."""
    # Build abstract file tree
    file_tree_html = build_abstract_file_tree(db)

    # Generate stats HTML
    stats_html = generate_stats_html(db)

    # Replace placeholders
    result = template
    result = result.replace("<VERSION/>", version)
    result = result.replace("<GENERATED_AT/>", generated_at)
    result = result.replace("<STATS/>", stats_html)
    result = result.replace("<OUTPUTFILES/>", file_tree_html)

    return result


def export_html(
    db: Database,
    output_dir: str,
    version: str,
    generated_at: str,
    templates_dir: str = None,
    config_dir: str = None,
    **kwargs
):
    """Export index.html landing page from template."""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Find template file
    if templates_dir:
        template_path = Path(templates_dir) / "index.html"
    else:
        # Default: look for templates/ relative to project root
        project_root = Path(__file__).parent.parent.parent
        template_path = project_root / "templates" / "index.html"

    if not template_path.exists():
        print(f"  Warning: Template not found at {template_path}, skipping HTML export")
        return

    # Read template
    with open(template_path, 'r', encoding='utf-8') as f:
        template = f.read()

    # Process template
    html_content = process_template(template, db, version, generated_at, output_path)

    # Write output
    index_file = output_path / "index.html"
    with open(index_file, 'w', encoding='utf-8') as f:
        f.write(html_content)

    print(f"  Written: {index_file}")

    # Copy CSS files from config directory
    if config_dir:
        config_path = Path(config_dir)
    else:
        project_root = Path(__file__).parent.parent.parent
        config_path = project_root / "config"

    # Copy adwaita.css (base Adwaita theme)
    adwaita_source = config_path / "adwaita.css"
    if adwaita_source.exists():
        adwaita_dest = output_path / "adwaita.css"
        shutil.copy2(adwaita_source, adwaita_dest)
        print(f"  Written: {adwaita_dest}")

    # Copy theme.css (application-specific overrides)
    theme_source = config_path / "theme.css"
    if theme_source.exists():
        theme_dest = output_path / "theme.css"
        shutil.copy2(theme_source, theme_dest)
        print(f"  Written: {theme_dest}")
