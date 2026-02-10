"""
Import OpenPrintTag Script - Import data from OpenPrintTag database.

This script downloads the OpenPrintTag database from GitHub and imports
the data into the Open Filament Database format, merging with existing
data without overwriting.
"""

import argparse
import json
import os
import re
import subprocess
import urllib.parse
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Optional

import requests
import yaml

from ofd.base import BaseScript, ScriptResult, register_script
from ofd.scripts.opt_naming_rules import (
    KNOWN_COLORS, MATERIAL_KEYWORDS, PREFIX_RULES,
    PRODUCT_LINE_PREFIXES, PRODUCT_LINE_SKU_PATTERNS,
    PRODUCT_LINE_SUFFIXES, SUFFIX_STRIP_RULES, TECH_SPEC_PATTERNS,
    MAX_VARIANT_LENGTH, MOVE_RULES, GENERIC_RENAME_RULES,
    slugify, clean_display_name, is_color_like, has_material_keyword,
    id_to_display_name, compute_common_prefix, prefix_implied_by_filament,
    strip_name_prefix,
)

# OpenPrintTag repository URL
OPENPRINTTAG_REPO = "https://github.com/OpenPrintTag/openprinttag-database.git"

# Default material densities (g/cm³)
DENSITY_DEFAULTS: dict[str, float] = {
    "PLA": 1.24,
    "PETG": 1.27,
    "ABS": 1.04,
    "ASA": 1.07,
    "TPU": 1.21,
    "TPE": 1.20,
    "PA": 1.14,
    "PA6": 1.14,
    "PA11": 1.03,
    "PA12": 1.01,
    "PA66": 1.14,
    "PC": 1.20,
    "PCTG": 1.23,
    "PVA": 1.23,
    "BVOH": 1.14,
    "HIPS": 1.04,
    "PP": 0.90,
    "PEI": 1.27,
    "PEEK": 1.30,
    "PEKK": 1.30,
    "PVB": 1.08,
    "CPE": 1.25,
    "PET": 1.38,
}

# Default temperatures by material type (°C)
TEMPERATURE_DEFAULTS: dict[str, dict[str, int]] = {
    "PLA": {
        "min_print_temperature": 190,
        "max_print_temperature": 230,
        "min_bed_temperature": 50,
        "max_bed_temperature": 70,
    },
    "PETG": {
        "min_print_temperature": 220,
        "max_print_temperature": 250,
        "min_bed_temperature": 70,
        "max_bed_temperature": 90,
    },
    "ABS": {
        "min_print_temperature": 230,
        "max_print_temperature": 260,
        "min_bed_temperature": 90,
        "max_bed_temperature": 110,
    },
    "ASA": {
        "min_print_temperature": 235,
        "max_print_temperature": 260,
        "min_bed_temperature": 90,
        "max_bed_temperature": 110,
    },
    "TPU": {
        "min_print_temperature": 210,
        "max_print_temperature": 240,
        "min_bed_temperature": 30,
        "max_bed_temperature": 60,
    },
    "TPE": {
        "min_print_temperature": 210,
        "max_print_temperature": 240,
        "min_bed_temperature": 30,
        "max_bed_temperature": 60,
    },
    "PA": {
        "min_print_temperature": 240,
        "max_print_temperature": 280,
        "min_bed_temperature": 80,
        "max_bed_temperature": 100,
    },
    "PA6": {
        "min_print_temperature": 250,
        "max_print_temperature": 290,
        "min_bed_temperature": 80,
        "max_bed_temperature": 100,
    },
    "PA11": {
        "min_print_temperature": 240,
        "max_print_temperature": 270,
        "min_bed_temperature": 80,
        "max_bed_temperature": 100,
    },
    "PA12": {
        "min_print_temperature": 240,
        "max_print_temperature": 270,
        "min_bed_temperature": 80,
        "max_bed_temperature": 100,
    },
    "PA66": {
        "min_print_temperature": 260,
        "max_print_temperature": 300,
        "min_bed_temperature": 90,
        "max_bed_temperature": 110,
    },
    "PC": {
        "min_print_temperature": 260,
        "max_print_temperature": 300,
        "min_bed_temperature": 100,
        "max_bed_temperature": 120,
    },
    "PCTG": {
        "min_print_temperature": 230,
        "max_print_temperature": 260,
        "min_bed_temperature": 70,
        "max_bed_temperature": 90,
    },
    "PVA": {
        "min_print_temperature": 180,
        "max_print_temperature": 210,
        "min_bed_temperature": 50,
        "max_bed_temperature": 60,
    },
    "BVOH": {
        "min_print_temperature": 190,
        "max_print_temperature": 220,
        "min_bed_temperature": 50,
        "max_bed_temperature": 70,
    },
    "HIPS": {
        "min_print_temperature": 220,
        "max_print_temperature": 250,
        "min_bed_temperature": 90,
        "max_bed_temperature": 110,
    },
    "PP": {
        "min_print_temperature": 210,
        "max_print_temperature": 240,
        "min_bed_temperature": 80,
        "max_bed_temperature": 100,
    },
    "PEI": {
        "min_print_temperature": 340,
        "max_print_temperature": 380,
        "min_bed_temperature": 120,
        "max_bed_temperature": 160,
    },
    "PEEK": {
        "min_print_temperature": 360,
        "max_print_temperature": 420,
        "min_bed_temperature": 120,
        "max_bed_temperature": 160,
    },
    "PEKK": {
        "min_print_temperature": 350,
        "max_print_temperature": 400,
        "min_bed_temperature": 120,
        "max_bed_temperature": 160,
    },
    "PVB": {
        "min_print_temperature": 190,
        "max_print_temperature": 220,
        "min_bed_temperature": 50,
        "max_bed_temperature": 75,
    },
    "CPE": {
        "min_print_temperature": 240,
        "max_print_temperature": 270,
        "min_bed_temperature": 70,
        "max_bed_temperature": 90,
    },
    "PET": {
        "min_print_temperature": 220,
        "max_print_temperature": 250,
        "min_bed_temperature": 70,
        "max_bed_temperature": 90,
    },
}

# Brands to ignore during import (test/placeholder brands)
IGNORED_BRANDS: set[str] = {
    "fake_company",
    "generic",
}

# Brand slug aliases: maps OPT brand slugs to curated brand directory names
BRAND_ALIASES: dict[str, str] = {
    "addnorth": "add_north",
    "bambulab": "bambu_lab",
    "esun": "esun_3d",
    "fillamentum": "filamentpm",
}

# Tag to trait mapping (OPT tags -> internal traits)
TAG_TO_TRAIT_MAP: dict[str, str] = {
    # Visual properties
    "silk": "silk",
    "matte": "matte",
    "glow_in_the_dark": "glow",
    "translucent": "translucent",
    "transparent": "transparent",
    "glitter": "glitter",
    "neon": "neon",
    "iridescent": "iridescent",
    "pearlescent": "pearlescent",
    "coextruded": "coextruded",
    "gradual_color_change": "gradual_color_change",
    "temperature_color_change": "temperature_color_change",
    "illuminescent_color_change": "illuminescent_color_change",
    "without_pigments": "without_pigments",
    "lithophane": "lithophane",
    "limited_edition": "limited_edition",
    # Material properties
    "recycled": "recycled",
    "recyclable": "recyclable",
    "biodegradable": "biodegradable",
    "bio_based": "bio_based",
    "biocompatible": "biocompatible",
    "home_compostable": "home_compostable",
    "industrially_compostable": "industrially_compostable",
    "antibacterial": "antibacterial",
    # Technical properties
    "abrasive": "abrasive",
    "filtration_recommended": "filtration_recommended",
    "esd_safe": "esd_safe",
    "conductive": "conductive",
    "emi_shielding": "emi_shielding",
    "water_soluble": "water_soluble",
    "ipa_soluble": "ipa_soluble",
    "limonene_soluble": "limonene_soluble",
    "self_extinguishing": "self_extinguishing",
    "high_temperature": "high_temperature",
    "low_outgassing": "low_outgassing",
    "foaming": "foaming",
    "castable": "castable",
    "blend": "blend",
    "paramagnetic": "paramagnetic",
    "radiation_shielding": "radiation_shielding",
    "air_filtering": "air_filtering",
    # Material composition
    "contains_carbon": "contains_carbon",
    "contains_carbon_fiber": "contains_carbon_fiber",
    "contains_carbon_nano_tubes": "contains_carbon_nano_tubes",
    "contains_glass": "contains_glass",
    "contains_glass_fiber": "contains_glass_fiber",
    "contains_kevlar": "contains_kevlar",
    "contains_wood": "contains_wood",
    "contains_bamboo": "contains_bamboo",
    "contains_cork": "contains_cork",
    "contains_metal": "contains_metal",
    "contains_bronze": "contains_bronze",
    "contains_copper": "contains_copper",
    "contains_iron": "contains_iron",
    "contains_steel": "contains_steel",
    "contains_aluminium": "contains_aluminium",
    "contains_stone": "contains_stone",
    "contains_ceramic": "contains_ceramic",
    "contains_magnetite": "contains_magnetite",
    "contains_wax": "contains_wax",
    "contains_algae": "contains_algae",
    "contains_pine": "contains_pine",
    "contains_graphene": "contains_graphene",
    # Imitation
    "imitates_wood": "imitates_wood",
    "imitates_metal": "imitates_metal",
    "imitates_marble": "imitates_marble",
    "imitates_stone": "imitates_stone",
}


