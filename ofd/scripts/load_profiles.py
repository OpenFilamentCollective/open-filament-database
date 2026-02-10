"""
Load Profiles Script - Download and process slicer profiles.

This script downloads slicer profiles from external sources (PrusaSlicer,
BambuStudio, OrcaSlicer, Cura) and processes them for use with the database.
"""

import argparse
import fileinput
import json
import os
import re
import shutil
from pathlib import Path
from typing import Optional, Union
from urllib.request import urlretrieve
from zipfile import ZipFile

import iniconfig
from iniconfig import IniConfig, ParseError

from ofd.base import BaseScript, ScriptResult, register_script

# Disable comment handling in iniconfig
iniconfig.COMMENTCHARS = ""

PathLike = Union[str, os.PathLike[str]]

# Slicer profile URLs
PRUSASLICER_URL_PRUSA_FFF = "https://github.com/prusa3d/PrusaSlicer-settings-prusa-fff/archive/refs/heads/main.zip"
PRUSASLICER_URL_NON_PRUSA_FFF = "https://github.com/prusa3d/PrusaSlicer-settings-non-prusa-fff/archive/refs/heads/main.zip"
BAMBUSTUDIO_URL = "https://github.com/bambulab/BambuStudio/archive/refs/heads/master.zip"
ORCASLICER_URL = "https://github.com/SoftFever/OrcaSlicer/archive/refs/heads/main.zip"
CURA_URL = "https://github.com/Ultimaker/fdm_materials/archive/refs/heads/master.zip"


def download_and_extract(slicer_name: str, url: str, member: str, pattern: str,
                         output_path: Path, ignore_existing: bool = False) -> None:
    """
    Download and extract slicer profiles from a ZIP archive.

    Args:
        slicer_name: The name of the slicer
        url: The URL to download from
        member: The folder within the zip file to extract from
        pattern: Regex pattern for files to extract
        output_path: Output directory for profiles
        ignore_existing: If True, don't remove existing folder
    """
    print(f"Downloading {slicer_name} archive...")
    zip_file_path = urlretrieve(url)[0]

    print(f"Extracting {slicer_name} archive...")
    slicer_output = output_path / slicer_name.lower()

    if not member.endswith("/"):
        member += "/"

    if not ignore_existing and slicer_output.exists():
        shutil.rmtree(slicer_output)

    with ZipFile(zip_file_path) as zip_f:
        if not pattern.endswith("$"):
            pattern = pattern + "$"
        pattern_re = re.compile(pattern)
        for file in zip_f.namelist():
            if not file.startswith(member) or file.endswith("/") or not re.match(pattern_re, file):
                continue
            rel_path = Path(file).relative_to(member)
            dest_path = slicer_output / rel_path
            parts = dest_path.parts
            if "filament" in parts:
                idx = parts.index("filament")
                parts = parts[:idx] + parts[idx + 1:]
                dest_path = Path(*parts)
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            with zip_f.open(file) as src, open(dest_path, "wb") as dst:
                dst.write(src.read())


def split_prusaslicer_bundle(path: Path) -> None:
    """Split PrusaSlicer's ini config bundles into individual JSON config files."""
    if path.suffix != ".ini":
        return

    try:
        config = IniConfig(path)
    except ParseError as e:
        if e.msg == "unexpected value continuation":
            with fileinput.FileInput(path, inplace=True) as f:
                for line in f:
                    print(line.strip())
            config = IniConfig(path)
        else:
            raise

    profiles: dict[str, dict[str, str]] = {}

    for section in config:
        if not section.name.startswith("filament:"):
            continue
        name = section.name.removeprefix("filament:")
        profiles[name] = dict(section.items())

    squashed_profiles: dict[str, dict[str, str]] = {}

    def squash_inherits(profile_name: str) -> dict[str, str]:
        if profile_name in squashed_profiles:
            return squashed_profiles[profile_name]

        if "inherits" not in profiles[profile_name]:
            return profiles[profile_name]

        profile = profiles[profile_name]
        profile_out: dict[str, str] = {}
        inherits = [x.strip() for x in profile["inherits"].split(";")]
        for inherit in inherits:
            if inherit:
                profile_out.update(squash_inherits(inherit))
        profile_out.update(profile)
        del profile_out["inherits"]
        squashed_profiles[profile_name] = profile_out
        return squashed_profiles[profile_name]

    def cleanse_name(file_name: str) -> str:
        return file_name.replace("/", " ")

    for name, data in profiles.items():
        if name.startswith("*"):
            continue
        out_path = path.parent / f"{cleanse_name(name)}.json"
        data_out = squash_inherits(name)
        data_out["filament_settings_id"] = name
        with out_path.open("w") as f:
            json.dump(data_out, f, indent=4)


