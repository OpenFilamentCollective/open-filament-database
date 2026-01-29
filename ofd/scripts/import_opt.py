"""
Import OpenPrintTag Database Script.

This script imports data from the OpenPrintTag database repository and maps it
to the Open Filament Database format. It handles:

1. Downloading/updating the OpenPrintTag repo to a cache folder
2. Iterating through all YAML files (brands, materials, material-packages)
3. Mapping data to OFD's JSON format
4. Merging with existing data when duplicates arise

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
import tempfile
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Set
from urllib.parse import urlparse

from ofd.base import BaseScript, ScriptResult, register_script


def load_dotenv(project_root: Path) -> None:
    """Load environment variables from .env file if it exists."""
    env_file = project_root / ".env"
    if env_file.exists():
        try:
            with open(env_file, 'r', encoding='utf-8') as f:
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


# Try to import PIL for image processing
try:
    from PIL import Image
except ImportError:
    Image = None

# Try to import yaml, provide helpful error if missing
try:
    import yaml
except ImportError:
    yaml = None


@dataclass
class ImportStats:
    """Statistics for the import process."""
    brands_processed: int = 0
    brands_created: int = 0
    brands_updated: int = 0
    materials_processed: int = 0
    filaments_created: int = 0
    filaments_updated: int = 0
    variants_created: int = 0
    variants_updated: int = 0
    sizes_created: int = 0
    sizes_updated: int = 0
    logos_fetched: int = 0
    logos_failed: int = 0
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'brands_processed': self.brands_processed,
            'brands_created': self.brands_created,
            'brands_updated': self.brands_updated,
            'materials_processed': self.materials_processed,
            'filaments_created': self.filaments_created,
            'filaments_updated': self.filaments_updated,
            'variants_created': self.variants_created,
            'variants_updated': self.variants_updated,
            'sizes_created': self.sizes_created,
            'sizes_updated': self.sizes_updated,
            'logos_fetched': self.logos_fetched,
            'logos_failed': self.logos_failed,
            'errors': self.errors
        }


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
    "PLA": "PLA",
    "PLA+": "PLA",
    "PLA-CF": "PLA",
    "PETG": "PETG",
    "PETG-CF": "PETG",
    "ABS": "ABS",
    "ABS+": "ABS",
    "ABS-CF": "ABS",
    "ASA": "ASA",
    "ASA-CF": "ASA",
    "TPU": "TPU",
    "TPU-95A": "TPU",
    "PC": "PC",
    "PC-CF": "PC",
    "PA": "PA6",
    "PA6": "PA6",
    "PA6-CF": "PA6",
    "PA11": "PA11",
    "PA11-CF": "PA11",
    "PA12": "PA12",
    "PA12-CF": "PA12",
    "Nylon": "PA6",
    "HIPS": "HIPS",
    "PVA": "PVA",
    "PVB": "PVB",
    "PP": "PP",
    "PP-CF": "PP",
    "PP-GF": "PP",
    "PEEK": "PEEK",
    "PEKK": "PEKK",
    "PEI": "PEI",
    "CPE": "CPE",
    "TPE": "TPE",
    "TPC": "TPC",
    "PET": "PET",
    "PCTG": "PCTG",
    "PMMA": "PMMA",
    "POM": "POM",
    # Composite/filled variants (map to base material)
    "Woodfill": "PLA",
    "Wood": "PLA",
    "Metal": "PLA",
    "Marble": "PLA",
    "Glow": "PLA",
    "Silk": "PLA",
    "Matte": "PLA",
    # rPLA variants
    "rPLA": "PLA",
    "RPLA": "PLA",
    # Bio-based materials (typically PLA derivatives)
    "niceBIO": "PLA",
    "nicebio": "PLA",
    "BIO": "PLA",
    "ecoPLA": "PLA",
    "easyPLA": "PLA",
    "BIOPLA": "PLA",
    # Other branded/proprietary material names
    "easyABS": "ABS",
    "easyPETG": "PETG",
    "easyTPU": "TPU",
    "ecoABS": "ABS",
    "niceASA": "ASA",
    "niceABS": "ABS",
    "nicePETG": "PETG",
    "PRO PLA": "PLA",
    "PRO PETG": "PETG",
    "PRO ABS": "ABS",
    "PETG+": "PETG",
    "Carbon": "PLA",
    # Technical materials
    "PLA-HT": "PLA",
    "PLA HT": "PLA",
    "PETG HT": "PETG",
    # Support materials (map to PVA or HIPS as closest match)
    "BambuSupport": "PVA",
    "Support": "PVA",
    "BreakawaySupport": "HIPS",
    "PolySupport™": "PVA",
    "PROTEOS HT": "PVA",
    # PA/Nylon variants
    "PA-CF": "PA6",
    "PAHT-CF": "PA6",
    "PPA-CF": "PPA",
    "PPA": "PPA",
    "PA": "PA6",
    "PA HT": "PA6",
    "PA CF": "PA6",
    "PA-CF15": "PA6",
    "PA-NT NYLON": "PA6",
    "PA-GF20-FR NYLON": "PA6",
    "PAJet 160 Nylon": "PA6",
    "Easy Nylon": "PA6",
    "Carbon Fiber Nylon": "PA6",
    "CoexNylex": "PA6",
    # Additional materials
    "PPS": "PPS",
    "PPS-CF": "PPS",
    "PPSU": "PPSU",
    "PVDF": "PVDF",
    "PVC": "PVC",
    "PSU": "PSU",
    "PPE": "PPE",
    "POM": "POM",
    "PCL": "PCL",
    "PES": "PES",
    "PMMA": "PMMA",
    "TPI": "TPI",
    "PBT": "PBT",
    "BVOH": "BVOH",
    "PEBA": "PEBA",
    # Branded/proprietary PLA variants
    "PLA Plus": "PLA",
    "PLA PLUS": "PLA",
    "PLA Pro": "PLA",
    "PLA Plus ProSpeed": "PLA",
    "Hyper PLA": "PLA",
    "FlexPLA": "PLA",
    "FiberWood": "PLA",
    "BioWOOD": "PLA",
    "BioCREATE": "PLA",
    "GreenyPro": "PLA",
    "PolySmooth™": "PVB",
    "PolyCast™": "PVB",
    # Branded/proprietary ABS variants
    "Hyper ABS": "ABS",
    # Branded flexible materials
    "S-Flex": "TPU",
    "FleX-920": "TPU",
    # ColorFabb nGen (modified PETG/copolyester)
    "nGen": "PETG",
    "nGen ": "PETG",
    "XT": "PETG",
    # Add:North Adura (engineering nylon copolymer)
    "Adura™": "PA6",
    "Adura™ X": "PA6",
    # Mitsubishi DURABIO (bio-based PC alternative)
    "DURABIO™": "PC",
    "DURABIO™ ": "PC",
    # 3DXTech high-temp materials
    "ThermaX HTS1": "PEI",
    "THERMAX HTS2": "PEI",
    "THERMAX MTS1": "PEEK",
    "SimuBone": "PLA",
    "CLEAN": "PLA",
    # IGUS industrial materials (tribologically optimized PA/POM)
    "iglide® i180-PF": "PA6",
    "iglide® i150-PF": "PA6",
    "iglide® i190-PF": "PA6",
    "iglide® i151-PF": "PA6",
    "iglide® J260-PF": "PA6",
    "iglide® A350-PF": "PA6",
    "iglide® RW370-PF": "PA6",
    "igumid® P190-PF": "PA6",
    "igumid® P150-PF": "PA6",
}


def load_yaml(path: Path) -> Optional[Dict[str, Any]]:
    """Load YAML from file with error handling."""
    if yaml is None:
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
    except (json.JSONDecodeError, OSError) as e:
        print(f"Error loading {path}: {e}")
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


def slugify(name: str) -> str:
    """Convert a name to a slug/ID format."""
    # Convert to lowercase
    slug = name.lower()
    # Replace common separators with underscores
    slug = re.sub(r'[\s\-]+', '_', slug)
    # Remove non-alphanumeric characters except underscores (including +)
    slug = re.sub(r'[^a-z0-9_]', '', slug)
    # Remove consecutive underscores
    slug = re.sub(r'_+', '_', slug)
    # Remove leading/trailing underscores
    slug = slug.strip('_')
    return slug


def folder_name_from_slug(slug: str) -> str:
    """Convert a slug to a folder name (keep underscores but sanitize)."""
    # Replace illegal characters with underscores
    illegal_chars = '#%&{}\\<>*?/$!\'"":@+`|='
    name = slug
    for char in illegal_chars:
        name = name.replace(char, '_')
    # Collapse multiple underscores into one
    name = re.sub(r'_+', '_', name)
    # Remove leading/trailing underscores
    name = name.strip('_')
    return name


def extract_color_hex(opt_material: Dict[str, Any]) -> Optional[str]:
    """Extract hex color from OPT material data."""
    primary_color = opt_material.get('primary_color', {})
    if isinstance(primary_color, dict):
        color_rgba = primary_color.get('color_rgba', '')
        if color_rgba:
            # Convert RGBA to hex (remove alpha)
            if color_rgba.startswith('#') and len(color_rgba) >= 7:
                return color_rgba[:7].upper()
    return None


def extract_variant_name_from_slug(slug: str, brand_slug: str, material_type: str) -> str:
    """Extract a readable variant name from a material slug."""
    # Remove brand prefix and material type to get color/variant name
    name = slug
    if name.startswith(brand_slug + '-'):
        name = name[len(brand_slug) + 1:]

    # Remove common material type suffixes
    material_lower = material_type.lower()
    name = re.sub(rf'^{material_lower}[_\-]?', '', name, flags=re.IGNORECASE)
    name = re.sub(rf'[_\-]?{material_lower}$', '', name, flags=re.IGNORECASE)

    # Convert to title case
    name = name.replace('-', ' ').replace('_', ' ')
    name = ' '.join(word.capitalize() for word in name.split())

    return name if name else "Standard"


def map_material_type(opt_type: str) -> Optional[str]:
    """Map OPT material type to OFD material type."""
    if not opt_type or not opt_type.strip():
        return None

    opt_type = opt_type.strip()
    
    # Direct lookup
    opt_type_upper = opt_type.upper()
    if opt_type_upper in VALID_MATERIAL_TYPES:
        return opt_type_upper

    # Try mapping
    mapped = MATERIAL_TYPE_MAP.get(opt_type, MATERIAL_TYPE_MAP.get(opt_type_upper))
    if mapped:
        return mapped

    # Try without plus signs etc.
    clean_type = re.sub(r'[+\-].*$', '', opt_type_upper)
    if clean_type in VALID_MATERIAL_TYPES:
        return clean_type

    return None

def infer_material_type_from_name(name: str) -> Optional[str]:
    """Try to infer material type from a material name."""
    if not name:
        return None
    
    name_upper = name.upper()
    
    # Check for material type keywords in the name (order matters - check specific first)
    material_patterns = [
        # Support materials
        (r'\bBREAKAWAY\b.*\bSUPPORT\b', "HIPS"),
        (r'\bSUPPORT\b.*\bMATERIAL\b', "PVA"),
        # Nylons/PA variants (high-temp first)
        (r'\bPAHT[\s\-]?CF\b', "PA6"),  # PA High Temperature carbon fiber
        (r'\bPAHT\b', "PA6"),  # PA High Temperature
        (r'\bHTN[\+\s\-]?CF\b', "PA6"),  # High-temp nylon carbon fiber
        (r'\bHTNCF\b', "PA6"),  # High-temp nylon carbon fiber
        (r'\bPA[\s\-]?CF\b', "PA6"),
        (r'\bPA[\s\-]?GF\b', "PA6"),
        (r'\bPA[\s\-]?11\b', "PA11"),
        (r'\bPA[\s\-]?12\b', "PA12"),
        (r'\bPA[\s\-]?66?\b', "PA6"),
        (r'\bNYLON\b', "PA6"),
        (r'\bNUCLEAR\s*NYLON\b', "PA6"),
        # PC variants
        (r'\bPC[\s\-]?ABS\b', "PC"),
        (r'\bPC[\s\-]?CF\b', "PC"),
        # Engineering plastics
        (r'\bPEEK\b', "PEEK"),
        (r'\bPEKK\b', "PEKK"),
        (r'\bPEI\b', "PEI"),
        (r'\bULTEM\b', "PEI"),
        (r'\bPPS\b', "PPS"),
        (r'\bPPSU\b', "PPSU"),
        (r'\bPSU\b', "PSU"),
        # Common materials
        (r'\bPETG[\s\-]?CF\b', "PETG"),
        (r'\bPETG\b', "PETG"),
        (r'\bPET\b', "PET"),
        (r'\bABS[\s\-]?CF\b', "ABS"),
        (r'\bABS\b', "ABS"),
        (r'\bASA\b', "ASA"),
        (r'\bPLA[\s\-]?CF\b', "PLA"),
        (r'\bPLA\b', "PLA"),
        (r'\bTPU\b', "TPU"),
        (r'\bTPE\b', "TPE"),
        (r'\bTPC\b', "TPC"),
        (r'\bPC\b', "PC"),
        (r'\bPP[\s\-]?CF\b', "PP"),
        (r'\bPP[\s\-]?GF\b', "PP"),
        (r'\bPP\b', "PP"),
        (r'\bPVA\b', "PVA"),
        (r'\bPVB\b', "PVB"),
        (r'\bHIPS\b', "HIPS"),
        (r'\bBVOH\b', "BVOH"),
        # Branded materials we can map
        (r'\bADURA\b', "PA6"),  # Add:North Adura is engineering nylon
        (r'\bADDBOR\b', "PA6"),  # Add:North Addbor is boron nitride PA
        (r'\bKOLTRON\b', "PA6"),  # Add:North Koltron is high-temp PA
        (r'\bCOEXNYLEX\b', "PA6"),  # COEX Nylex is nylon
        (r'\bLTS\d?\b', "PEI"),  # 3DXTech LTS is low-temp PEI
        (r'\bPXA\b', "PA6"),  # CC3D PXA is a PA blend
        (r'\bPROTEOS\b', "HIPS"),  # Tectonic 3D PROTEOS is breakaway support
    ]
    
    for pattern, material_type in material_patterns:
        if re.search(pattern, name_upper):
            return material_type
    
    return None


def merge_dict(base: Dict[str, Any], overlay: Dict[str, Any]) -> Dict[str, Any]:
    """Merge overlay dict into base dict, keeping existing values when not None."""
    result = base.copy()
    for key, value in overlay.items():
        if value is not None:
            if key not in result or result[key] is None:
                result[key] = value
    return result


def extract_domain(url: str) -> Optional[str]:
    """Extract domain from a URL."""
    if not url:
        return None
    try:
        # Add scheme if missing
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        parsed = urlparse(url)
        domain = parsed.netloc or parsed.path.split('/')[0]
        # Remove www. prefix
        if domain.startswith('www.'):
            domain = domain[4:]
        return domain if domain else None
    except Exception:
        return None


def fetch_logo_from_brandfetch(
    domain: str,
    output_path: Path,
    client_id: str,
    size: int = 400,
    dry_run: bool = False
) -> bool:
    """
    Fetch a logo from Brandfetch Logo CDN and save as square PNG.
    
    Uses the Logo CDN which returns square icons directly.
    
    Args:
        domain: The brand's domain (e.g., 'bambulab.com')
        output_path: Path to save the logo (e.g., 'logo.png')
        client_id: Brandfetch client ID
        size: Target size in pixels (100-400, will be square)
        dry_run: If True, don't actually save the file
    
    Returns:
        True if logo was fetched successfully, False otherwise
    """
    if Image is None:
        return False
    
    # Clamp size to valid range
    size = max(100, min(400, size))
    
    # Build Brandfetch CDN URL for square icon
    # Using icon type which is already square, with PNG format
    url = f"https://cdn.brandfetch.io/domain/{domain}/w/{size}/h/{size}/fallback/404/icon.png?c={client_id}"
    
    try:
        # Create request with user agent
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'OFD-Import/1.0'}
        )
        
        with urllib.request.urlopen(req, timeout=30) as response:
            if response.status != 200:
                return False
            
            image_data = response.read()
            
            # Check if we got actual image data (not empty or error)
            if len(image_data) < 100:
                return False
            
            if dry_run:
                return True
            
            # Load image with PIL to ensure it's valid and process it
            img = Image.open(BytesIO(image_data))
            
            # Convert to RGBA if necessary
            if img.mode not in ('RGBA', 'RGB'):
                img = img.convert('RGBA')
            
            # Ensure square dimensions (pad to center if needed)
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
            
            # Resize to target size if needed
            if img.size[0] != size:
                img = img.resize((size, size), Image.Resampling.LANCZOS)
            
            # Save as PNG
            output_path.parent.mkdir(parents=True, exist_ok=True)
            img.save(output_path, 'PNG', optimize=True)
            return True
            
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, Exception):
        return False


@register_script
class ImportOPTScript(BaseScript):
    """Import data from OpenPrintTag database."""

    name = "import_opt"
    description = "Import data from OpenPrintTag database repository"

    OPT_REPO_URL = "https://github.com/OpenPrintTag/openprinttag-database.git"

    def __init__(self, project_root: Optional[Path] = None):
        super().__init__(project_root)
        self.cache_dir = self.project_root / ".cache" / "openprinttag"
        self.stats = ImportStats()
        # Store container specs for looking up spool dimensions
        self.containers: Dict[str, Dict[str, Any]] = {}
        # Store processed materials keyed by slug for package lookups
        self.opt_materials: Dict[str, Dict[str, Any]] = {}
        # Brandfetch client ID (set via --brandfetch-id or BRANDFETCH_CLIENT_ID env var)
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
            '--brandfetch-id',
            type=str,
            help='Brandfetch client ID for logo fetching (or set BRANDFETCH_CLIENT_ID env var)'
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
                    # Try fresh clone
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
            self.stats.errors.append(f"Brand file missing slug: {brand_file}")
            return None

        self.stats.brands_processed += 1

        # Create brand directory name from brand name
        brand_folder = folder_name_from_slug(brand_slug)
        brand_dir = self.data_dir / brand_folder

        # Map OPT brand to OFD brand structure
        countries = opt_brand.get('countries_of_origin', [])
        origin = countries[0] if countries else 'Unknown'
        website = opt_brand.get('website', '')

        ofd_brand = {
            "id": slugify(brand_slug),
            "name": brand_name,
            "website": website,
            "logo": "logo.png",
            "origin": origin if len(origin) == 2 else 'Unknown'
        }

        # Check if brand already exists
        brand_json_path = brand_dir / "brand.json"
        logo_path = brand_dir / "logo.png"
        
        # Check if any logo file already exists (png, jpg, jpeg, svg, webp)
        logo_exists = any(
            (brand_dir / f"logo.{ext}").exists()
            for ext in ('png', 'jpg', 'jpeg', 'svg', 'webp')
        )
        
        if brand_json_path.exists():
            existing = load_json(brand_json_path)
            if existing:
                # Merge, preferring existing values
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

        # Fetch logo from Brandfetch if needed
        if fetch_logos and self.brandfetch_client_id and not logo_exists:
            # Try to get domain from website, or derive from brand name/slug
            domain = extract_domain(website) or extract_domain(ofd_brand.get('website', ''))
            if not domain:
                # Try to derive domain from brand name (e.g., "3D Fuel" -> "3dfuel.com")
                derived = re.sub(r'[^a-z0-9]', '', brand_name.lower())
                if derived:
                    domain = f"{derived}.com"
            
            if domain:
                self.log(f"  Fetching logo for {brand_name} ({domain})...")
                if fetch_logo_from_brandfetch(
                    domain=domain,
                    output_path=logo_path,
                    client_id=self.brandfetch_client_id,
                    size=logo_size,
                    dry_run=dry_run
                ):
                    self.stats.logos_fetched += 1
                    self.log(f"  ✓ Logo fetched successfully")
                else:
                    self.stats.logos_failed += 1
                    self.log(f"  ✗ Failed to fetch logo")
            else:
                self.stats.logos_failed += 1

        return {
            'slug': brand_slug,
            'folder': brand_folder,
            'dir': brand_dir,
            'data': ofd_brand,
            'website': website
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
            return

        material_slug = opt_material.get('slug', '')
        if not material_slug:
            self.stats.errors.append(f"Material file missing slug: {material_file}")
            return

        # Store for package lookup
        self.opt_materials[material_slug] = opt_material

        self.stats.materials_processed += 1

        # Only process FFF materials (filaments)
        material_class = opt_material.get('class', 'FFF')
        if material_class != 'FFF':
            return

        # Map material type
        opt_type = opt_material.get('type', opt_material.get('abbreviation', ''))
        ofd_material_type = map_material_type(opt_type)

        # If no type found from abbreviation, try to infer from material name
        if not ofd_material_type:
            material_name = opt_material.get('name', material_slug)
            ofd_material_type = infer_material_type_from_name(material_name)

        if not ofd_material_type:
            self.stats.errors.append(
                f"Unknown material type '{opt_type}' in {material_file}"
            )
            return

        brand_dir = brand_info['dir']
        brand_slug = brand_info['slug']

        # Create material directory
        material_dir = brand_dir / ofd_material_type
        material_json_path = material_dir / "material.json"

        # Create/update material.json
        ofd_material = {"material": ofd_material_type}
        material_class_opt = opt_material.get('class')
        if material_class_opt:
            ofd_material["material_class"] = material_class_opt

        if not material_json_path.exists():
            if not dry_run:
                material_dir.mkdir(parents=True, exist_ok=True)
                save_json(material_json_path, ofd_material, dry_run)

        # Extract filament name from slug
        filament_name = opt_material.get('name', material_slug)

        # Create filament directory
        # Use the OPT material name to create a more descriptive filament folder
        filament_slug = slugify(filament_name)
        if not filament_slug:
            filament_slug = slugify(material_slug)

        filament_folder = folder_name_from_slug(filament_slug)
        filament_dir = material_dir / filament_folder

        # Build filament.json
        properties = opt_material.get('properties', {})

        ofd_filament = {
            "id": filament_slug,
            "name": filament_name,
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

        # Create variant from color information
        color_hex = extract_color_hex(opt_material)
        variant_name = extract_variant_name_from_slug(
            material_slug, brand_slug, ofd_material_type
        )
        variant_slug = slugify(variant_name)
        if not variant_slug:
            variant_slug = "standard"

        variant_folder = folder_name_from_slug(variant_slug)
        variant_dir = filament_dir / variant_folder

        ofd_variant = {
            "id": variant_slug,
            "name": variant_name,
            "color_hex": color_hex or "#000000"
        }

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
        # This ensures every variant has at least a placeholder sizes.json
        sizes_json_path = variant_dir / "sizes.json"
        if not sizes_json_path.exists() and not dry_run:
            # Create a default size entry (1kg spool, 1.75mm diameter)
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
        """Process a material package file to create sizes.json."""
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
            # Schema requires GTIN to be a string
            size_entry["gtin"] = str(gtin)

        # Get container specs if available
        container_ref = opt_package.get('container', {})
        container_slug = container_ref.get('slug') if isinstance(container_ref, dict) else None

        if container_slug and container_slug in self.containers:
            container = self.containers[container_slug]
            if 'empty_weight' in container:
                size_entry['empty_spool_weight'] = container['empty_weight']
            if 'width' in container:
                size_entry['container_width'] = int(container['width'])
            if 'outer_diameter' in container:
                size_entry['container_outer_diameter'] = int(container['outer_diameter'])
            if 'hole_diameter' in container:
                size_entry['container_hole_diameter'] = int(container['hole_diameter'])

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

    def run(self, args: argparse.Namespace) -> ScriptResult:
        """Execute the import script."""
        # Load .env file first
        load_dotenv(self.project_root)
        
        dry_run = getattr(args, 'dry_run', False)
        no_fetch = getattr(args, 'no_fetch', False)
        target_brand = getattr(args, 'brand', None)
        clear_cache = getattr(args, 'clear_cache', False)
        no_logos = getattr(args, 'no_logos', False)
        logo_size = getattr(args, 'logo_size', 400)
        
        # Get Brandfetch client ID from args or environment
        self.brandfetch_client_id = (
            getattr(args, 'brandfetch_id', None) or
            os.environ.get('BRANDFETCH_CLIENT_ID')
        )

        # Check for yaml module
        if yaml is None:
            return ScriptResult(
                success=False,
                message="PyYAML is required. Install with: pip install pyyaml"
            )

        if dry_run:
            self.log("DRY RUN - no files will be modified\n")
        
        # Check for logo fetching capability
        fetch_logos = not no_logos and self.brandfetch_client_id is not None
        if not no_logos and not self.brandfetch_client_id:
            self.log("Note: No Brandfetch client ID provided. Logos will not be fetched.")
            self.log("  Set --brandfetch-id or BRANDFETCH_CLIENT_ID in .env to enable.\n")
        elif fetch_logos:
            if Image is None:
                self.log("Warning: Pillow is required for logo processing. Install with: pip install Pillow")
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
                    # File directly in materials dir, use slug from content
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
                    # Create minimal brand info
                    brand_folder = folder_name_from_slug(brand_slug)
                    brand_dir = self.data_dir / brand_folder
                    brand_infos[brand_slug] = {
                        'slug': brand_slug,
                        'folder': brand_folder,
                        'dir': brand_dir,
                        'data': {}
                    }

                self.log(f"Processing material: {material_file.stem}")
                self._process_material(material_file, brand_infos[brand_slug], dry_run)

                percent = int((i + 1) / total * 100)
                self.emit_progress('materials', percent, f'Processed {i + 1}/{total} materials')

        # Process packages (sizes)
        packages_dir = opt_data_dir / "material-packages"

        if packages_dir.exists():
            self.emit_progress('packages', 0, 'Processing packages...')
            package_files = list(packages_dir.rglob("*.yaml"))
            total = len(package_files)

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

        # Generate summary
        self.log("\n" + "=" * 50)
        self.log("Import Summary")
        self.log("=" * 50)
        self.log(f"Brands processed:  {self.stats.brands_processed}")
        self.log(f"Brands created:    {self.stats.brands_created}")
        self.log(f"Brands updated:    {self.stats.brands_updated}")
        self.log(f"Materials processed: {self.stats.materials_processed}")
        self.log(f"Filaments created: {self.stats.filaments_created}")
        self.log(f"Filaments updated: {self.stats.filaments_updated}")
        self.log(f"Variants created:  {self.stats.variants_created}")
        self.log(f"Variants updated:  {self.stats.variants_updated}")
        self.log(f"Sizes created:     {self.stats.sizes_created}")
        self.log(f"Sizes updated:     {self.stats.sizes_updated}")
        if fetch_logos:
            self.log(f"Logos fetched:     {self.stats.logos_fetched}")
            self.log(f"Logos failed:      {self.stats.logos_failed}")

        if self.stats.errors:
            self.log(f"\nErrors ({len(self.stats.errors)}):")
            for error in self.stats.errors[:10]:  # Show first 10
                self.log(f"  - {error}")
            if len(self.stats.errors) > 10:
                self.log(f"  ... and {len(self.stats.errors) - 10} more")

        return ScriptResult(
            success=len(self.stats.errors) == 0 or self.stats.filaments_created > 0,
            message=f"Imported {self.stats.filaments_created} filaments, "
                    f"{self.stats.variants_created} variants, "
                    f"{self.stats.sizes_created} sizes, "
                    f"{self.stats.logos_fetched} logos",
            data=self.stats.to_dict()
        )