@dataclass
class ImportReport:
    """Tracks import statistics and missing data."""

    brands_imported: int = 0
    brands_merged: int = 0
    brands_skipped: int = 0
    materials_imported: int = 0
    filaments_created: int = 0
    variants_created: int = 0
    sizes_created: int = 0

    missing_websites: list[str] = field(default_factory=list)
    missing_logos: list[str] = field(default_factory=list)
    missing_density: list[str] = field(default_factory=list)
    missing_temperatures: list[str] = field(default_factory=list)
    parse_warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    fuzzy_matches: list[str] = field(default_factory=list)

    naming_fixes: list[str] = field(default_factory=list)
    tech_spec_warnings: list[str] = field(default_factory=list)
    long_name_warnings: list[str] = field(default_factory=list)
    duplicate_skips: list[str] = field(default_factory=list)

    def generate_report(self) -> str:
        """Generate a human-readable report showing only issues."""
        lines = [
            "=" * 60,
            "OPENPRINTTAG IMPORT REPORT - ISSUES",
            "=" * 60,
            "",
        ]

        has_issues = False

        if self.errors:
            has_issues = True
            lines.append(f"ERRORS ({len(self.errors)}):")
            for err in self.errors:
                lines.append(f"   - {err}")
            lines.append("")

        if self.missing_websites:
            has_issues = True
            lines.append(f"MISSING WEBSITES ({len(self.missing_websites)}):")
            for brand in self.missing_websites:
                lines.append(f"   - {brand}")
            lines.append("")

        if self.missing_logos:
            has_issues = True
            lines.append(f"MISSING LOGOS ({len(self.missing_logos)}):")
            for brand in self.missing_logos:
                lines.append(f"   - {brand}")
            lines.append("")

        if self.missing_temperatures:
            has_issues = True
            lines.append(f"MISSING TEMPERATURE DATA ({len(self.missing_temperatures)}):")
            for item in self.missing_temperatures:
                lines.append(f"   - {item}")
            lines.append("")

        if self.parse_warnings:
            has_issues = True
            lines.append(f"PARSE WARNINGS ({len(self.parse_warnings)}):")
            for warn in self.parse_warnings:
                lines.append(f"   - {warn}")
            lines.append("")

        if self.fuzzy_matches:
            has_issues = True
            lines.append(f"FUZZY MATCHES (verify these are correct) ({len(self.fuzzy_matches)}):")
            for match in self.fuzzy_matches:
                lines.append(f"   - {match}")
            lines.append("")

        if self.tech_spec_warnings:
            has_issues = True
            lines.append(f"TECH SPEC WARNINGS ({len(self.tech_spec_warnings)}):")
            for warn in self.tech_spec_warnings:
                lines.append(f"   - {warn}")
            lines.append("")

        if self.long_name_warnings:
            has_issues = True
            lines.append(f"LONG NAME WARNINGS ({len(self.long_name_warnings)}):")
            for warn in self.long_name_warnings:
                lines.append(f"   - {warn}")
            lines.append("")

        if self.duplicate_skips:
            has_issues = True
            lines.append(f"DUPLICATE SKIPS ({len(self.duplicate_skips)}):")
            for skip in self.duplicate_skips:
                lines.append(f"   - {skip}")
            lines.append("")

        if not has_issues:
            lines.append("No issues found!")
            lines.append("")

        # Summary line
        lines.append("-" * 60)
        lines.append(
            f"Summary: {self.brands_imported} new, {self.brands_merged} merged, "
            f"{self.brands_skipped} skipped, {self.variants_created} variants"
        )

        return "\n".join(lines)


def convert_rgba_to_rgb(rgba: Optional[str]) -> str:
    """Convert RGBA hex to RGB hex (strip alpha channel)."""
    if not rgba:
        return "#000000"

    # Remove leading #
    hex_str = rgba.lstrip("#")

    # Extract RGB (first 6 chars), ignore alpha (last 2)
    if len(hex_str) >= 6:
        rgb = hex_str[:6].upper()
        return f"#{rgb}"

    return "#000000"


def microns_to_mm(microns: int) -> float:
    """Convert microns to millimeters."""
    return microns / 1000.0


