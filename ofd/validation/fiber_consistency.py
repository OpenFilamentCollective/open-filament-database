"""
Fiber-consistency validation.

A single filament line is reinforced with carbon fiber, with glass fiber, or with
neither — never a mix. It is therefore invalid for a filament to carry
``contains_carbon_fiber`` on one variant while another variant (or the same one)
carries ``contains_glass_fiber``.

This is the authoritative, server-side enforcement of that rule; the webui mirrors
it in ``webui/src/lib/utils/fiberConflict.ts``. It reads the committed ``traits``
of each variant (not names — name-based *suggestion* lives in
``ofd/scripts/apply_fiber_traits.py``) and reports a hard ERROR per offending
filament so a mixed filament can never merge.
"""

import json
from pathlib import Path

from ofd_validator import ValidationError, ValidationLevel

CARBON_FIBER_TRAIT = "contains_carbon_fiber"
GLASS_FIBER_TRAIT = "contains_glass_fiber"

CATEGORY = "fiber_consistency"


def _load_json(path: Path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def _variant_fibers(traits) -> set[str]:
    """Fiber kinds ('carbon' / 'glass') a variant carries, from its traits."""
    fibers: set[str] = set()
    if isinstance(traits, dict):
        if traits.get(CARBON_FIBER_TRAIT) is True:
            fibers.add("carbon")
        if traits.get(GLASS_FIBER_TRAIT) is True:
            fibers.add("glass")
    return fibers


def _rel(path: Path, base: Path) -> str:
    """Path relative to the data dir's parent (project root) for readable output."""
    try:
        return str(path.relative_to(base))
    except ValueError:
        return str(path)


def check_fiber_consistency(data_dir) -> list[ValidationError]:
    """
    Scan every filament and report carbon-fiber / glass-fiber conflicts.

    Emits one ERROR per variant that carries both fibers, plus one ERROR per
    filament whose variants are split between carbon fiber and glass fiber.
    """
    data_dir = Path(data_dir)
    errors: list[ValidationError] = []
    if not data_dir.exists():
        return errors

    base = data_dir.parent

    for brand_dir in sorted(data_dir.iterdir()):
        if not brand_dir.is_dir():
            continue
        for material_dir in sorted(brand_dir.iterdir()):
            if not material_dir.is_dir():
                continue
            for filament_dir in sorted(material_dir.iterdir()):
                if not filament_dir.is_dir():
                    continue

                carbon_only: list[str] = []
                glass_only: list[str] = []
                both: list[str] = []

                for variant_dir in sorted(filament_dir.iterdir()):
                    if not variant_dir.is_dir():
                        continue
                    variant_file = variant_dir / "variant.json"
                    if not variant_file.exists():
                        continue
                    data = _load_json(variant_file)
                    if not isinstance(data, dict):
                        continue

                    fibers = _variant_fibers(data.get("traits"))
                    if not fibers:
                        continue
                    name = str(data.get("name") or data.get("id") or variant_dir.name)

                    if "carbon" in fibers and "glass" in fibers:
                        both.append(name)
                        errors.append(
                            ValidationError(
                                ValidationLevel.Error,
                                CATEGORY,
                                f"Variant '{name}' carries both carbon fiber and glass fiber; "
                                f"a variant must be one or the other.",
                                _rel(variant_file, base),
                            )
                        )
                    elif "carbon" in fibers:
                        carbon_only.append(name)
                    elif "glass" in fibers:
                        glass_only.append(name)

                # A carbon-bearing variant and a glass-bearing variant that are NOT the
                # same variant. A lone both-fiber variant is already reported above, so
                # it only counts here when it coexists with an opposing single-fiber one.
                if (carbon_only and glass_only) or (both and (carbon_only or glass_only)):
                    carbon_names = carbon_only + both
                    glass_names = glass_only + both
                    errors.append(
                        ValidationError(
                            ValidationLevel.Error,
                            CATEGORY,
                            f"Filament mixes carbon fiber ({', '.join(carbon_names)}) and glass "
                            f"fiber ({', '.join(glass_names)}) across its variants; a filament "
                            f"can't contain both.",
                            _rel(filament_dir, base),
                        )
                    )

    return errors
