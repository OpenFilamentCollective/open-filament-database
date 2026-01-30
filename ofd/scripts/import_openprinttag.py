"""
Import OpenPrintTag Database Script.

This script imports filament data from the OpenPrintTag database repository
and maps it to the Open Filament Database format. It handles:

1. Downloading/updating the OpenPrintTag repo to a cache folder
2. Iterating through all YAML files (brands, materials, material-packages)
3. Mapping OPT data to OFD's JSON schema
4. Fetching missing brand logos via Brandfetch API
5. Generating detailed reports of missing data and icons

OpenPrintTag structure:
    data/brands/{brand-slug}.yaml
    data/materials/{brand-slug}/{material-slug}.yaml
    data/material-packages/{brand-slug}/{package-slug}.yaml
    data/material-containers/{container-slug}.yaml

OFD structure:
    data/{Brand Name}/brand.json
    data/{Brand Name}/{Material}/material.json
    data/{Brand Name}/{Material}/{Filament}/filament.json
    data/{Brand Name}/{Material}/{Filament}/{Variant}/variant.json
    data/{Brand Name}/{Material}/{Filament}/{Variant}/sizes.json
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import urlparse

from ofd.base import BaseScript, ScriptResult, register_script

# Try to import PIL for image processing
try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# Try to import yaml
try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False


# Valid material types in OFD
VALID_MATERIAL_TYPES = {
    "PLA", "PETG", "TPU", "ABS", "ASA", "PC", "PCTG", "PP", "PA6", "PA11",
    "PA12", "PA66", "CPE", "TPE", "HIPS", "PHA", "PET", "PEI", "PBT", "PVB",
    "PVA", "PEKK", "PEEK", "BVOH", "TPC", "PPS", "PPSU", "PVC", "PEBA",
    "PVDF", "PPA", "PCL", "PES", "PMMA", "POM", "PPE", "PS", "PSU", "TPI",
    "SBS", "OBC", "EVA"
}

# Mapping from OPT material types to OFD material types
MATERIAL_TYPE_MAP = {
    # Direct matches
    "PLA": "PLA", "PETG": "PETG", "ABS": "ABS", "ASA": "ASA", "TPU": "TPU",
    "PC": "PC", "PCTG": "PCTG", "PP": "PP", "HIPS": "HIPS", "PVA": "PVA",
    "PVB": "PVB", "PEEK": "PEEK", "PEKK": "PEKK", "PEI": "PEI", "CPE": "CPE",
    "TPE": "TPE", "TPC": "TPC", "PET": "PET", "PMMA": "PMMA", "POM": "POM",
    "BVOH": "BVOH", "PPS": "PPS", "PPSU": "PPSU", "PVDF": "PVDF", "PVC": "PVC",
    "PSU": "PSU", "PPE": "PPE", "PCL": "PCL", "PES": "PES", "TPI": "TPI",
    "PBT": "PBT", "PEBA": "PEBA",

    # PLA variants
    "PLA+": "PLA", "PLA-CF": "PLA", "PLA-GF": "PLA", "PLA Plus": "PLA",
    "PLA PLUS": "PLA", "PLA Pro": "PLA", "PLA-HT": "PLA", "PLA HT": "PLA",
    "Hyper PLA": "PLA", "FlexPLA": "PLA", "rPLA": "PLA", "RPLA": "PLA",
    "ecoPLA": "PLA", "easyPLA": "PLA", "BIOPLA": "PLA", "PRO PLA": "PLA",

    # PETG variants
    "PETG+": "PETG", "PETG-CF": "PETG", "PETG-GF": "PETG", "PETG HT": "PETG",
    "PRO PETG": "PETG", "easyPETG": "PETG", "nicePETG": "PETG",

    # ABS variants
    "ABS+": "ABS", "ABS-CF": "ABS", "ABS-GF": "ABS", "PRO ABS": "ABS",
    "easyABS": "ABS", "ecoABS": "ABS", "niceABS": "ABS", "Hyper ABS": "ABS",

    # ASA variants
    "ASA-CF": "ASA", "ASA-GF": "ASA", "niceASA": "ASA",

    # TPU variants
    "TPU-95A": "TPU", "TPU-98A": "TPU", "easyTPU": "TPU", "S-Flex": "TPU",

    # PC variants
    "PC-CF": "PC", "PC-GF": "PC", "PC-ABS": "PC",

    # PA/Nylon variants
    "PA": "PA6", "PA6": "PA6", "PA6-CF": "PA6", "PA6-GF": "PA6",
    "Nylon": "PA6", "PA-CF": "PA6", "PA-GF": "PA6", "PAHT-CF": "PA6",
    "PA HT": "PA6", "PA-NT NYLON": "PA6", "Easy Nylon": "PA6",
    "Carbon Fiber Nylon": "PA6", "CoexNylex": "PA6",
    "PA11": "PA11", "PA11-CF": "PA11",
    "PA12": "PA12", "PA12-CF": "PA12",
    "PA66": "PA66",

    # PP variants
    "PP-CF": "PP", "PP-GF": "PP",

    # PPS variants
    "PPS-CF": "PPS",

    # Support materials
    "BambuSupport": "PVA", "Support": "PVA", "PolySupport™": "PVA",
    "BreakawaySupport": "HIPS",

    # Filled/composite variants (map to base material, typically PLA)
    "Woodfill": "PLA", "Wood": "PLA", "FiberWood": "PLA", "BioWOOD": "PLA",
    "Metal": "PLA", "Marble": "PLA", "Carbon": "PLA",

    # Bio-based materials
    "niceBIO": "PLA", "nicebio": "PLA", "BIO": "PLA", "BioCREATE": "PLA",

    # Branded materials
    "nGen": "PETG", "XT": "PETG",
    "PolySmooth™": "PVB", "PolyCast™": "PVB",
    "Adura™": "PA6", "Adura™ X": "PA6",
    "DURABIO™": "PC",
}

# Mapping from OPT tags to OFD traits
TAG_TO_TRAIT_MAP = {
    'silk': 'silk',
    'matte': 'matte',
    'glitter': 'glitter',
    'glow_in_the_dark': 'glow',
    'carbon_fiber': 'contains_carbon_fiber',
    'glass_fiber': 'contains_glass_fiber',
    'wood': 'contains_wood',
    'metallic': 'contains_metal',
    'metal': 'contains_metal',
    'biodegradable': 'biodegradable',
    'recyclable': 'recyclable',
    'recycled': 'recycled',
    'bio_based': 'bio_based',
    'home_compostable': 'home_compostable',
    'industrially_compostable': 'industrially_compostable',
    'antibacterial': 'antibacterial',
    'conductive': 'conductive',
    'esd_safe': 'esd_safe',
    'transparent': 'transparent',
    'translucent': 'translucent',
    'coextruded': 'coextruded',
    'blend': 'blend',
    'pearlescent': 'pearlescent',
    'iridescent': 'iridescent',
    'neon': 'neon',
    'abrasive': 'abrasive',
    'foaming': 'foaming',
}


@dataclass
class ImportStats:
    """Statistics for the import process."""
    brands_processed: int = 0
    brands_created: int = 0
    brands_updated: int = 0
    materials_processed: int = 0
    materials_skipped: int = 0
    filaments_created: int = 0
    filaments_updated: int = 0
    variants_created: int = 0
    variants_updated: int = 0
    sizes_created: int = 0
    sizes_updated: int = 0
    logos_fetched: int = 0
    logos_failed: int = 0

    # Detailed tracking for reports
    failed_logos: List[Dict[str, str]] = field(default_factory=list)
    unmapped_materials: List[Dict[str, str]] = field(default_factory=list)
    skip_reasons: Dict[str, int] = field(default_factory=lambda: {
        'unmapped_type': 0,
        'not_fff': 0,
        'missing_brand': 0,
        'parsing_error': 0,
    })

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'brands_processed': self.brands_processed,
            'brands_created': self.brands_created,
            'brands_updated': self.brands_updated,
            'materials_processed': self.materials_processed,
            'materials_skipped': self.materials_skipped,
            'filaments_created': self.filaments_created,
            'filaments_updated': self.filaments_updated,
            'variants_created': self.variants_created,
            'variants_updated': self.variants_updated,
            'sizes_created': self.sizes_created,
            'sizes_updated': self.sizes_updated,
            'logos_fetched': self.logos_fetched,
            'logos_failed': self.logos_failed,
            'failed_logos': self.failed_logos,
            'unmapped_materials': self.unmapped_materials,
            'skip_reasons': self.skip_reasons,
        }


def load_dotenv(env_path: Path) -> None:
    """Load environment variables from .env file if it exists."""
    if env_path.exists():
        try:
            with open(env_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, _, value = line.partition('=')
                        key = key.strip()
                        value = value.strip()
                        # Remove surrounding quotes
                        if (value.startswith('"') and value.endswith('"')) or \
                           (value.startswith("'") and value.endswith("'")):
                            value = value[1:-1]
                        if key and key not in os.environ:
                            os.environ[key] = value
        except OSError:
            pass


def load_yaml(path: Path) -> Optional[Dict[str, Any]]:
    """Load YAML from file with error handling."""
    if not HAS_YAML:
        return None
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    except (yaml.YAMLError, OSError) as e:
        print(f"Error loading {path}: {e}")
        return None


def load_json(path: Path) -> Optional[Dict[str, Any]]:
    """Load JSON from file with error handling."""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def save_json(path: Path, data: Any, dry_run: bool = False) -> bool:
    """Save JSON to file with consistent formatting."""
    if dry_run:
        return True
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write('\n')
        return True
    except OSError as e:
        print(f"Error saving {path}: {e}")
        return False


def sanitize_name(name: str) -> str:
    """
    Convert a name to a sanitized ID/folder format.

    This creates a string that is valid for:
    - JSON schema IDs (alphanumeric + underscore)
    - Filesystem folder names (cross-platform safe)
    - OFD database structure

    Rules:
    - Lowercase only
    - Spaces and hyphens converted to underscores
    - Only alphanumeric and underscores allowed
    - Multiple underscores collapsed to single underscore
    - Leading/trailing underscores removed
    """
    sanitized = name.lower()
    # Convert spaces and hyphens to underscores
    sanitized = re.sub(r'[\s\-]+', '_', sanitized)
    # Remove all characters except alphanumeric and underscores
    # This includes +, /, \, :, *, ?, ", <, >, |, etc.
    sanitized = re.sub(r'[^a-z0-9_]', '', sanitized)
    # Collapse multiple underscores
    sanitized = re.sub(r'_+', '_', sanitized)
    # Remove leading/trailing underscores
    sanitized = sanitized.strip('_')
    return sanitized


def extract_domain(url: str) -> Optional[str]:
    """Extract domain from a URL."""
    if not url:
        return None
    try:
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        parsed = urlparse(url)
        domain = parsed.netloc or parsed.path.split('/')[0]
        if domain.startswith('www.'):
            domain = domain[4:]
        return domain if domain else None
    except Exception:
        return None


def merge_dict(base: Dict[str, Any], overlay: Dict[str, Any]) -> Dict[str, Any]:
    """Merge overlay dict into base dict, keeping existing values when not None."""
    result = base.copy()
    for key, value in overlay.items():
        if value is not None:
            if key not in result or result[key] is None:
                result[key] = value
    return result


@register_script
class ImportOpenPrintTagScript(BaseScript):
    """Import filament data from OpenPrintTag database."""

    name = "import-openprinttag"
    description = "Import filament data from OpenPrintTag database"

    OPT_REPO_URL = "https://github.com/OpenPrintTag/openprinttag-database.git"

    def __init__(self, project_root: Optional[Path] = None):
        super().__init__(project_root)
        self.cache_dir = self.project_root / ".cache" / "openprinttag"
        self.stats = ImportStats()
        self.containers: Dict[str, Dict[str, Any]] = {}
        self.opt_materials: Dict[str, Dict[str, Any]] = {}
        self.brandfetch_client_id: Optional[str] = None

    def configure_parser(self, parser: argparse.ArgumentParser) -> None:
        """Add script-specific arguments."""
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview changes without modifying files'
        )
        parser.add_argument(
            '--no-fetch',
            action='store_true',
            help='Skip fetching/updating the OPT repository (use cached version)'
        )
        parser.add_argument(
            '--brand',
            type=str,
            help='Only import a specific brand (by slug)'
        )
        parser.add_argument(
            '--clear-cache',
            action='store_true',
            help='Clear the cached OPT repository before fetching'
        )
        parser.add_argument(
            '--no-logos',
            action='store_true',
            help='Skip fetching logos from Brandfetch'
        )
        parser.add_argument(
            '--logo-size',
            type=int,
            default=400,
            help='Logo size in pixels (100-400, default: 400)'
        )
        parser.add_argument(
            '--report-file',
            type=Path,
            help='Path to save detailed JSON report (default: .cache/openprinttag/report.json)'
        )

    def _clone_or_update_repo(self) -> bool:
        """Clone or update the OpenPrintTag repository."""
        if self.cache_dir.exists():
            self.log("Updating OpenPrintTag repository...")
            try:
                result = subprocess.run(
                    ['git', 'pull', '--ff-only'],
                    cwd=self.cache_dir,
                    capture_output=True,
                    text=True,
                    timeout=120
                )
                if result.returncode != 0:
                    self.log(f"Warning: git pull failed: {result.stderr}")
                    shutil.rmtree(self.cache_dir)
                else:
                    return True
            except (subprocess.TimeoutExpired, FileNotFoundError) as e:
                self.log(f"Warning: Failed to update repo: {e}")
                return self.cache_dir.exists()

        self.log("Cloning OpenPrintTag repository...")
        self.cache_dir.parent.mkdir(parents=True, exist_ok=True)

        try:
            result = subprocess.run(
                ['git', 'clone', '--depth', '1', self.OPT_REPO_URL, str(self.cache_dir)],
                capture_output=True,
                text=True,
                timeout=300
            )
            if result.returncode != 0:
                self.log(f"Error: git clone failed: {result.stderr}")
                return False
            return True
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            self.log(f"Error: Failed to clone repo: {e}")
            return False

    def _load_containers(self) -> None:
        """Load all container definitions."""
        containers_dir = self.cache_dir / "data" / "material-containers"
        if not containers_dir.exists():
            return

        for container_file in containers_dir.glob("*.yaml"):
            data = load_yaml(container_file)
            if data and 'slug' in data:
                self.containers[data['slug']] = data

    def _map_material_type(self, opt_type: str, material_name: str) -> Optional[str]:
        """Map OPT material type to OFD material type."""
        if not opt_type or not opt_type.strip():
            opt_type = ""

        opt_type = opt_type.strip()

        # Direct lookup in VALID_MATERIAL_TYPES
        opt_type_upper = opt_type.upper()
        if opt_type_upper in VALID_MATERIAL_TYPES:
            return opt_type_upper

        # Try mapping dictionary
        mapped = MATERIAL_TYPE_MAP.get(opt_type, MATERIAL_TYPE_MAP.get(opt_type_upper))
        if mapped:
            return mapped

        # Try without suffix (e.g., "PLA-CF" -> "PLA")
        clean_type = re.sub(r'[+\-].*$', '', opt_type_upper)
        if clean_type in VALID_MATERIAL_TYPES:
            return clean_type

        # Pattern-based inference from material name
        if material_name:
            name_upper = material_name.upper()
            patterns = [
                (r'\bPETG\b', 'PETG'),
                (r'\bPLA\b', 'PLA'),
                (r'\bABS\b', 'ABS'),
                (r'\bASA\b', 'ASA'),
                (r'\bTPU\b', 'TPU'),
                (r'\bNYLON\b', 'PA6'),
                (r'\bPA[\s\-]?CF\b', 'PA6'),
                (r'\bPA[\s\-]?6\b', 'PA6'),
                (r'\bPA[\s\-]?11\b', 'PA11'),
                (r'\bPA[\s\-]?12\b', 'PA12'),
                (r'\bPC\b', 'PC'),
                (r'\bPEEK\b', 'PEEK'),
                (r'\bPEI\b', 'PEI'),
                (r'\bPVA\b', 'PVA'),
                (r'\bHIPS\b', 'HIPS'),
                (r'\bPP\b', 'PP'),
            ]

            for pattern, mat_type in patterns:
                if re.search(pattern, name_upper):
                    return mat_type

        return None

    def _map_traits(self, opt_tags: List[str]) -> Dict[str, bool]:
        """Map OPT tags to OFD traits."""
        traits = {}
        for tag in opt_tags:
            if tag in TAG_TO_TRAIT_MAP:
                trait_name = TAG_TO_TRAIT_MAP[tag]
                traits[trait_name] = True
        return traits

    def _fetch_brand_logo(
        self,
        brand_name: str,
        website: str,
        output_path: Path,
        size: int = 400,
        dry_run: bool = False
    ) -> Tuple[bool, str]:
        """
        Fetch brand logo from Brandfetch CDN.

        Returns:
            Tuple of (success: bool, reason: str)
        """
        if not HAS_PIL:
            return False, "PIL not available"

        if not self.brandfetch_client_id:
            return False, "No Brandfetch client ID"

        # Extract domain from website
        domain = extract_domain(website)
        if not domain:
            # Try deriving domain from brand name
            derived = re.sub(r'[^a-z0-9]', '', brand_name.lower())
            if derived:
                domain = f"{derived}.com"
            else:
                return False, "No domain found"

        # Clamp size to valid range
        size = max(100, min(400, size))

        # Build Brandfetch CDN URL
        url = f"https://cdn.brandfetch.io/domain/{domain}/w/{size}/h/{size}/fallback/404/icon.png?c={self.brandfetch_client_id}"

        try:
            req = urllib.request.Request(
                url,
                headers={'User-Agent': 'OFD-Import/1.0'}
            )

            with urllib.request.urlopen(req, timeout=30) as response:
                if response.status != 200:
                    return False, f"HTTP {response.status}"

                image_data = response.read()

                if len(image_data) < 100:
                    return False, "Empty response"

                if dry_run:
                    return True, "Success (dry-run)"

                # Load and process image
                img = Image.open(BytesIO(image_data))

                # Convert to RGBA if necessary
                if img.mode not in ('RGBA', 'RGB'):
                    img = img.convert('RGBA')

                # Ensure square dimensions
                width, height = img.size
                if width != height:
                    max_dim = max(width, height)
                    if img.mode == 'RGBA':
                        square = Image.new('RGBA', (max_dim, max_dim), (255, 255, 255, 0))
                    else:
                        square = Image.new('RGB', (max_dim, max_dim), (255, 255, 255))
                    offset = ((max_dim - width) // 2, (max_dim - height) // 2)
                    square.paste(img, offset)
                    img = square

                # Resize if needed
                if img.size[0] != size:
                    img = img.resize((size, size), Image.Resampling.LANCZOS)

                # Save as PNG
                output_path.parent.mkdir(parents=True, exist_ok=True)
                img.save(output_path, 'PNG', optimize=True)
                return True, "Success"

        except urllib.error.HTTPError as e:
            return False, f"HTTP {e.code}"
        except urllib.error.URLError as e:
            return False, f"Network error: {e.reason}"
        except Exception as e:
            return False, f"Error: {str(e)}"

    def _extract_color_hex(self, opt_material: Dict[str, Any]) -> Optional[str]:
        """Extract hex color from OPT material data."""
        primary_color = opt_material.get('primary_color', {})
        if isinstance(primary_color, dict):
            color_rgba = primary_color.get('color_rgba', '')
            if color_rgba:
                # Convert RGBA to hex (remove alpha channel)
                if color_rgba.startswith('#') and len(color_rgba) >= 7:
                    return color_rgba[:7].upper()
        return None

    def _extract_variant_name(self, slug: str, brand_slug: str, material_type: str) -> str:
        """Extract a readable variant name from a material slug."""
        name = slug

        # Remove brand prefix
        if name.startswith(brand_slug + '-'):
            name = name[len(brand_slug) + 1:]

        # Remove material type prefix/suffix
        material_lower = material_type.lower()
        name = re.sub(rf'^{material_lower}[_\-]?', '', name, flags=re.IGNORECASE)
        name = re.sub(rf'[_\-]?{material_lower}$', '', name, flags=re.IGNORECASE)

        # Convert to title case
        name = name.replace('-', ' ').replace('_', ' ')
        name = ' '.join(word.capitalize() for word in name.split())

        return name if name else "Standard"

    def _process_brand(
        self,
        brand_file: Path,
        dry_run: bool,
        fetch_logos: bool = True,
        logo_size: int = 400
    ) -> Optional[Dict[str, Any]]:
        """Process a single brand file and create OFD brand structure."""
        opt_brand = load_yaml(brand_file)
        if not opt_brand:
            return None

        brand_slug = opt_brand.get('slug', '')
        brand_name = opt_brand.get('name', brand_slug)

        if not brand_slug:
            return None

        self.stats.brands_processed += 1

        # Create brand ID and directory (must be identical)
        brand_id = sanitize_name(brand_slug)
        brand_dir = self.data_dir / brand_id

        # Map OPT brand to OFD brand structure
        countries = opt_brand.get('countries_of_origin', [])
        origin = countries[0] if countries else 'Unknown'
        website = opt_brand.get('website', '')

        ofd_brand = {
            "id": brand_id,
            "name": brand_name,
            "website": website,
            "logo": "logo.png",
            "origin": origin if len(origin) == 2 else 'Unknown'
        }

        # Check if brand already exists
        brand_json_path = brand_dir / "brand.json"
        logo_path = brand_dir / "logo.png"

        logo_exists = any(
            (brand_dir / f"logo.{ext}").exists()
            for ext in ('png', 'jpg', 'jpeg', 'svg', 'webp')
        )

        if brand_json_path.exists():
            existing = load_json(brand_json_path)
            if existing:
                ofd_brand = merge_dict(ofd_brand, existing)
                self.stats.brands_updated += 1
            else:
                self.stats.brands_created += 1
        else:
            self.stats.brands_created += 1

        # Save brand.json
        if not dry_run:
            brand_dir.mkdir(parents=True, exist_ok=True)
            save_json(brand_json_path, ofd_brand, dry_run)

        # Fetch logo if needed
        if fetch_logos and not logo_exists:
            success, reason = self._fetch_brand_logo(
                brand_name, website, logo_path, logo_size, dry_run
            )
            if success:
                self.stats.logos_fetched += 1
                self.log(f"  ✓ Logo fetched for {brand_name}")
            else:
                self.stats.logos_failed += 1
                self.stats.failed_logos.append({
                    'brand': brand_name,
                    'website': website,
                    'attempted_domain': extract_domain(website) or 'unknown',
                    'reason': reason
                })
                self.log(f"  ✗ Failed to fetch logo for {brand_name}: {reason}")

        return {
            'slug': brand_slug,
            'folder': brand_id,  # folder and ID are identical
            'dir': brand_dir,
            'data': ofd_brand
        }

    def _process_material(
        self,
        material_file: Path,
        brand_info: Dict[str, Any],
        dry_run: bool
    ) -> None:
        """Process a single material file and create OFD filament/variant structure."""
        opt_material = load_yaml(material_file)
        if not opt_material:
            self.stats.skip_reasons['parsing_error'] += 1
            return

        material_slug = opt_material.get('slug', '')
        if not material_slug:
            self.stats.skip_reasons['parsing_error'] += 1
            return

        # Store for package lookup
        self.opt_materials[material_slug] = opt_material

        self.stats.materials_processed += 1

        # Only process FFF materials (filaments)
        material_class = opt_material.get('class', 'FFF')
        if material_class != 'FFF':
            self.stats.materials_skipped += 1
            self.stats.skip_reasons['not_fff'] += 1
            return

        # Map material type
        opt_type = opt_material.get('type', opt_material.get('abbreviation', ''))
        material_name = opt_material.get('name', material_slug)
        ofd_material_type = self._map_material_type(opt_type, material_name)

        if not ofd_material_type:
            self.stats.materials_skipped += 1
            self.stats.skip_reasons['unmapped_type'] += 1
            self.stats.unmapped_materials.append({
                'material_name': material_name,
                'opt_type': opt_type,
                'brand': brand_info['slug'],
                'slug': material_slug
            })
            return

        brand_dir = brand_info['dir']
        brand_slug = brand_info['slug']

        # Create material directory
        material_dir = brand_dir / ofd_material_type

        # Create/update material.json (optional in OFD)
        material_json_path = material_dir / "material.json"
        if not material_json_path.exists():
            ofd_material = {"material": ofd_material_type}
            if not dry_run:
                material_dir.mkdir(parents=True, exist_ok=True)
                save_json(material_json_path, ofd_material, dry_run)

        # Create filament ID and directory (must be identical)
        filament_id = sanitize_name(material_name)
        if not filament_id:
            filament_id = sanitize_name(material_slug)

        filament_dir = material_dir / filament_id

        # Build filament.json
        properties = opt_material.get('properties', {})

        ofd_filament = {
            "id": filament_id,
            "name": material_name,
            "density": properties.get('density', 1.24),
            "diameter_tolerance": properties.get('diameter_tolerance', 0.02)
        }

        # Add optional properties
        if 'hardness_shore_d' in properties:
            ofd_filament['shore_hardness_d'] = properties['hardness_shore_d']
        if 'hardness_shore_a' in properties:
            ofd_filament['shore_hardness_a'] = properties['hardness_shore_a']
        if 'min_print_temperature' in properties:
            ofd_filament['min_print_temperature'] = properties['min_print_temperature']
        if 'max_print_temperature' in properties:
            ofd_filament['max_print_temperature'] = properties['max_print_temperature']
        if 'preheat_temperature' in properties:
            ofd_filament['preheat_temperature'] = properties['preheat_temperature']
        if 'min_bed_temperature' in properties:
            ofd_filament['min_bed_temperature'] = properties['min_bed_temperature']
        if 'max_bed_temperature' in properties:
            ofd_filament['max_bed_temperature'] = properties['max_bed_temperature']
        if 'chamber_temperature' in properties:
            ofd_filament['chamber_temperature'] = properties['chamber_temperature']
        if 'min_chamber_temperature' in properties:
            ofd_filament['min_chamber_temperature'] = properties['min_chamber_temperature']
        if 'max_chamber_temperature' in properties:
            ofd_filament['max_chamber_temperature'] = properties['max_chamber_temperature']

        # Check for existing filament.json and merge
        filament_json_path = filament_dir / "filament.json"
        if filament_json_path.exists():
            existing = load_json(filament_json_path)
            if existing:
                ofd_filament = merge_dict(ofd_filament, existing)
                self.stats.filaments_updated += 1
            else:
                self.stats.filaments_created += 1
        else:
            self.stats.filaments_created += 1

        if not dry_run:
            filament_dir.mkdir(parents=True, exist_ok=True)
            save_json(filament_json_path, ofd_filament, dry_run)

        # Create variant ID and directory (must be identical)
        color_hex = self._extract_color_hex(opt_material)
        variant_name = self._extract_variant_name(material_slug, brand_slug, ofd_material_type)
        variant_id = sanitize_name(variant_name)
        if not variant_id:
            variant_id = "standard"

        variant_dir = filament_dir / variant_id

        ofd_variant = {
            "id": variant_id,
            "name": variant_name,
            "color_hex": color_hex or "#000000"
        }

        # Map traits from tags
        opt_tags = opt_material.get('tags', [])
        if opt_tags:
            traits = self._map_traits(opt_tags)
            if traits:
                ofd_variant['traits'] = traits

        # Check for existing variant.json and merge
        variant_json_path = variant_dir / "variant.json"
        if variant_json_path.exists():
            existing = load_json(variant_json_path)
            if existing:
                ofd_variant = merge_dict(ofd_variant, existing)
                self.stats.variants_updated += 1
            else:
                self.stats.variants_created += 1
        else:
            self.stats.variants_created += 1

        if not dry_run:
            variant_dir.mkdir(parents=True, exist_ok=True)
            save_json(variant_json_path, ofd_variant, dry_run)

        # Create default sizes.json if it doesn't exist
        sizes_json_path = variant_dir / "sizes.json"
        if not sizes_json_path.exists() and not dry_run:
            default_sizes = [{
                "filament_weight": 1000,
                "diameter": 1.75
            }]
            save_json(sizes_json_path, default_sizes, dry_run)
            self.stats.sizes_created += 1

        # Store variant directory for package processing
        opt_material['_ofd_variant_dir'] = str(variant_dir)

    def _process_package(
        self,
        package_file: Path,
        brand_info: Dict[str, Any],
        dry_run: bool
    ) -> None:
        """Process a material package file to create/update sizes.json."""
        opt_package = load_yaml(package_file)
        if not opt_package:
            return

        # Get the associated material
        material_ref = opt_package.get('material', {})
        material_slug = material_ref.get('slug') if isinstance(material_ref, dict) else None

        if not material_slug or material_slug not in self.opt_materials:
            return

        opt_material = self.opt_materials[material_slug]
        variant_dir_str = opt_material.get('_ofd_variant_dir')
        if not variant_dir_str:
            return

        variant_dir = Path(variant_dir_str)
        sizes_json_path = variant_dir / "sizes.json"

        # Extract size information
        filament_weight = opt_package.get('nominal_netto_full_weight')
        if filament_weight is None:
            return

        filament_diameter = opt_package.get('filament_diameter')
        if filament_diameter:
            # OPT uses micrometers, OFD uses mm
            filament_diameter = filament_diameter / 1000.0

        gtin = opt_package.get('gtin')

        # Build size entry
        size_entry: Dict[str, Any] = {
            "filament_weight": int(filament_weight),
            "diameter": filament_diameter or 1.75
        }

        if gtin:
            size_entry["gtin"] = str(gtin)

        # Get container specs if available
        container_ref = opt_package.get('container', {})
        container_slug = container_ref.get('slug') if isinstance(container_ref, dict) else None

        if container_slug and container_slug in self.containers:
            container = self.containers[container_slug]
            if 'empty_weight' in container:
                size_entry['empty_spool_weight'] = container['empty_weight']

        # Load existing sizes or create new list
        if sizes_json_path.exists():
            existing_sizes = load_json(sizes_json_path)
            if not isinstance(existing_sizes, list):
                existing_sizes = []

            # Check if this size already exists (by weight and diameter)
            found = False
            for i, existing in enumerate(existing_sizes):
                if (existing.get('filament_weight') == size_entry['filament_weight'] and
                        abs(existing.get('diameter', 1.75) - size_entry['diameter']) < 0.01):
                    # Merge
                    existing_sizes[i] = merge_dict(size_entry, existing)
                    found = True
                    self.stats.sizes_updated += 1
                    break

            if not found:
                existing_sizes.append(size_entry)
                self.stats.sizes_created += 1

            sizes = existing_sizes
        else:
            sizes = [size_entry]
            self.stats.sizes_created += 1

        if not dry_run:
            save_json(sizes_json_path, sizes, dry_run)

    def _generate_report(self, report_path: Path, dry_run: bool) -> None:
        """Generate detailed JSON and markdown reports."""
        if dry_run:
            return

        report_data = {
            'timestamp': datetime.now().isoformat(),
            'summary': self.stats.to_dict(),
        }

        # Save JSON report
        report_path.parent.mkdir(parents=True, exist_ok=True)
        save_json(report_path, report_data, dry_run)

        # Generate markdown summary
        md_path = report_path.with_suffix('.md')
        with open(md_path, 'w', encoding='utf-8') as f:
            f.write(f"# OpenPrintTag Import Report\n")
            f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")

            f.write("## Summary\n")
            f.write(f"- ✅ Brands processed: {self.stats.brands_processed}\n")
            f.write(f"- ✅ Brands created: {self.stats.brands_created}\n")
            f.write(f"- ✅ Brands updated: {self.stats.brands_updated}\n")
            f.write(f"- ✅ Materials processed: {self.stats.materials_processed}\n")
            f.write(f"- ✅ Filaments created: {self.stats.filaments_created}\n")
            f.write(f"- ✅ Variants created: {self.stats.variants_created}\n")
            f.write(f"- ✅ Sizes created: {self.stats.sizes_created}\n")
            f.write(f"- ✅ Logos fetched: {self.stats.logos_fetched}\n")
            f.write(f"- ⚠️  Logos failed: {self.stats.logos_failed}\n")
            f.write(f"- ❌ Materials skipped: {self.stats.materials_skipped}\n\n")

            if self.stats.failed_logos:
                f.write(f"## Missing Logos ({len(self.stats.failed_logos)} brands)\n\n")
                f.write("These brands need logos manually sourced:\n\n")
                for i, logo in enumerate(self.stats.failed_logos[:20], 1):
                    f.write(f"{i}. **{logo['brand']}** - Domain: {logo['attempted_domain']} - {logo['reason']}\n")
                if len(self.stats.failed_logos) > 20:
                    f.write(f"\n...and {len(self.stats.failed_logos) - 20} more\n")
                f.write("\n")

            if self.stats.unmapped_materials:
                f.write(f"## Unmapped Material Types ({len(self.stats.unmapped_materials)} materials)\n\n")
                f.write("Add these mappings to MATERIAL_TYPE_MAP:\n\n")
                # Group by opt_type
                type_counts: Dict[str, List[str]] = {}
                for mat in self.stats.unmapped_materials:
                    opt_type = mat['opt_type']
                    if opt_type not in type_counts:
                        type_counts[opt_type] = []
                    type_counts[opt_type].append(mat['brand'])

                for opt_type, brands in sorted(type_counts.items(), key=lambda x: len(x[1]), reverse=True)[:20]:
                    f.write(f"- **{opt_type}** ({len(brands)} occurrences): {', '.join(set(brands[:5]))}\n")
                if len(type_counts) > 20:
                    f.write(f"\n...and {len(type_counts) - 20} more types\n")
                f.write("\n")

            f.write("## Skip Reasons\n")
            for reason, count in self.stats.skip_reasons.items():
                if count > 0:
                    f.write(f"- {reason}: {count}\n")

        self.log(f"\nReports saved to:\n  - {report_path}\n  - {md_path}")

    def run(self, args: argparse.Namespace) -> ScriptResult:
        """Execute the import script."""
        # Load .env file
        load_dotenv(self.project_root / ".env")

        dry_run = getattr(args, 'dry_run', False)
        no_fetch = getattr(args, 'no_fetch', False)
        target_brand = getattr(args, 'brand', None)
        clear_cache = getattr(args, 'clear_cache', False)
        no_logos = getattr(args, 'no_logos', False)
        logo_size = getattr(args, 'logo_size', 400)
        report_file = getattr(args, 'report_file', None)

        if report_file is None:
            report_file = self.cache_dir / "report.json"

        # Get Brandfetch client ID from environment
        self.brandfetch_client_id = os.environ.get('BRANDFETCH_CLIENT_ID')

        # Check for yaml module
        if not HAS_YAML:
            return ScriptResult(
                success=False,
                message="PyYAML is required. Install with: pip install pyyaml"
            )

        if dry_run:
            self.log("DRY RUN - no files will be modified\n")

        # Check for logo fetching capability
        fetch_logos = not no_logos and self.brandfetch_client_id is not None
        if not no_logos and not self.brandfetch_client_id:
            self.log("Note: No Brandfetch client ID in .env. Logos will not be fetched.")
            self.log("  Set BRANDFETCH_CLIENT_ID in .env to enable.\n")
        elif fetch_logos:
            if not HAS_PIL:
                self.log("Warning: Pillow required for logo processing. Install with: pip install Pillow")
                self.log("  Logo fetching disabled.\n")
                fetch_logos = False
            else:
                self.log(f"Logo fetching enabled (size: {logo_size}px)\n")

        # Clear cache if requested
        if clear_cache and self.cache_dir.exists():
            self.log("Clearing cache...")
            shutil.rmtree(self.cache_dir)

        # Clone or update repo
        if not no_fetch:
            self.emit_progress('fetch', 0, 'Fetching OpenPrintTag repository...')
            if not self._clone_or_update_repo():
                return ScriptResult(
                    success=False,
                    message="Failed to fetch OpenPrintTag repository"
                )
            self.emit_progress('fetch', 100, 'Repository fetched')

        if not self.cache_dir.exists():
            return ScriptResult(
                success=False,
                message=f"Cache directory not found: {self.cache_dir}"
            )

        opt_data_dir = self.cache_dir / "data"
        if not opt_data_dir.exists():
            return ScriptResult(
                success=False,
                message=f"OPT data directory not found: {opt_data_dir}"
            )

        # Load container specs
        self.emit_progress('containers', 0, 'Loading container specs...')
        self._load_containers()
        self.log(f"Loaded {len(self.containers)} container specs")
        self.emit_progress('containers', 100, f'Loaded {len(self.containers)} containers')

        # Process brands
        brands_dir = opt_data_dir / "brands"
        brand_infos: Dict[str, Dict[str, Any]] = {}

        if brands_dir.exists():
            self.emit_progress('brands', 0, 'Processing brands...')
            brand_files = list(brands_dir.glob("*.yaml"))
            total = len(brand_files)

            for i, brand_file in enumerate(brand_files):
                brand_slug = brand_file.stem

                if target_brand and brand_slug != target_brand:
                    continue

                self.log(f"Processing brand: {brand_slug}")
                brand_info = self._process_brand(
                    brand_file,
                    dry_run,
                    fetch_logos=fetch_logos,
                    logo_size=logo_size
                )
                if brand_info:
                    brand_infos[brand_slug] = brand_info

                percent = int((i + 1) / total * 100)
                self.emit_progress('brands', percent, f'Processed {i + 1}/{total} brands')

        # Process materials
        materials_dir = opt_data_dir / "materials"

        if materials_dir.exists():
            self.emit_progress('materials', 0, 'Processing materials...')
            material_files = list(materials_dir.rglob("*.yaml"))
            total = len(material_files)

            for i, material_file in enumerate(material_files):
                # Get brand from parent directory
                brand_slug = material_file.parent.name
                if brand_slug == "materials":
                    # File directly in materials dir, get slug from content
                    opt_mat = load_yaml(material_file)
                    if opt_mat:
                        brand_ref = opt_mat.get('brand', {})
                        brand_slug = brand_ref.get('slug') if isinstance(brand_ref, dict) else None

                if not brand_slug:
                    continue

                if target_brand and brand_slug != target_brand:
                    continue

                # Ensure brand exists
                if brand_slug not in brand_infos:
                    brand_id = sanitize_name(brand_slug)
                    brand_dir = self.data_dir / brand_id
                    brand_infos[brand_slug] = {
                        'slug': brand_slug,
                        'folder': brand_id,  # folder and ID are identical
                        'dir': brand_dir,
                        'data': {}
                    }

                self._process_material(material_file, brand_infos[brand_slug], dry_run)

                percent = int((i + 1) / total * 100)
                self.emit_progress('materials', percent, f'Processed {i + 1}/{total} materials')

        # Process packages (sizes)
        packages_dir = opt_data_dir / "material-packages"

        if packages_dir.exists():
            self.emit_progress('packages', 0, 'Processing packages...')
            package_files = list(packages_dir.rglob("*.yaml"))
            total = len(package_files) if package_files else 1

            for i, package_file in enumerate(package_files):
                brand_slug = package_file.parent.name
                if brand_slug == "material-packages":
                    continue

                if target_brand and brand_slug != target_brand:
                    continue

                if brand_slug not in brand_infos:
                    continue

                self._process_package(package_file, brand_infos[brand_slug], dry_run)

                percent = int((i + 1) / total * 100)
                self.emit_progress('packages', percent, f'Processed {i + 1}/{total} packages')

        # Generate reports
        self.emit_progress('report', 0, 'Generating reports...')
        self._generate_report(report_file, dry_run)
        self.emit_progress('report', 100, 'Reports generated')

        # Print summary
        self.log("\n" + "=" * 50)
        self.log("Import Summary")
        self.log("=" * 50)
        self.log(f"Brands processed:    {self.stats.brands_processed}")
        self.log(f"Brands created:      {self.stats.brands_created}")
        self.log(f"Brands updated:      {self.stats.brands_updated}")
        self.log(f"Materials processed: {self.stats.materials_processed}")
        self.log(f"Materials skipped:   {self.stats.materials_skipped}")
        self.log(f"Filaments created:   {self.stats.filaments_created}")
        self.log(f"Filaments updated:   {self.stats.filaments_updated}")
        self.log(f"Variants created:    {self.stats.variants_created}")
        self.log(f"Variants updated:    {self.stats.variants_updated}")
        self.log(f"Sizes created:       {self.stats.sizes_created}")
        self.log(f"Sizes updated:       {self.stats.sizes_updated}")
        if fetch_logos:
            self.log(f"Logos fetched:       {self.stats.logos_fetched}")
            self.log(f"Logos failed:        {self.stats.logos_failed}")

        return ScriptResult(
            success=True,
            message=f"Imported {self.stats.filaments_created} filaments, "
                    f"{self.stats.variants_created} variants, "
                    f"{self.stats.sizes_created} sizes",
            data=self.stats.to_dict()
        )
