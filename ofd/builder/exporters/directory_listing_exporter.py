"""
Directory listing exporter that creates index.html files for all directories.

Creates browsable directory listings for GitHub Pages compatibility.
"""

from pathlib import Path


def generate_listing_html(directory: Path, output_root: Path) -> str:
    """Generate HTML listing for a directory's contents."""
    items = sorted(directory.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))

    lines = ["<ul>"]

    # Add parent directory link if not at root
    if directory != output_root:
        lines.append('<li><span class="dir"><a href="../">..</a></span></li>')

    for item in items:
        if item.name == "index.html":
            continue

        if item.is_dir():
            lines.append(f'<li><span class="dir"><a href="{item.name}/">{item.name}/</a></span></li>')
        else:
            lines.append(f'<li><span class="file"><a href="{item.name}">{item.name}</a></span></li>')

    lines.append("</ul>")
    return "\n".join(lines)


def export_directory_listings(
    output_dir: str,
    templates_dir: str = None,
    **kwargs
):
    """Generate index.html directory listings for all directories."""
    output_path = Path(output_dir)

    # Find template
    if templates_dir:
        template_path = Path(templates_dir) / "directory_listing.html"
    else:
        template_path = Path(__file__).parent.parent / "templates" / "directory_listing.html"

    if not template_path.exists():
        print(f"  Warning: Directory listing template not found at {template_path}")
        return

    with open(template_path, 'r', encoding='utf-8') as f:
        template = f.read()

    count = 0

    # Walk all directories
    for dir_path in output_path.rglob("*"):
        if not dir_path.is_dir():
            continue

        index_file = dir_path / "index.html"

        # Skip if index.html already exists
        if index_file.exists():
            continue

        # Calculate paths
        rel_path = "/" + str(dir_path.relative_to(output_path))
        depth = len(dir_path.relative_to(output_path).parts)
        base_path = "../" * depth
        adwaita_path = base_path + "adwaita.css"
        css_path = base_path + "theme.css"
        root_path = base_path or "./"

        # Generate listing
        listing_html = generate_listing_html(dir_path, output_path)

        # Process template
        html = template
        html = html.replace("<PATH/>", rel_path)
        html = html.replace("<ADWAITA_PATH/>", adwaita_path)
        html = html.replace("<CSS_PATH/>", css_path)
        html = html.replace("<ROOT_PATH/>", root_path)
        html = html.replace("<LISTING/>", listing_html)

        # Write file
        with open(index_file, 'w', encoding='utf-8') as f:
            f.write(html)

        count += 1

    print(f"  Written: {count} directory listing pages")