@register_script
class ImportOpenPrintTagScript(BaseScript):
    """Import data from OpenPrintTag database."""

    name = "import_openprinttag"
    description = "Import data from OpenPrintTag database"

    def __init__(self, project_root: Optional[Path] = None):
        super().__init__(project_root)
        self.report = ImportReport()
        self.brandfetch_client_id: Optional[str] = None
        self.output_dir: Path = self.data_dir
        self.merge_mode: bool = True

    def configure_parser(self, parser: argparse.ArgumentParser) -> None:
        """Add script-specific arguments."""
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview changes without writing files",
        )
        parser.add_argument(
            "--skip-update",
            action="store_true",
            help="Skip repository update, use cached version",
        )
        parser.add_argument(
            "--skip-brandfetch",
            action="store_true",
            help="Skip Brandfetch logo/website discovery",
        )
        parser.add_argument(
            "--cache-path",
            default=".cache/openprinttag-database",
            help="Path to cached OpenPrintTag repository",
        )
        parser.add_argument(
            "--brand",
            help="Only import specific brand (by slug)",
        )
        parser.add_argument(
            "--output-dir",
            default=None,
            help="Write to this directory instead of data/",
        )
        parser.add_argument(
            "--no-merge",
            action="store_true",
            help="Don't merge with existing data (fresh write)",
        )
        parser.add_argument(
            "--report-path",
            default=".cache/openprinttag-import-report.txt",
            help="Path to save import report",
        )

    def run(self, args: argparse.Namespace) -> ScriptResult:
        """Execute the import."""
        dry_run = args.dry_run
        skip_update = args.skip_update
        skip_brandfetch = args.skip_brandfetch
        cache_path = self.project_root / args.cache_path
        brand_filter = args.brand
        report_path = self.project_root / args.report_path

        # Output directory: --output-dir overrides data_dir
        if args.output_dir:
            self.output_dir = Path(args.output_dir)
        else:
            self.output_dir = self.data_dir

        # Merge mode: merge with existing data when writing to data_dir
        # (unless --no-merge is set), never merge when using --output-dir
        self.merge_mode = not args.no_merge and args.output_dir is None

        # Get Brandfetch client ID from environment
        self.brandfetch_client_id = os.environ.get("BRANDFETCH_CLIENT_ID")
        if not self.brandfetch_client_id and not skip_brandfetch:
            self.log("Note: BRANDFETCH_CLIENT_ID not set, skipping logo/website discovery")
            skip_brandfetch = True

        if dry_run:
            self.log("=== DRY RUN MODE ===\n")

        # Step 1: Ensure repository
        self.emit_progress("repo", 0, "Preparing repository...")
        try:
            self._ensure_repository(cache_path, skip_update)
        except Exception as e:
            return ScriptResult(
                success=False,
                message=f"Failed to prepare repository: {e}",
            )
        self.emit_progress("repo", 100, "Repository ready")

        # Step 2: Load all source data
        self.emit_progress("loading", 0, "Loading OpenPrintTag data...")
        brands = self._load_brands(cache_path)
        materials = self._load_materials(cache_path)
        packages = self._load_packages(cache_path)
        self.log(f"Loaded {len(brands)} brands, {len(materials)} materials, {len(packages)} packages")
        self.emit_progress("loading", 100, "Data loaded")

        # Step 3: Group data by brand
        materials_by_brand = self._group_by_brand(materials)
        packages_by_material = self._group_packages_by_material(packages)

        # Step 4: Process each brand
        self.emit_progress("processing", 0, "Processing brands...")
        total_brands = len(brands)

        for i, (brand_slug, brand_data) in enumerate(sorted(brands.items())):
            if brand_filter and brand_slug != brand_filter:
                continue

            progress = int((i / max(total_brands, 1)) * 100)
            self.emit_progress("processing", progress, f"Processing {brand_slug}...")

            self._process_brand(
                brand_slug,
                brand_data,
                materials_by_brand.get(brand_slug, []),
                packages_by_material,
                skip_brandfetch,
                dry_run,
            )

        self.emit_progress("processing", 100, "Processing complete")

        # Step 5: Save report
        report_text = self.report.generate_report()
        self.log("\n" + report_text)

        if not dry_run:
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_path.write_text(report_text)
            self.log(f"\nReport saved to: {report_path}")

        return ScriptResult(
            success=True,
            message="Import completed",
            data={
                "brands_imported": self.report.brands_imported,
                "brands_merged": self.report.brands_merged,
                "materials_imported": self.report.materials_imported,
                "variants_created": self.report.variants_created,
            },
        )

    def _ensure_repository(self, cache_path: Path, skip_update: bool) -> None:
        """Clone or update the OpenPrintTag repository."""
        if cache_path.exists() and (cache_path / ".git").exists():
            if not skip_update:
                self.log("Updating OpenPrintTag repository...")
                result = subprocess.run(
                    ["git", "-C", str(cache_path), "pull", "--ff-only"],
                    capture_output=True,
                    text=True,
                )
                if result.returncode != 0:
                    self.log(f"Warning: git pull failed: {result.stderr}")
        else:
            self.log("Cloning OpenPrintTag repository...")
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            result = subprocess.run(
                ["git", "clone", "--depth=1", OPENPRINTTAG_REPO, str(cache_path)],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise RuntimeError(f"git clone failed: {result.stderr}")

    def _load_yaml(self, path: Path) -> Optional[dict[str, Any]]:
        """Load a YAML file."""
        try:
            with open(path, encoding="utf-8") as f:
                return yaml.safe_load(f)
        except Exception as e:
            self.report.errors.append(f"Failed to load {path.name}: {e}")
            return None

    def _load_brands(self, cache_path: Path) -> dict[str, dict]:
        """Load all brand YAML files."""
        brands: dict[str, dict] = {}
        brands_dir = cache_path / "data" / "brands"

        if not brands_dir.exists():
            return brands

        for yaml_file in sorted(brands_dir.glob("*.yaml")):
            data = self._load_yaml(yaml_file)
            if data and "slug" in data:
                brands[data["slug"]] = data

        return brands

    def _load_materials(self, cache_path: Path) -> list[dict]:
        """Load all material YAML files."""
        materials: list[dict] = []
        materials_dir = cache_path / "data" / "materials"

        if not materials_dir.exists():
            return materials

        for brand_dir in sorted(materials_dir.iterdir()):
            if not brand_dir.is_dir():
                continue
            for yaml_file in sorted(brand_dir.glob("*.yaml")):
                data = self._load_yaml(yaml_file)
                if data:
                    materials.append(data)

        return materials

    def _load_packages(self, cache_path: Path) -> list[dict]:
        """Load all material package YAML files."""
        packages: list[dict] = []
        packages_dir = cache_path / "data" / "material-packages"

        if not packages_dir.exists():
            return packages

        for brand_dir in sorted(packages_dir.iterdir()):
            if not brand_dir.is_dir():
                continue
            for yaml_file in sorted(brand_dir.glob("*.yaml")):
                data = self._load_yaml(yaml_file)
                if data:
                    packages.append(data)

        return packages

    def _group_by_brand(self, materials: list[dict]) -> dict[str, list[dict]]:
        """Group materials by brand slug."""
        grouped: dict[str, list[dict]] = {}
        for material in materials:
            brand_slug = material.get("brand", {}).get("slug", "")
            if brand_slug:
                if brand_slug not in grouped:
                    grouped[brand_slug] = []
                grouped[brand_slug].append(material)
        return grouped

    def _group_packages_by_material(self, packages: list[dict]) -> dict[str, list[dict]]:
        """Group packages by material slug."""
        grouped: dict[str, list[dict]] = {}
        for package in packages:
            material_slug = package.get("material", {}).get("slug", "")
            if material_slug:
                if material_slug not in grouped:
                    grouped[material_slug] = []
                grouped[material_slug].append(package)
        return grouped

    def _process_brand(
        self,
        brand_slug: str,
        brand_data: dict,
        materials: list[dict],
        packages_by_material: dict[str, list[dict]],
        skip_brandfetch: bool,
        dry_run: bool,
    ) -> None:
        """Process a single brand and its materials."""
        brand_id = slugify(brand_slug)

        # Skip ignored brands (test/placeholder entries)
        if brand_id in IGNORED_BRANDS:
            self.report.brands_skipped += 1
            return
        brand_name = brand_data.get("name", brand_slug)

        # Apply brand aliases (always, regardless of merge mode)
        if brand_id in BRAND_ALIASES:
            alias_target = BRAND_ALIASES[brand_id]
            self.report.fuzzy_matches.append(
                f"'{brand_id}' -> '{alias_target}' (alias)"
            )
            brand_id = alias_target

        # Try to find existing folder using fuzzy matching (only in merge mode)
        if self.merge_mode:
            existing_folder = self._find_existing_brand_folder(brand_id, brand_name)
            if existing_folder:
                # Use the existing folder's ID instead of generating new one
                brand_id = existing_folder.name
                brand_dir = existing_folder
            else:
                brand_dir = self.output_dir / brand_id
        else:
            brand_dir = self.output_dir / brand_id

        # Check for existing brand data
        existing_brand: Optional[dict] = None
        brand_json_path = brand_dir / "brand.json"
        if brand_json_path.exists():
            try:
                with open(brand_json_path, encoding="utf-8") as f:
                    existing_brand = json.load(f)
            except Exception:
                pass

        # Convert OPT brand to internal format
        countries = brand_data.get("countries_of_origin", [])
        origin = countries[0] if countries else "Unknown"

        new_brand = {
            "id": brand_id,
            "name": brand_data.get("name", brand_slug),
            "website": "",
            "logo": "logo.png",
            "origin": origin,
            "source": "openprinttag",
        }

        # Merge with existing (fill gaps only)
        if existing_brand:
            merged_brand = self._merge_data(existing_brand, new_brand)
            self.report.brands_merged += 1
        else:
            merged_brand = new_brand
            self.report.brands_imported += 1

        # Check if we need website/logo
        need_website = not merged_brand.get("website")
        need_logo = True
        for ext in ["png", "jpg", "svg", "jpeg"]:
            if (brand_dir / f"logo.{ext}").exists():
                need_logo = False
                merged_brand["logo"] = f"logo.{ext}"
                break

        # Try Brandfetch if needed
        if not skip_brandfetch and (need_website or need_logo):
            domain = self._discover_domain(merged_brand["name"])
            if domain:
                if need_website:
                    merged_brand["website"] = domain
                if need_logo and not dry_run:
                    logo_ext = self._download_logo(domain, brand_dir)
                    if logo_ext:
                        merged_brand["logo"] = f"logo.{logo_ext}"
                        need_logo = False

        # Track missing data
        if not merged_brand.get("website"):
            self.report.missing_websites.append(brand_id)
        if need_logo:
            self.report.missing_logos.append(brand_id)

        # Write brand.json
        if not dry_run:
            brand_dir.mkdir(parents=True, exist_ok=True)
            self._save_json(brand_json_path, merged_brand)

        # Process materials for this brand
        self._process_materials(
            brand_id,
            brand_dir,
            materials,
            packages_by_material,
            dry_run,
        )

    def _find_existing_brand_folder(
        self, brand_id: str, brand_name: str
    ) -> Optional[Path]:
        """
        Find an existing brand folder using aliases and fuzzy matching.

        Priority order:
        1. Alias from BRAND_ALIASES (takes precedence, for consolidation)
        2. Exact match
        3. Prefix match (e.g., "prusament_resin" -> "prusament")
        4. Fuzzy match via SequenceMatcher

        Returns the path to the existing folder, or None if no match found.
        """
        # Check for explicit alias mapping FIRST (takes precedence for consolidation)
        if brand_id in BRAND_ALIASES:
            alias_target = BRAND_ALIASES[brand_id]
            alias_path = self.data_dir / alias_target
            if alias_path.exists():
                match_info = f"'{brand_id}' -> '{alias_target}' (alias)"
                self.report.fuzzy_matches.append(match_info)
                return alias_path

        # Exact match check
        exact_path = self.data_dir / brand_id
        if exact_path.exists():
            return exact_path

        # Normalize function for comparison - removes underscores, hyphens
        def normalize(s: str) -> str:
            return re.sub(r"[_\-]", "", s.lower())

        normalized_id = normalize(brand_id)
        normalized_name = normalize(brand_name)

        best_prefix_match: Optional[Path] = None
        best_prefix_score: float = 0.0
        best_fuzzy_match: Optional[Path] = None
        best_fuzzy_score: float = 0.0

        for folder in sorted(self.data_dir.iterdir()):
            if not folder.is_dir():
                continue

            folder_normalized = normalize(folder.name)

            # Check for prefix match: existing folder is prefix of incoming
            # e.g., "prusament" is prefix of "prusamentresin" -> match prusament
            if normalized_id.startswith(folder_normalized) and len(
                folder_normalized
            ) >= 4:
                prefix_score = len(folder_normalized) / len(normalized_id)
                if prefix_score > best_prefix_score:
                    best_prefix_score = prefix_score
                    best_prefix_match = folder
                continue

            # Compare against both ID and name using sequence matcher
            score_id = SequenceMatcher(None, normalized_id, folder_normalized).ratio()
            score_name = SequenceMatcher(
                None, normalized_name, folder_normalized
            ).ratio()
            score = max(score_id, score_name)

            if score > best_fuzzy_score:
                best_fuzzy_score = score
                best_fuzzy_match = folder

        # Threshold for prefix matches (lower, since prefix is a strong signal)
        prefix_threshold = 0.55
        # Threshold for fuzzy matches (higher, to avoid false positives)
        fuzzy_threshold = 0.85

        # Prefer prefix match if good enough
        if best_prefix_match and best_prefix_score >= prefix_threshold:
            match_info = (
                f"'{brand_id}' -> '{best_prefix_match.name}' "
                f"(prefix: {best_prefix_score:.2f})"
            )
            self.report.fuzzy_matches.append(match_info)
            return best_prefix_match

        # Fall back to fuzzy match
        if best_fuzzy_match and best_fuzzy_score >= fuzzy_threshold:
            match_info = (
                f"'{brand_id}' -> '{best_fuzzy_match.name}' "
                f"(fuzzy: {best_fuzzy_score:.2f})"
            )
            self.report.fuzzy_matches.append(match_info)
            return best_fuzzy_match

        return None

    def _merge_data(self, existing: dict, new: dict) -> dict:
        """Merge new data into existing, only filling gaps."""
        result = existing.copy()

        for key, value in new.items():
            existing_value = result.get(key)
            # Only add if missing or empty
            if existing_value is None or existing_value == "" or existing_value == []:
                result[key] = value

        return result

    def _discover_domain(self, brand_name: str) -> Optional[str]:
        """Try to find brand domain using Brandfetch CDN, then search API."""
        if not self.brandfetch_client_id:
            return None

        # Normalize brand name for domain guessing
        normalized = re.sub(r"[^a-z0-9]", "", brand_name.lower())

        # Domain patterns to try
        patterns = [
            f"{normalized}.com",
            f"{normalized}.net",
            f"{normalized}.io",
            f"{normalized}3d.com",
            f"{normalized}filament.com",
            f"{normalized}-filament.com",
        ]

        for domain in patterns:
            url = f"https://cdn.brandfetch.io/{domain}?c={self.brandfetch_client_id}"
            try:
                response = requests.head(url, timeout=5)
                if response.ok:
                    return f"https://{domain}"
            except Exception:
                continue

        # Fallback: try Brandfetch Search API
        return self._search_brandfetch(brand_name)

    def _search_brandfetch(self, brand_name: str) -> Optional[str]:
        """
        Search Brandfetch API for brand domain as fallback.

        Only called when domain pattern guessing fails.
        """
        if not self.brandfetch_client_id:
            return None

        # URL-encode the brand name
        encoded_name = urllib.parse.quote(brand_name)

        url = f"https://api.brandfetch.io/v2/search/{encoded_name}"
        headers = {"Authorization": f"Bearer {self.brandfetch_client_id}"}

        try:
            response = requests.get(url, headers=headers, timeout=10)
            if response.ok:
                results = response.json()
                # Take the first/best match if available
                if results and isinstance(results, list) and len(results) > 0:
                    first_match = results[0]
                    domain = first_match.get("domain")
                    if domain:
                        return f"https://{domain}"
        except Exception:
            pass

        return None

    def _download_logo(self, domain: str, brand_dir: Path) -> Optional[str]:
        """Download logo from Brandfetch CDN."""
        if not self.brandfetch_client_id:
            return None

        # Extract just the domain from URL
        domain_only = domain.replace("https://", "").replace("http://", "")

        url = f"https://cdn.brandfetch.io/{domain_only}?c={self.brandfetch_client_id}"
        try:
            response = requests.get(url, timeout=10)
            if response.ok:
                content_type = response.headers.get("content-type", "").lower()

                # Validate content-type is actually an image
                valid_image_types = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/svg"]
                is_image = any(img_type in content_type for img_type in valid_image_types)
                if not is_image:
                    # Not an image (likely HTML error page)
                    return None

                # Extra safety: check content doesn't start with HTML
                content_start = response.content[:100].lower()
                if b"<!doctype" in content_start or b"<html" in content_start:
                    return None

                # Determine extension
                if "svg" in content_type:
                    ext = "svg"
                elif "jpeg" in content_type or "jpg" in content_type:
                    ext = "jpg"
                else:
                    ext = "png"

                brand_dir.mkdir(parents=True, exist_ok=True)
                logo_path = brand_dir / f"logo.{ext}"
                logo_path.write_bytes(response.content)
                return ext
        except Exception:
            pass

        return None

    def _process_materials(
        self,
        brand_id: str,
        brand_dir: Path,
        materials: list[dict],
        packages_by_material: dict[str, list[dict]],
        dry_run: bool,
    ) -> None:
        """Process all materials for a brand."""
        # Group by material type and filament
        # Structure: {material_type: {filament_id: {color_id: {variant_data, sizes}}}}
        hierarchy: dict[str, dict[str, dict[str, dict]]] = {}

        for material in materials:
            # Skip non-FFF materials
            if material.get("class") != "FFF":
                continue

            material_type = material.get("type", "").upper()
            if not material_type:
                continue

            material_slug = material.get("slug", "")
            name = material.get("name", "")
            tags = material.get("tags", [])
            properties = material.get("properties", {})

            # Parse material name to get filament_id and color_id
            filament_id, color_id = self._parse_material_name(name, material_type, tags)

            if not filament_id or not color_id:
                self.report.parse_warnings.append(f"Could not parse: {name}")
                continue

            # Initialize hierarchy levels
            if material_type not in hierarchy:
                hierarchy[material_type] = {}
            if filament_id not in hierarchy[material_type]:
                hierarchy[material_type][filament_id] = {}

            # Build variant data
            primary_color = material.get("primary_color", {})
            color_rgba = primary_color.get("color_rgba") if primary_color else None
            secondary_colors = material.get("secondary_colors", [])

            # Handle multi-color
            if secondary_colors:
                color_hex = [convert_rgba_to_rgb(c.get("color_rgba")) for c in secondary_colors]
                if color_rgba:
                    color_hex.insert(0, convert_rgba_to_rgb(color_rgba))
            else:
                color_hex = convert_rgba_to_rgb(color_rgba)

            variant_data = {
                "id": color_id,
                "name": self._extract_color_name(name, material_type, tags),
                "color_hex": color_hex,
            }

            # Add traits from tags
            traits = self._map_tags_to_traits(tags)
            if traits:
                variant_data["traits"] = traits

            # Build filament data (if not already set)
            if color_id not in hierarchy[material_type][filament_id]:
                filament_data = {
                    "id": filament_id,
                    "name": id_to_display_name(filament_id),
                    "density": properties.get("density", DENSITY_DEFAULTS.get(material_type, 1.24)),
                    "diameter_tolerance": 0.02,  # Default
                }

                # Add temperature data: from OPT if available, otherwise from defaults
                temp_fields = [
                    "min_print_temperature",
                    "max_print_temperature",
                    "min_bed_temperature",
                    "max_bed_temperature",
                    "preheat_temperature",
                    "chamber_temperature",
                    "min_chamber_temperature",
                    "max_chamber_temperature",
                ]

                if "min_print_temperature" in properties:
                    # Use OPT temperatures
                    for field in temp_fields:
                        if field in properties:
                            filament_data[field] = properties[field]
                else:
                    # Apply defaults based on material type
                    temp_defaults = TEMPERATURE_DEFAULTS.get(material_type, {})
                    if temp_defaults:
                        for field, value in temp_defaults.items():
                            filament_data[field] = value
                    else:
                        # No defaults available - track as missing
                        self.report.missing_temperatures.append(f"{brand_id}/{material_type}/{filament_id}")

                hierarchy[material_type][filament_id][color_id] = {
                    "filament": filament_data,
                    "variant": variant_data,
                    "sizes": [],
                }
            else:
                hierarchy[material_type][filament_id][color_id]["variant"] = variant_data

            # Add sizes from packages
            material_packages = packages_by_material.get(material_slug, [])
            for pkg in material_packages:
                size_data = {
                    "filament_weight": pkg.get("nominal_netto_full_weight", 1000),
                    "diameter": microns_to_mm(pkg.get("filament_diameter", 1750)),
                }
                if pkg.get("gtin"):
                    size_data["gtin"] = str(pkg["gtin"])

                hierarchy[material_type][filament_id][color_id]["sizes"].append(size_data)

            self.report.materials_imported += 1

        # Phase 2: Apply all cleanup transformations to in-memory dict
        hierarchy = self._apply_naming_cleanup(brand_id, hierarchy)

        # Phase 3: Write cleaned hierarchy to disk
        self._write_hierarchy(brand_dir, hierarchy, dry_run)

    def _parse_material_name(
        self, name: str, material_type: str, tags: list[str]
    ) -> tuple[str, str]:
        """Parse OPT material name into (filament_id, color_id)."""
        # Strategy 1: Comma-separated (3D Fuel style)
        if ", " in name:
            parts = name.split(", ", 1)
            product_line = parts[0].strip()
            color = parts[1].strip() if len(parts) > 1 else "default"
            return (slugify(product_line), slugify(color))

        # Strategy 2: Use type + tags to identify product line
        name_lower = name.lower()
        type_lower = material_type.lower()

        # Build filament name from type + modifiers
        modifiers = []
        if "silk" in tags:
            modifiers.append("silk")
        if "matte" in tags:
            modifiers.append("matte")
        if "high_speed" in tags or "high speed" in name_lower:
            modifiers.append("high_speed")
        if "glow_in_the_dark" in tags or "glow" in name_lower:
            modifiers.append("glow")
        if "contains_carbon_fiber" in tags or "cf" in name_lower or "carbon fiber" in name_lower:
            modifiers.append("cf")
        if "contains_glass_fiber" in tags or "gf" in name_lower or "glass fiber" in name_lower:
            modifiers.append("gf")

        if modifiers:
            filament_id = "_".join(modifiers) + "_" + type_lower
        else:
            filament_id = type_lower

        # Extract color by removing known parts from name
        color = name
        # Remove material type mentions and common prefixes
        remove_patterns = [
            material_type,
            type_lower,
            r"\baf\b",
            r"\bpro\b",
            r"\btough\b",
            r"\bsilk\b",
            r"\bmatte\b",
            r"\bhigh\s*speed\b",
            r"\bpla\+?\b",
            r"\bpetg\b",
            r"\babs\b",
            r"\basa\b",
            r"\btpu\b",
            r"\bpctg\b",
        ]
        for pattern in remove_patterns:
            color = re.sub(pattern, "", color, flags=re.IGNORECASE)

        color = color.strip(" ,-+")
        color_id = slugify(color) if color else "default"

        # Validate color_id: if it's not color-like, the non-color prefix
        # is likely a product-line qualifier that belongs in the filament_id.
        # E.g. "plus_black" -> filament gets "_plus", color becomes "black".
        if color_id != "default" and not is_color_like(color_id):
            parts = color_id.split("_")
            for i in range(1, len(parts)):
                candidate_color = "_".join(parts[i:])
                if is_color_like(candidate_color):
                    extra_prefix = "_".join(parts[:i])
                    filament_id = f"{filament_id}_{extra_prefix}"
                    color_id = candidate_color
                    break

        return (filament_id, color_id)

    def _extract_color_name(self, name: str, material_type: str, tags: list[str]) -> str:
        """Extract human-readable color name from material name."""
        # If comma-separated, take second part
        if ", " in name:
            parts = name.split(", ", 1)
            return parts[1].strip() if len(parts) > 1 else "Default"

        # Remove material type and common prefixes
        color = name
        remove_patterns = [
            material_type,
            r"\baf\b",
            r"\bpro\b",
            r"\btough\b",
            r"\bsilk\b",
            r"\bmatte\b",
            r"\bhigh\s*speed\b",
        ]
        for pattern in remove_patterns:
            color = re.sub(pattern, "", color, flags=re.IGNORECASE)

        color = color.strip(" ,-+")

        # If the extracted color contains product-line words, strip them
        # to return only the actual color portion as the display name.
        color_slug = slugify(color) if color else "default"
        if color_slug != "default" and not is_color_like(color_slug):
            parts = color_slug.split("_")
            for i in range(1, len(parts)):
                candidate = "_".join(parts[i:])
                if is_color_like(candidate):
                    color = clean_display_name(candidate)
                    break

        return color if color else "Default"

    def _extract_filament_name(self, name: str, material_type: str, tags: list[str]) -> str:
        """Extract human-readable filament name from material name."""
        # If comma-separated, take first part
        if ", " in name:
            return name.split(", ", 1)[0].strip()

        # Build from type + modifiers
        parts = [material_type]
        if "silk" in tags:
            parts.insert(0, "Silk")
        if "matte" in tags:
            parts.insert(0, "Matte")
        if "contains_carbon_fiber" in tags:
            parts.append("CF")
        if "contains_glass_fiber" in tags:
            parts.append("GF")

        return " ".join(parts)

    def _map_tags_to_traits(self, tags: list[str]) -> dict[str, bool]:
        """Convert OPT tags to internal traits dict."""
        traits: dict[str, bool] = {}
        for tag in tags:
            if tag in TAG_TO_TRAIT_MAP:
                traits[TAG_TO_TRAIT_MAP[tag]] = True
        return traits

    # ------------------------------------------------------------------
    # Naming cleanup pipeline
    # ------------------------------------------------------------------

    def _apply_naming_cleanup(
        self,
        brand_id: str,
        hierarchy: dict[str, dict[str, dict[str, dict]]],
    ) -> dict[str, dict[str, dict[str, dict]]]:
        """Apply all naming cleanup rules to the in-memory hierarchy."""
        # A. MOVE_RULES — move variants to correct filament dirs
        hierarchy = self._apply_move_rules(brand_id, hierarchy)

        # B. GENERIC_RENAME_RULES — strip cf_/gf_/silk_/glow_ prefixes
        hierarchy = self._apply_generic_renames(hierarchy)

        # C. Category 1: Swapped filament/variant layers
        hierarchy = self._apply_layer_swap_fix(hierarchy)

        # D. Categories 2/3: Brand-specific prefix stripping
        hierarchy = self._apply_prefix_rules(brand_id, hierarchy)

        # E. Category 7: Product line prefix/suffix reorganization
        hierarchy = self._apply_product_line_prefixes(brand_id, hierarchy)
        hierarchy = self._apply_product_line_suffixes(brand_id, hierarchy)

        # F. Suffix stripping (in-place)
        hierarchy = self._apply_suffix_strip_rules(brand_id, hierarchy)

        # G. Category 5: Color split from filament names
        hierarchy = self._apply_color_split(hierarchy)

        # H. Category 8: Universal common-prefix detection
        hierarchy = self._apply_common_prefix(brand_id, hierarchy)

        # H2. MOVE_RULES — second pass after structural transforms
        # Some rules target filament dirs created by PRODUCT_LINE_PREFIXES
        # or common-prefix extraction (e.g. panchroma_matte_pla, vulcan_pekk).
        hierarchy = self._apply_move_rules(brand_id, hierarchy)

        # I. Category 9: Display name fixes
        hierarchy = self._apply_display_name_fixes(hierarchy)

        # J. Categories 4 & 6: Report-only warnings
        self._emit_naming_warnings(brand_id, hierarchy)

        return hierarchy

    def _apply_move_rules(
        self,
        brand_id: str,
        hierarchy: dict[str, dict[str, dict[str, dict]]],
    ) -> dict[str, dict[str, dict[str, dict]]]:
        """Apply MOVE_RULES to relocate variants into correct filament dirs."""
        if brand_id not in MOVE_RULES:
            return hierarchy

        for material_type, filament_rules in MOVE_RULES[brand_id].items():
            if material_type not in hierarchy:
                continue
            filaments = hierarchy[material_type]

            for source_filament, rules in filament_rules.items():
                if source_filament not in filaments:
                    continue
                colors = filaments[source_filament]

                to_move: list[tuple[str, str, str, str, list[str]]] = []
                for color_id in sorted(colors.keys()):
                    for id_prefix, target_filament, target_display, name_prefixes in rules:
                        if color_id.startswith(id_prefix):
                            new_color_id = color_id[len(id_prefix):]
                            if new_color_id:
                                to_move.append((
                                    color_id, new_color_id,
                                    target_filament, target_display,
                                    name_prefixes,
                                ))
                            break

                for color_id, new_color_id, target_filament, target_display, name_prefixes in to_move:
                    entry = colors.pop(color_id)
                    entry["variant"]["id"] = new_color_id
                    old_name = entry["variant"].get("name", "")
                    entry["variant"]["name"] = strip_name_prefix(old_name, name_prefixes)

                    # Update filament data for the new target
                    new_filament_data = entry["filament"].copy()
                    new_filament_data["id"] = target_filament
                    new_filament_data["name"] = target_display
                    entry["filament"] = new_filament_data

                    if target_filament not in filaments:
                        filaments[target_filament] = {}
                    filaments[target_filament][new_color_id] = entry

                    self.report.naming_fixes.append(
                        f"move_rule: {brand_id}/{material_type}/"
                        f"{source_filament}/{color_id} -> "
                        f"{target_filament}/{new_color_id}"
                    )

                # Clean up empty source filament
                if source_filament in filaments and not filaments[source_filament]:
                    del filaments[source_filament]

        return hierarchy

    def _apply_generic_renames(
        self,
        hierarchy: dict[str, dict[str, dict[str, dict]]],
    ) -> dict[str, dict[str, dict[str, dict]]]:
        """Strip redundant cf_/gf_/silk_/glow_ prefixes from variant IDs."""
        for material_type, filaments in hierarchy.items():
            for filament_id, colors in filaments.items():
                for rule in GENERIC_RENAME_RULES:
                    if rule["subtype_contains"] not in filament_id:
                        continue

                    to_rename: list[tuple[str, str, list[str]]] = []
                    for color_id in sorted(colors.keys()):
                        for id_prefix in rule["id_prefixes"]:
                            if color_id.startswith(id_prefix):
                                new_id = color_id[len(id_prefix):]
                                if new_id and new_id not in colors:
                                    to_rename.append((
                                        color_id, new_id,
                                        rule["name_prefixes"],
                                    ))
                                break

                    for old_id, new_id, name_prefixes in to_rename:
                        entry = colors.pop(old_id)
                        entry["variant"]["id"] = new_id
                        old_name = entry["variant"].get("name", "")
                        entry["variant"]["name"] = strip_name_prefix(
                            old_name, name_prefixes
                        )
                        colors[new_id] = entry

        return hierarchy

    def _apply_layer_swap_fix(
        self,
        hierarchy: dict[str, dict[str, dict[str, dict]]],
    ) -> dict[str, dict[str, dict[str, dict]]]:
        """Fix swapped filament/variant layers (colors at filament level)."""
        for material_type, filaments in hierarchy.items():
            to_swap: list[tuple[str, str]] = []
            for filament_id in sorted(filaments.keys()):
                if not is_color_like(filament_id):
                    continue
                colors = filaments[filament_id]
                product_colors = [
                    cid for cid in colors if has_material_keyword(cid)
                ]
                if not product_colors:
                    continue
                for product_id in product_colors:
                    to_swap.append((filament_id, product_id))

            for color_name, product_name in to_swap:
                if color_name not in filaments:
                    continue
                if product_name not in filaments[color_name]:
                    continue

                entry = filaments[color_name].pop(product_name)

                # Update entry: product becomes filament, color becomes variant
                new_filament_data = entry["filament"].copy()
                new_filament_data["id"] = product_name
                new_filament_data["name"] = clean_display_name(product_name)
                entry["filament"] = new_filament_data
                entry["variant"]["id"] = color_name
                entry["variant"]["name"] = clean_display_name(color_name)

                if product_name not in filaments:
                    filaments[product_name] = {}
                filaments[product_name][color_name] = entry

                # Clean up empty source
                if not filaments[color_name]:
                    del filaments[color_name]

        return hierarchy

    def _apply_prefix_rules(
        self,
        brand_id: str,
        hierarchy: dict[str, dict[str, dict[str, dict]]],
    ) -> dict[str, dict[str, dict[str, dict]]]:
        """Strip brand-specific prefixes from variant IDs (Categories 2/3)."""
        if brand_id not in PREFIX_RULES:
            return hierarchy

        rules = PREFIX_RULES[brand_id]

        for material_type, filaments in hierarchy.items():
            for filament_id, colors in filaments.items():
                to_rename: list[tuple[str, str, dict]] = []
                existing = set(colors.keys())

                for color_id in sorted(colors.keys()):
                    for prefix, rule in rules.items():
                        if not color_id.startswith(prefix):
                            continue
                        new_id = color_id[len(prefix):]
                        if not new_id:
                            continue
                        if new_id in existing and new_id != color_id:
                            continue
                        to_rename.append((color_id, new_id, rule))
                        existing.discard(color_id)
                        existing.add(new_id)
                        break

                for old_id, new_id, rule in to_rename:
                    entry = colors.pop(old_id)
                    entry["variant"]["id"] = new_id
                    old_name = entry["variant"].get("name", "")
                    name_pattern = rule.get("name_pattern", "")
                    if name_pattern and old_name:
                        new_name = re.sub(name_pattern, "", old_name).strip()
                        new_name = re.sub(
                            r"^\s*[-\u2013\u2014]\s*", "", new_name
                        ).strip()
                        if new_name:
                            entry["variant"]["name"] = new_name
                        else:
                            entry["variant"]["name"] = clean_display_name(new_id)
                    else:
                        entry["variant"]["name"] = clean_display_name(new_id)
                    colors[new_id] = entry

        return hierarchy

    def _apply_product_line_prefixes(
        self,
        brand_id: str,
        hierarchy: dict[str, dict[str, dict[str, dict]]],
    ) -> dict[str, dict[str, dict[str, dict]]]:
        """Move variants with product-line prefixes into new filament dirs (Cat 7)."""
        if brand_id not in PRODUCT_LINE_PREFIXES:
            return hierarchy

        prefixes = PRODUCT_LINE_PREFIXES[brand_id]
        sku_pattern = PRODUCT_LINE_SKU_PATTERNS.get(brand_id)
        sku_re = re.compile(sku_pattern) if sku_pattern else None

        for material_type, filaments in hierarchy.items():
            for filament_id in list(filaments.keys()):
                colors = filaments[filament_id]
                to_move: list[tuple[str, str, str, str]] = []

                for color_id in sorted(colors.keys()):
                    for prefix in prefixes:
                        if not color_id.startswith(prefix):
                            continue
                        remainder = color_id[len(prefix):]
                        if sku_re:
                            m = sku_re.match(remainder)
                            if m:
                                remainder = remainder[m.end():]
                        if not remainder:
                            break
                        product_line = prefix.rstrip("_") or prefix
                        new_filament_id = f"{product_line}_{filament_id}"
                        to_move.append((
                            color_id, remainder,
                            new_filament_id, product_line,
                        ))
                        break

                for old_id, new_id, new_filament_id, product_line in to_move:
                    entry = colors.pop(old_id)

                    # Update filament data
                    new_filament_data = entry["filament"].copy()
                    source_name = new_filament_data.get(
                        "name", clean_display_name(filament_id)
                    )
                    new_filament_data["id"] = new_filament_id
                    new_filament_data["name"] = (
                        f"{clean_display_name(product_line)} {source_name}"
                    )
                    entry["filament"] = new_filament_data
                    entry["variant"]["id"] = new_id
                    entry["variant"]["name"] = clean_display_name(new_id)

                    if new_filament_id not in filaments:
                        filaments[new_filament_id] = {}
                    filaments[new_filament_id][new_id] = entry

                # Clean up empty source
                if filament_id in filaments and not filaments[filament_id]:
                    del filaments[filament_id]

        return hierarchy

    def _apply_product_line_suffixes(
        self,
        brand_id: str,
        hierarchy: dict[str, dict[str, dict[str, dict]]],
    ) -> dict[str, dict[str, dict[str, dict]]]:
        """Move variants with product-line suffixes into new filament dirs."""
        if brand_id not in PRODUCT_LINE_SUFFIXES:
            return hierarchy

        suffixes = PRODUCT_LINE_SUFFIXES[brand_id]

        for material_type, filaments in hierarchy.items():
            for filament_id in list(filaments.keys()):
                colors = filaments[filament_id]
                to_move: list[tuple[str, str, str, str]] = []

                for color_id in sorted(colors.keys()):
                    for suffix in suffixes:
                        if not color_id.endswith(suffix):
                            continue
                        remainder = color_id[: -len(suffix)]
                        if not remainder:
                            break
                        product_line = suffix.lstrip("_") or suffix
                        new_filament_id = f"{product_line}_{filament_id}"
                        to_move.append((
                            color_id, remainder,
                            new_filament_id, product_line,
                        ))
                        break

                for old_id, new_id, new_filament_id, product_line in to_move:
                    entry = colors.pop(old_id)

                    new_filament_data = entry["filament"].copy()
                    source_name = new_filament_data.get(
                        "name", clean_display_name(filament_id)
                    )
                    new_filament_data["id"] = new_filament_id
                    new_filament_data["name"] = (
                        f"{clean_display_name(product_line)} {source_name}"
                    )
                    entry["filament"] = new_filament_data
                    entry["variant"]["id"] = new_id
                    entry["variant"]["name"] = clean_display_name(new_id)

                    if new_filament_id not in filaments:
                        filaments[new_filament_id] = {}
                    filaments[new_filament_id][new_id] = entry

                if filament_id in filaments and not filaments[filament_id]:
                    del filaments[filament_id]

        return hierarchy

    def _apply_suffix_strip_rules(
        self,
        brand_id: str,
        hierarchy: dict[str, dict[str, dict[str, dict]]],
    ) -> dict[str, dict[str, dict[str, dict]]]:
        """Strip noise suffixes from variant names in-place."""
        if brand_id not in SUFFIX_STRIP_RULES:
            return hierarchy

        rules = SUFFIX_STRIP_RULES[brand_id]

        for material_type, filaments in hierarchy.items():
            for filament_id, colors in filaments.items():
                to_rename: list[tuple[str, str, dict]] = []
                existing = set(colors.keys())

                for color_id in sorted(colors.keys()):
                    for suffix, rule in rules.items():
                        if not color_id.endswith(suffix):
                            continue
                        new_id = color_id[: -len(suffix)]
                        if not new_id:
                            continue
                        if new_id in existing and new_id != color_id:
                            continue
                        to_rename.append((color_id, new_id, rule))
                        existing.discard(color_id)
                        existing.add(new_id)
                        break

                for old_id, new_id, rule in to_rename:
                    entry = colors.pop(old_id)
                    entry["variant"]["id"] = new_id
                    old_name = entry["variant"].get("name", "")
                    name_pattern = rule.get("name_pattern", "")
                    if name_pattern and old_name:
                        new_name = re.sub(name_pattern, "", old_name).strip()
                        if new_name:
                            entry["variant"]["name"] = new_name
                        else:
                            entry["variant"]["name"] = clean_display_name(new_id)
                    else:
                        entry["variant"]["name"] = clean_display_name(new_id)
                    colors[new_id] = entry

        return hierarchy

    def _apply_color_split(
        self,
        hierarchy: dict[str, dict[str, dict[str, dict]]],
    ) -> dict[str, dict[str, dict[str, dict]]]:
        """Split filament names containing both a product type and a color (Cat 5).

        E.g. hierarchy[PLA][silk_pla_red][default] -> hierarchy[PLA][silk_pla][red]
        """
        for material_type, filaments in hierarchy.items():
            to_split: list[tuple[str, str, str]] = []

            for filament_id in sorted(filaments.keys()):
                parts = filament_id.split("_")
                for i in range(1, min(3, len(parts))):
                    tail = "_".join(parts[-i:])
                    head = "_".join(parts[:-i])
                    if (
                        tail in KNOWN_COLORS
                        and head
                        and has_material_keyword(head)
                    ):
                        to_split.append((filament_id, head, tail))
                        break

            for old_filament_id, new_filament_id, color_name in to_split:
                if old_filament_id not in filaments:
                    continue
                entries = filaments.pop(old_filament_id)

                if new_filament_id not in filaments:
                    filaments[new_filament_id] = {}
                target = filaments[new_filament_id]

                for color_id, entry in entries.items():
                    # Update filament data
                    new_filament_data = entry["filament"].copy()
                    new_filament_data["id"] = new_filament_id
                    new_filament_data["name"] = id_to_display_name(
                        new_filament_id
                    )
                    entry["filament"] = new_filament_data

                    # Use the split-off color as the variant ID if current
                    # variant is "default" or same as old filament
                    if color_id == "default" or color_id == old_filament_id:
                        new_variant_id = color_name
                    else:
                        new_variant_id = color_id

                    entry["variant"]["id"] = new_variant_id
                    entry["variant"]["name"] = clean_display_name(
                        new_variant_id
                    )

                    if new_variant_id not in target:
                        target[new_variant_id] = entry

        return hierarchy

    def _apply_common_prefix(
        self,
        brand_id: str,
        hierarchy: dict[str, dict[str, dict[str, dict]]],
    ) -> dict[str, dict[str, dict[str, dict]]]:
        """Detect and fix common prefixes across all variants in a filament (Cat 8)."""
        for material_type, filaments in hierarchy.items():
            for filament_id in list(filaments.keys()):
                colors = filaments[filament_id]
                if len(colors) < 2:
                    continue

                variant_names = sorted(colors.keys())
                cp = compute_common_prefix(variant_names)
                if not cp or len(cp) < 3:
                    continue

                if not all(v.startswith(cp) for v in variant_names):
                    continue

                implied = prefix_implied_by_filament(cp, filament_id, brand_id)

                if implied:
                    # Strip in-place
                    to_rename: list[tuple[str, str]] = []
                    existing = set(colors.keys())
                    for old_id in sorted(colors.keys()):
                        new_id = old_id[len(cp):]
                        if not new_id:
                            continue
                        if new_id in existing and new_id != old_id:
                            continue
                        to_rename.append((old_id, new_id))
                        existing.discard(old_id)
                        existing.add(new_id)

                    for old_id, new_id in to_rename:
                        entry = colors.pop(old_id)
                        entry["variant"]["id"] = new_id
                        entry["variant"]["name"] = self._clean_variant_name(
                            entry["variant"].get("name", ""), cp, new_id
                        )
                        colors[new_id] = entry
                else:
                    # Structural move to new filament type
                    product_line = cp.rstrip("_")
                    new_filament_id = f"{product_line}_{filament_id}"

                    to_move: list[tuple[str, str]] = []
                    for old_id in sorted(colors.keys()):
                        new_id = old_id[len(cp):]
                        if not new_id:
                            continue
                        to_move.append((old_id, new_id))

                    if new_filament_id not in filaments:
                        filaments[new_filament_id] = {}

                    for old_id, new_id in to_move:
                        entry = colors.pop(old_id)
                        new_filament_data = entry["filament"].copy()
                        new_filament_data["id"] = new_filament_id
                        new_filament_data["name"] = id_to_display_name(
                            new_filament_id
                        )
                        entry["filament"] = new_filament_data
                        entry["variant"]["id"] = new_id
                        entry["variant"]["name"] = self._clean_variant_name(
                            entry["variant"].get("name", ""), cp, new_id
                        )
                        filaments[new_filament_id][new_id] = entry

                    # Clean up empty source
                    if not colors:
                        del filaments[filament_id]

        return hierarchy

    @staticmethod
    def _clean_variant_name(old_name: str, prefix: str, new_id: str) -> str:
        """Derive a clean display name for a variant after prefix stripping."""
        cleaned = re.sub(r"\(\s*\)", "", old_name).strip()

        # Build a regex from the prefix slug
        sep = r"[\s_+\-.*]*"
        parts = prefix.rstrip("_").split("_")
        pattern_str = r"^" + sep.join(re.escape(p) for p in parts) + sep
        cleaned = re.sub(pattern_str, "", cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()

        if cleaned:
            return cleaned
        return clean_display_name(new_id)

    def _apply_display_name_fixes(
        self,
        hierarchy: dict[str, dict[str, dict[str, dict]]],
    ) -> dict[str, dict[str, dict[str, dict]]]:
        """Fix broken display names: empty parens, double spaces, etc. (Cat 9)."""
        for material_type, filaments in hierarchy.items():
            for filament_id, colors in filaments.items():
                for color_id, entry in colors.items():
                    variant = entry.get("variant", {})
                    name = variant.get("name", "")
                    if not name:
                        continue

                    new_name = name
                    new_name = re.sub(r"\(\s*\)", "", new_name)
                    new_name = re.sub(r"\s{2,}", " ", new_name)
                    new_name = new_name.strip()

                    if not new_name:
                        new_name = clean_display_name(color_id)

                    # Strip leftover prefix content
                    expected = clean_display_name(color_id)
                    if (
                        new_name != expected
                        and new_name.lower().endswith(expected.lower())
                        and len(new_name) > len(expected) + 2
                    ):
                        new_name = expected

                    if new_name != name:
                        variant["name"] = new_name

        return hierarchy

    def _emit_naming_warnings(
        self,
        brand_id: str,
        hierarchy: dict[str, dict[str, dict[str, dict]]],
    ) -> None:
        """Emit report-only warnings for tech specs and long names (Cats 4 & 6)."""
        compiled_patterns = [re.compile(p) for p in TECH_SPEC_PATTERNS]

        for material_type, filaments in hierarchy.items():
            for filament_id, colors in filaments.items():
                for color_id in sorted(colors.keys()):
                    # Cat 4: Technical specs
                    for pattern in compiled_patterns:
                        if pattern.search(color_id):
                            self.report.tech_spec_warnings.append(
                                f"{brand_id}/{material_type}/"
                                f"{filament_id}/{color_id} "
                                f"(matched: {pattern.pattern})"
                            )
                            break

                    # Cat 6: Long names
                    if len(color_id) > MAX_VARIANT_LENGTH:
                        self.report.long_name_warnings.append(
                            f"{brand_id}/{material_type}/"
                            f"{filament_id}/{color_id} "
                            f"({len(color_id)} chars)"
                        )

    # ------------------------------------------------------------------
    # Duplicate detection
    # ------------------------------------------------------------------

    @staticmethod
    def _build_existing_index(
        brand_dir: Path,
    ) -> dict[str, dict[str, set[str]]]:
        """Build index of existing filament/variant structure on disk.

        Returns ``{material_type: {filament_id: {variant_id, ...}}}``.
        """
        index: dict[str, dict[str, set[str]]] = {}
        if not brand_dir.exists():
            return index

        for material_dir in brand_dir.iterdir():
            if not material_dir.is_dir() or material_dir.name.startswith("."):
                continue
            material_type = material_dir.name
            index[material_type] = {}

            for filament_dir in material_dir.iterdir():
                if not filament_dir.is_dir():
                    continue
                filament_id = filament_dir.name
                index[material_type][filament_id] = set()

                for variant_dir in filament_dir.iterdir():
                    if variant_dir.is_dir():
                        index[material_type][filament_id].add(variant_dir.name)

        return index

    @staticmethod
    def _check_for_duplicates(
        existing_index: dict[str, dict[str, set[str]]],
        hierarchy: dict[str, dict[str, dict[str, dict]]],
    ) -> list[tuple[str, str, str, str, str]]:
        """Check if any hierarchy entry duplicates existing on-disk data.

        Two checks are performed for each hierarchy entry at
        ``{material_type}/{filament_id}/{color_id}``:

        1. **Forward**: splitting *color_id* into ``prefix + remainder``
           yields an existing ``{filament_id}_{prefix}/{remainder}`` path.
           Catches: ``abs/plus_black`` duplicating ``abs_plus/black``.

        2. **Reverse**: the hierarchy *filament_id* is a longer form of an
           existing on-disk filament (``filament_id = base + "_" + suffix``),
           and ``suffix + "_" + color_id`` exists as a variant under that
           base filament.
           Catches: ``hips_x_bahama/yellow`` duplicating ``hips_x/bahama_yellow``.

        Returns list of
        ``(material_type, new_filament, new_color, existing_filament, existing_color)``.
        """
        duplicates: list[tuple[str, str, str, str, str]] = []
        seen: set[tuple[str, str, str]] = set()

        for material_type, filaments in hierarchy.items():
            # Merge on-disk index with in-hierarchy entries for forward check
            combined: dict[str, set[str]] = {}
            if material_type in existing_index:
                for fil_id, variants in existing_index[material_type].items():
                    combined[fil_id] = set(variants)
            for fil_id, colors in filaments.items():
                if fil_id not in combined:
                    combined[fil_id] = set()
                combined[fil_id].update(colors.keys())

            for filament_id, colors in filaments.items():
                for color_id in colors:
                    key = (material_type, filament_id, color_id)
                    if key in seen:
                        continue

                    # Forward check: split color_id into prefix + remainder
                    parts = color_id.split("_")
                    found = False
                    for i in range(1, len(parts)):
                        prefix = "_".join(parts[:i])
                        remainder = "_".join(parts[i:])
                        candidate_filament = f"{filament_id}_{prefix}"

                        if candidate_filament in combined and remainder in combined[candidate_filament]:
                            if candidate_filament != filament_id or remainder != color_id:
                                duplicates.append((
                                    material_type,
                                    filament_id, color_id,
                                    candidate_filament, remainder,
                                ))
                                seen.add(key)
                                found = True
                                break

                    if found:
                        continue

                    # Reverse check: hierarchy filament_id is an oversplit
                    # of an existing on-disk filament.  Only check disk data
                    # to avoid flagging the correct entry when both forms
                    # exist in the same hierarchy.
                    if material_type in existing_index:
                        for base_filament in existing_index[material_type]:
                            if base_filament == filament_id:
                                continue
                            if not filament_id.startswith(base_filament + "_"):
                                continue
                            suffix = filament_id[len(base_filament) + 1:]
                            reconstructed_color = f"{suffix}_{color_id}"
                            if reconstructed_color in existing_index[material_type][base_filament]:
                                duplicates.append((
                                    material_type,
                                    filament_id, color_id,
                                    base_filament, reconstructed_color,
                                ))
                                seen.add(key)
                                break

        return duplicates

    def _write_hierarchy(
        self,
        brand_dir: Path,
        hierarchy: dict[str, dict[str, dict[str, dict]]],
        dry_run: bool,
    ) -> None:
        """Write the material hierarchy to disk."""
        # Detect duplicates against existing data and within the hierarchy
        existing_index = self._build_existing_index(brand_dir)
        duplicates = self._check_for_duplicates(existing_index, hierarchy)

        skip_set: set[tuple[str, str, str]] = set()
        for mat_type, fil_id, color_id, exist_fil, exist_color in duplicates:
            skip_set.add((mat_type, fil_id, color_id))
            self.report.duplicate_skips.append(
                f"{brand_dir.name}/{mat_type}/{fil_id}/{color_id} "
                f"(duplicate of {exist_fil}/{exist_color})"
            )

        for material_type in sorted(hierarchy.keys()):
            filaments = hierarchy[material_type]
            material_dir = brand_dir / material_type

            if not dry_run:
                material_dir.mkdir(parents=True, exist_ok=True)

                # Write material.json
                material_json = material_dir / "material.json"
                if not material_json.exists() or not self.merge_mode:
                    self._save_json(material_json, {"material": material_type})

            for filament_id in sorted(filaments.keys()):
                colors = filaments[filament_id]
                filament_dir = material_dir / filament_id

                # Get filament data from first color (they share filament data)
                first_color_data = next(iter(colors.values()))
                filament_data = first_color_data.get("filament", {})

                if not dry_run:
                    filament_dir.mkdir(parents=True, exist_ok=True)

                    # Write filament.json
                    filament_json = filament_dir / "filament.json"
                    if self.merge_mode and filament_json.exists():
                        try:
                            with open(filament_json, encoding="utf-8") as f:
                                existing = json.load(f)
                            filament_data = self._merge_data(existing, filament_data)
                        except Exception:
                            pass
                    self._save_json(filament_json, filament_data)

                self.report.filaments_created += 1

                for color_id in sorted(colors.keys()):
                    if (material_type, filament_id, color_id) in skip_set:
                        continue
                    color_data = colors[color_id]
                    variant_dir = filament_dir / color_id
                    variant_data = color_data.get("variant", {})
                    sizes_data = color_data.get("sizes", [])

                    if not dry_run:
                        variant_dir.mkdir(parents=True, exist_ok=True)

                        # Write variant.json
                        variant_json = variant_dir / "variant.json"
                        if self.merge_mode and variant_json.exists():
                            try:
                                with open(variant_json, encoding="utf-8") as f:
                                    existing = json.load(f)
                                variant_data = self._merge_data(existing, variant_data)
                            except Exception:
                                pass
                        self._save_json(variant_json, variant_data)

                        # Write sizes.json
                        sizes_json = variant_dir / "sizes.json"
                        if self.merge_mode and sizes_json.exists():
                            try:
                                with open(sizes_json, encoding="utf-8") as f:
                                    existing_sizes = json.load(f)
                                if sizes_data:
                                    existing_keys = {
                                        (s.get("filament_weight"), s.get("diameter"))
                                        for s in existing_sizes
                                    }
                                    for size in sizes_data:
                                        key = (
                                            size.get("filament_weight"),
                                            size.get("diameter"),
                                        )
                                        if key not in existing_keys:
                                            existing_sizes.append(size)
                                sizes_data = existing_sizes
                            except Exception:
                                pass

                        # Create default size if no sizes data
                        if not sizes_data:
                            sizes_data = [{"filament_weight": 1000, "diameter": 1.75}]

                        self._save_json(sizes_json, sizes_data)
                        self.report.sizes_created += len(sizes_data)

                    self.report.variants_created += 1

    def _save_json(self, path: Path, data: Any) -> None:
        """Save data to JSON file with consistent formatting."""
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