def unpack_prusaslicer_bundles(output_path: Path) -> None:
    """Find and unpack PrusaSlicer bundles."""
    print("Unpacking PrusaSlicer bundles...")
    version_re = re.compile(r"([0-9]+)\.([0-9]+)\.([0-9]+)\.ini", re.RegexFlag.IGNORECASE)

    prusaslicer_path = output_path / "prusaslicer"
    if not prusaslicer_path.exists():
        return

    for vendor_dir in prusaslicer_path.iterdir():
        if not vendor_dir.is_dir():
            continue

        latest: tuple[int, int, int] = (0, 0, 0)
        for config_file in vendor_dir.iterdir():
            match = re.fullmatch(version_re, config_file.name)
            if not match:
                continue
            tmp = (int(match.group(1)), int(match.group(2)), int(match.group(3)))
            if tmp[0] <= latest[0] and tmp[1] <= latest[1] and tmp[2] <= latest[2]:
                continue
            latest = tmp

        latest_file_name = f"{latest[0]}.{latest[1]}.{latest[2]}.ini"

        for config_file in vendor_dir.iterdir():
            if config_file.name.lower() != latest_file_name:
                config_file.unlink()

        latest_file = vendor_dir / latest_file_name
        if latest_file.exists():
            split_prusaslicer_bundle(latest_file)
            latest_file.unlink()


def squash_slic3r_profiles(slicer_name: str, output_path: Path,
                           filament_library_name: Optional[str] = None) -> None:
    """Recursively squash all profiles for the specified slic3r-based slicer."""
    if slicer_name.lower() == "prusaslicer":
        raise ValueError("PrusaSlicer profile squashing is incompatible with this function")

    print(f"Squashing {slicer_name} profiles...")
    slicer_path = output_path / slicer_name.lower()

    if not slicer_path.exists():
        return

    def load_json_from_folder(folder: Path) -> dict[str, tuple[Path, dict]]:
        profiles: dict[str, tuple[Path, dict]] = {}
        for item in folder.iterdir():
            if item.is_dir():
                profiles.update(load_json_from_folder(item))
                continue
            if item.suffix != ".json":
                continue
            with item.open() as f:
                file_data = json.load(f)

            name: str
            if "name" in file_data:
                name = file_data["name"]
            elif "filament_settings_id" in file_data:
                name = file_data["filament_settings_id"]
            else:
                continue

            profiles[name] = (item, file_data)
        return profiles

    filament_library_profiles = {}
    if filament_library_name is not None:
        filament_library_profiles = load_json_from_folder(slicer_path / filament_library_name)

    for vendor_folder in slicer_path.iterdir():
        if not vendor_folder.is_dir():
            continue

        if vendor_folder.name == filament_library_name:
            profiles = {}
        else:
            profiles = filament_library_profiles.copy()

        profiles.update(load_json_from_folder(vendor_folder))
        squashed_profiles: dict[str, dict] = {}

        def squash_inherits(profile_name: str) -> dict:
            if profile_name in squashed_profiles:
                return squashed_profiles[profile_name]

            profile = profiles[profile_name][1]
            if "inherits" not in profile:
                return profile

            profile_out = squash_inherits(profile["inherits"]).copy()
            profile_out.update(profile)
            del profile_out["inherits"]
            squashed_profiles[profile_name] = profile_out
            return squashed_profiles[profile_name]

        shutil.rmtree(vendor_folder)

        for name, (path, data) in profiles.items():
            if data.get("instantiation") != "true" or vendor_folder.name not in path.parts:
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("w") as f:
                json.dump(squash_inherits(name), f, indent=4)


def load_overlay_profiles(output_path: Path, overlay_path: Path) -> None:
    """Load overlay profiles and copy them to the output directory."""
    profiles_overlay_path = overlay_path / "profiles"

    if not profiles_overlay_path.exists():
        print("No overlay profiles directory found, skipping overlay load...")
        return

    print("Loading overlay profiles...")
    overlay_count = 0

    for slicer_dir in profiles_overlay_path.iterdir():
        if not slicer_dir.is_dir():
            continue

        slicer_name = slicer_dir.name
        output_slicer_path = output_path / slicer_name

        for vendor_dir in slicer_dir.iterdir():
            if not vendor_dir.is_dir():
                continue

            vendor_name = vendor_dir.name
            output_vendor_path = output_slicer_path / vendor_name
            output_vendor_path.mkdir(parents=True, exist_ok=True)

            for profile_file in vendor_dir.iterdir():
                if profile_file.suffix != ".json":
                    continue

                dest_path = output_vendor_path / profile_file.name
                shutil.copy2(profile_file, dest_path)
                overlay_count += 1

    print(f"Loaded {overlay_count} overlay profiles")


