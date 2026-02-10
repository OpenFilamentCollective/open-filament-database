"""
Badge exporter that generates GitHub-style SVG badge images at build time.

Produces flat-style badges matching the shields.io aesthetic, served as static
files from the API domain - no external service dependency per page visit.
"""

from pathlib import Path
from xml.sax.saxutils import escape

from ..models import Database

# Approximate character width for Verdana 11px (the standard badge font).
# This uses a simplified average; shields.io uses a full char-width table but
# for the counts and short labels here, 6.8px/char is close enough.
_CHAR_WIDTH = 6.8
_PADDING = 10  # horizontal padding on each side of label/value
_HEIGHT = 20
_FONT_SIZE = 11
_FONT_FAMILY = "Verdana,Geneva,DejaVu Sans,sans-serif"

COLORS = {
    "blue": "#007ec6",
    "green": "#3c1",
    "orange": "#fe7d37",
    "purple": "#9f59c4",
}


def _text_width(text: str) -> float:
    """Estimate rendered text width in pixels."""
    return len(text) * _CHAR_WIDTH


def _render_badge(label: str, value: str, color: str) -> str:
    """Render a flat-style SVG badge matching GitHub/shields.io style."""
    hex_color = COLORS.get(color, color)

    label_w = _text_width(label) + _PADDING * 2
    value_w = _text_width(value) + _PADDING * 2
    total_w = label_w + value_w

    label_x = label_w / 2
    value_x = label_w + value_w / 2
    text_y = 14  # baseline for 20px height badge

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{total_w}" height="{_HEIGHT}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="{total_w}" height="{_HEIGHT}" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="{label_w}" height="{_HEIGHT}" fill="#555"/>
    <rect x="{label_w}" width="{value_w}" height="{_HEIGHT}" fill="{hex_color}"/>
    <rect width="{total_w}" height="{_HEIGHT}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="{_FONT_FAMILY}" text-rendering="geometricPrecision" font-size="{_FONT_SIZE}">
    <text x="{label_x}" y="{text_y + 1}" fill="#010101" fill-opacity=".3">{escape(label)}</text>
    <text x="{label_x}" y="{text_y}">{escape(label)}</text>
    <text x="{value_x}" y="{text_y + 1}" fill="#010101" fill-opacity=".3">{escape(value)}</text>
    <text x="{value_x}" y="{text_y}">{escape(value)}</text>
  </g>
</svg>'''


def export_badges(db: Database, output_dir: str, **kwargs):
    """Export SVG badge images to dist/badges/."""
    badges_path = Path(output_dir) / "badges"
    badges_path.mkdir(parents=True, exist_ok=True)

    badges = {
        "brands": ("brands", str(len(db.brands)), "blue"),
        "filaments": ("filaments", str(len(db.filaments)), "green"),
        "variants": ("variants", str(len(db.variants)), "orange"),
        "stores": ("stores", str(len(db.stores)), "purple"),
    }

    for name, (label, value, color) in badges.items():
        svg = _render_badge(label, value, color)
        badge_file = badges_path / f"{name}.svg"
        with open(badge_file, 'w', encoding='utf-8') as f:
            f.write(svg)

    print(f"  Written: {len(badges)} badge SVGs to {badges_path}")