@register_script
class LoadProfilesScript(BaseScript):
    """Download and process slicer profiles from external sources."""

    name = "load_profiles"
    description = "Download and process slicer profiles"

    def configure_parser(self, parser: argparse.ArgumentParser) -> None:
        """Add script-specific arguments."""
        parser.add_argument(
            '--profile-path',
            default='profiles',
            help='Output path for extracted profiles (default: profiles)'
        )
        parser.add_argument(
            '--overlay-path',
            default='overlay',
            help='Path to overlay directory (default: overlay)'
        )
        parser.add_argument(
            '--skip-prusaslicer',
            action='store_true',
            help='Skip PrusaSlicer profile download'
        )
        parser.add_argument(
            '--skip-bambustudio',
            action='store_true',
            help='Skip BambuStudio profile download'
        )
        parser.add_argument(
            '--skip-orcaslicer',
            action='store_true',
            help='Skip OrcaSlicer profile download'
        )
        parser.add_argument(
            '--skip-cura',
            action='store_true',
            help='Skip Cura profile download'
        )

    def run(self, args: argparse.Namespace) -> ScriptResult:
        """Execute the load_profiles script."""
        output_path = self.project_root / args.profile_path
        overlay_path = self.project_root / args.overlay_path

        output_path.mkdir(parents=True, exist_ok=True)

        downloaded = []
        errors = []

        # Download PrusaSlicer profiles
        if not args.skip_prusaslicer:
            try:
                download_and_extract(
                    "PrusaSlicer", PRUSASLICER_URL_PRUSA_FFF,
                    "PrusaSlicer-settings-prusa-fff-main/",
                    r".*\.ini", output_path
                )
                download_and_extract(
                    "PrusaSlicer", PRUSASLICER_URL_NON_PRUSA_FFF,
                    "PrusaSlicer-settings-non-prusa-fff-main/",
                    r".*\.ini", output_path, ignore_existing=True
                )
                unpack_prusaslicer_bundles(output_path)
                downloaded.append("PrusaSlicer")
            except Exception as e:
                errors.append(f"PrusaSlicer: {e}")

        # Download BambuStudio profiles
        if not args.skip_bambustudio:
            try:
                download_and_extract(
                    "BambuStudio", BAMBUSTUDIO_URL,
                    "BambuStudio-master/resources/profiles",
                    ".*/filament/.*", output_path
                )
                squash_slic3r_profiles("BambuStudio", output_path)
                downloaded.append("BambuStudio")
            except Exception as e:
                errors.append(f"BambuStudio: {e}")

        # Download OrcaSlicer profiles
        if not args.skip_orcaslicer:
            try:
                download_and_extract(
                    "OrcaSlicer", ORCASLICER_URL,
                    "OrcaSlicer-main/resources/profiles/",
                    ".*/filament/.*", output_path
                )
                squash_slic3r_profiles("OrcaSlicer", output_path, "OrcaFilamentLibrary")
                downloaded.append("OrcaSlicer")
            except Exception as e:
                errors.append(f"OrcaSlicer: {e}")

        # Download Cura profiles
        if not args.skip_cura:
            try:
                download_and_extract(
                    "Cura", CURA_URL,
                    "fdm_materials-master",
                    ".*.fdm_material$", output_path
                )
                downloaded.append("Cura")
            except Exception as e:
                errors.append(f"Cura: {e}")

        # Load overlay profiles
        try:
            load_overlay_profiles(output_path, overlay_path)
        except Exception as e:
            errors.append(f"Overlay: {e}")

        # Summary
        self.log(f"\nProfile loading complete!")
        self.log(f"Output directory: {output_path}")

        if downloaded:
            self.log(f"Downloaded: {', '.join(downloaded)}")

        if errors:
            for error in errors:
                self.log(f"Error: {error}")
            return ScriptResult(
                success=False,
                message=f"Completed with {len(errors)} errors",
                data={'downloaded': downloaded, 'errors': errors}
            )

        return ScriptResult(
            success=True,
            message="All profiles loaded successfully",
            data={'downloaded': downloaded}
        )
