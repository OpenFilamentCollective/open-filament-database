"""
Data-quality validation.

Rules for the small, repetitive defects that reviewers kept fixing by hand on webui
submissions after PR #405: placeholder values, duplicated spool rows, casing that
diverges from a filament's own siblings, fiber traits missing from variants whose
names announce the fiber, display names that start lowercase, filaments left with no
variants, and near-duplicate sibling names that differ only by word order.

This is the authoritative, server-side enforcement; the webui mirrors the rules in
``webui/src/lib/utils/dataQuality.ts`` and surfaces each as an inline "Fix" hint at
entry time. Keep the two in lockstep.

Every rule reuses the detector that already exists for its concept rather than
restating it:

* fiber codes            -> ``ofd/scripts/apply_fiber_traits.py`` (``detect_codes``)
* spool identity         -> ``ofd/merge.py`` (``size_dedupe_key``)
* word-swap normalization -> ``ofd/scripts/deduplicate_data.py``

Levels are chosen so a rule only blocks a merge when the data is genuinely wrong:
``placeholder_value``, ``duplicate_size_entry``, ``name_whitespace`` and
``purchase_link_storefront_root`` are ERRORs; the judgement calls
(``name_casing``, ``name_leading_case``, ``fiber_trait_missing``,
``orphan_filament``, ``sibling_near_duplicate``) are WARNINGs.

A WARNING here is advice, not a failure: ``ofd validate`` still exits 0 and reports
"All validations passed (N warnings)". Reviewers should not describe a warning as
something that breaks the build or makes data unreachable.
"""

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from ofd_validator import ValidationError, ValidationLevel

from ofd.merge import size_dedupe_key
from ofd.scripts.apply_fiber_traits import CODE_TRAITS, detect_codes

CATEGORY = "data_quality"

# Fields whose value is a human-facing display name.
_NAME_FIELDS = {
    "brand.json": "name",
    "material.json": "material",
    "filament.json": "name",
    "variant.json": "name",
    "store.json": "name",
}

# Two or more consecutive whitespace characters anywhere in a name.
_DOUBLED_SPACE = re.compile(r"\s\s")

# Words that legitimately stay lowercase inside a title-cased display name.
_MINOR_WORDS = {"and", "of", "the", "with", "de", "w/", "in", "on", "for", "a", "an"}


def _load_json(path: Path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def _rel(path: Path, base: Path) -> str:
    """Path relative to the data dir's parent (project root) for readable output."""
    try:
        return str(path.relative_to(base))
    except ValueError:
        return str(path)


def _err(level, message: str, path: str) -> ValidationError:
    return ValidationError(level, CATEGORY, message, path)


# --- Rule: placeholder values -------------------------------------------------


def _placeholder_paths(value, prefix: str = "") -> list[str]:
    """Dotted paths of blank string values, recursing into dicts and lists.

    A blank string is never meaningful data. ``certifications: [""]`` (#453) reads
    downstream as "this filament has a certification" whose name is blank; an empty
    array (or an absent field) says the true thing. Whitespace-only counts as blank —
    ``" "`` is no more a certification name than ``""`` is, and the webui's
    ``checkPlaceholderEntries`` flags it as one too.
    """
    found: list[str] = []
    if isinstance(value, dict):
        for key, sub in value.items():
            found.extend(_placeholder_paths(sub, f"{prefix}.{key}" if prefix else key))
    elif isinstance(value, list):
        for index, sub in enumerate(value):
            found.extend(_placeholder_paths(sub, f"{prefix}[{index}]"))
    elif isinstance(value, str) and value.strip() == "" and prefix:
        found.append(prefix)
    return found


def _check_placeholders(data, file_path: Path, base: Path) -> list[ValidationError]:
    return [
        _err(
            ValidationLevel.Error,
            f"'{dotted}' is blank. Remove the field, or drop the empty entry "
            f"from the array — a blank value is not the same as no value.",
            _rel(file_path, base),
        )
        for dotted in _placeholder_paths(data)
    ]


# --- Rule: name whitespace ----------------------------------------------------


def _check_name_whitespace(data, file_path: Path, base: Path) -> list[ValidationError]:
    """Leading/trailing or doubled whitespace in a display name.

    #460 created a filament literally named ``"Silk "``. The trailing space is
    invisible in review, survives into every downstream consumer, and makes the entity
    look distinct from the ``"Silk"`` the contributor meant.
    """
    field = _NAME_FIELDS.get(file_path.name)
    if not field or not isinstance(data, dict):
        return []
    name = data.get(field)
    if not isinstance(name, str) or not name:
        return []

    if name != name.strip():
        return [
            _err(
                ValidationLevel.Error,
                f"Name {name!r} has leading or trailing whitespace.",
                _rel(file_path, base),
            )
        ]
    if _DOUBLED_SPACE.search(name):
        return [
            _err(
                ValidationLevel.Error,
                f"Name {name!r} contains repeated whitespace.",
                _rel(file_path, base),
            )
        ]
    return []


# --- Rule: duplicate size entries ---------------------------------------------


def _redundant_size_fields(size: dict) -> dict:
    """The fields that make a spool row worth keeping, ignoring canonical identity.

    A field set to ``None`` or a blank string says nothing the absent field doesn't, so
    it must not be what distinguishes two rows — otherwise ``{"gtin": null}`` reads as a
    distinct GTIN. The webui's ``meaningfulFields`` drops the same values.
    """
    return {
        k: v
        for k, v in size.items()
        if k not in ("uuid", "moved_from")
        and v is not None
        and not (isinstance(v, str) and v.strip() == "")
    }


def _is_subsumed(size: dict, earlier: dict) -> bool:
    """True when `size` says nothing `earlier` doesn't already say.

    Spool identity in this repo is ``(filament_weight, diameter)`` — see
    ``size_dedupe_key`` in ``ofd/merge.py``, which is what ``merge_sizes`` and
    ``record_moved_from`` pair on. So two rows sharing that key are the same spool, and
    the later one is redundant unless it carries a value the earlier one lacks or
    contradicts (a distinct GTIN, article number, purchase link, spool geometry...).

    #453 shipped two 1 kg / 1.75 mm rows with nothing to tell them apart, which renders
    as the same size listed twice.
    """
    if size_dedupe_key(size) != size_dedupe_key(earlier):
        return False
    earlier_fields = _redundant_size_fields(earlier)
    return all(
        key in earlier_fields and earlier_fields[key] == value
        for key, value in _redundant_size_fields(size).items()
    )


def _check_duplicate_sizes(sizes, file_path: Path, base: Path) -> list[ValidationError]:
    if not isinstance(sizes, list):
        return []

    errors: list[ValidationError] = []
    for index, size in enumerate(sizes):
        if not isinstance(size, dict):
            continue
        for earlier_index in range(index):
            earlier = sizes[earlier_index]
            if isinstance(earlier, dict) and _is_subsumed(size, earlier):
                weight = size.get("filament_weight")
                diameter = size.get("diameter")
                errors.append(
                    _err(
                        ValidationLevel.Error,
                        f"Size #{index + 1} ({weight}g, {diameter}mm) adds nothing over size "
                        f"#{earlier_index + 1}. Merge them, or give it the SKU, GTIN or "
                        f"purchase link that tells them apart.",
                        _rel(file_path, base),
                    )
                )
                break
    return errors


# --- Rule: name casing --------------------------------------------------------


def _is_title_cased(name: str) -> bool:
    """True when every significant word starts with an uppercase letter."""
    words = [w for w in name.split() if w and w[0].isalpha()]
    if not words:
        return False
    return all(w[0].isupper() for w in words if w.lower() not in _MINOR_WORDS)


def _is_all_lower(name: str) -> bool:
    return bool(name) and name == name.lower() and any(c.isalpha() for c in name)


def _check_sibling_casing(names: list[tuple[str, Path]], base: Path) -> list[ValidationError]:
    """Flag an all-lowercase name among Title Case siblings.

    Casing is a house style rather than a hard rule, so this only fires when the
    entity's own siblings establish the convention — which is exactly how it was
    caught by hand on #451 ("translucent blue" beside "Purple", "Transparent") and
    #452 ("true red" beside "Red", "Mint Green").
    """
    titled = [n for n, _ in names if _is_title_cased(n)]
    if not titled:
        return []

    return [
        _err(
            ValidationLevel.Warning,
            f"Name {name!r} is lowercase while its siblings use Title Case (e.g. {titled[0]!r}).",
            _rel(path, base),
        )
        for name, path in names
        if _is_all_lower(name)
    ]


# --- Rule: name starts lowercase ----------------------------------------------


def _check_name_leading_case(data, file_path: Path, base: Path) -> list[ValidationError]:
    """A display name that starts with a lowercase letter.

    Narrower and more certain than ``_check_sibling_casing``: that rule needs Title
    Case siblings to establish a convention, so it stays silent on the first colour
    of a new filament — which is exactly when a name pasted off a product page
    ("yellow", "glass fiber black") lands in the tree. 126 names in the current data
    start lowercase this way.

    Only the first letter is at issue; Title Casing the rest would rewrite
    manufacturer styling like "PLA+ eSilk". Intercapped names are left alone —
    "eSUN 3D", "iSANMATE", "rPLA pro", "rPETG", "ePAHT-CF" are the brand's own
    styling, and there are 18 such names in the tree.

    Mirrors ``checkNameLeadingCase`` in ``webui/src/lib/utils/dataQuality.ts``.
    """
    field = _NAME_FIELDS.get(file_path.name)
    if not field or not isinstance(data, dict):
        return []
    name = data.get(field)
    if not isinstance(name, str) or not name:
        return []

    # A name may legitimately open with a digit or symbol ("3D Gold", "+PLA"); those
    # say nothing about casing, so look at the first letter wherever it is.
    index = next((i for i, ch in enumerate(name) if ch.isalpha()), None)
    if index is None or not name[index].islower():
        return []
    # eSUN / rPLA / iSANMATE.
    if index + 1 < len(name) and name[index + 1].isupper():
        return []

    suggestion = name[:index] + name[index].upper() + name[index + 1 :]
    return [
        _err(
            ValidationLevel.Warning,
            f"Name {name!r} starts with a lowercase letter; display names are shown "
            f"capitalised. Use {suggestion!r}.",
            _rel(file_path, base),
        )
    ]


# --- Rule: fiber traits missing -----------------------------------------------


def _check_fiber_traits(
    data: dict, text: str, file_path: Path, base: Path
) -> list[ValidationError]:
    """A variant whose name announces CF/GF/HF but carries none of the traits.

    ``apply_fiber_traits.py`` has detected this since #405, but only to *suggest*.
    #450 still merged four variants named "carbon fiber <colour>" with no
    ``contains_carbon_fiber`` or ``abrasive``, so they were invisible to every
    downstream abrasive-material filter.
    """
    codes = detect_codes(text)
    if not codes:
        return []

    traits = data.get("traits")
    traits = traits if isinstance(traits, dict) else {}

    missing: list[str] = []
    for code in sorted(codes):
        for trait in CODE_TRAITS.get(code, ()):
            if traits.get(trait) is not True and trait not in missing:
                missing.append(trait)

    if not missing:
        return []

    return [
        _err(
            ValidationLevel.Warning,
            f"Name suggests {', '.join(sorted(codes))} but these traits are not set: "
            f"{', '.join(missing)}.",
            _rel(file_path, base),
        )
    ]


# --- Rule: orphan filament ----------------------------------------------------


def _check_orphan_filament(filament_dir: Path, base: Path) -> list[ValidationError]:
    """A filament directory with no variants under it.

    This flags an *incomplete* filament, not a broken one. Childless entities are
    valid, addressable and rendered: the API emits an ``index.json`` for them and
    the webui's filament page loads the filament independently of its variants, so
    a filament with no colours shows an empty Variants panel rather than a 404.
    There are ~140 of them in the tree at any time, most of them brand skeletons
    waiting on a follow-up PR.

    It is worth reporting because it is also what a botched edit looks like: #461
    left ``data/3dhojor/PLA/silk_blue_green/`` behind this way, by deleting and
    re-creating a filament that a still-open PR was also editing.

    Hence WARNING, and hence the wording below leads with adding colours rather
    than with deletion — do not restate this rule as "unreachable in the UI".
    """
    has_variant = any(
        child.is_dir() and (child / "variant.json").exists() for child in filament_dir.iterdir()
    )
    if has_variant:
        return []
    return [
        _err(
            ValidationLevel.Warning,
            "Filament has no colours yet. Add at least one variant when you have the "
            "data; if this folder is a leftover from an edit, remove it.",
            _rel(filament_dir, base),
        )
    ]


# --- Rule: sibling near-duplicates --------------------------------------------


def _word_multiset(name: str) -> tuple:
    """Order-insensitive identity of an underscore-separated id.

    Mirrors the word-swap grouping in ``ofd/scripts/deduplicate_data.py``, so what
    that script would offer to merge is what this reports.
    """
    return tuple(sorted(Counter(name.split("_")).items()))


def _check_sibling_duplicates(ids: list[tuple[str, Path]], base: Path) -> list[ValidationError]:
    groups: dict[tuple, list[tuple[str, Path]]] = defaultdict(list)
    for entity_id, path in ids:
        groups[_word_multiset(entity_id)].append((entity_id, path))

    errors: list[ValidationError] = []
    for members in groups.values():
        if len(members) < 2:
            continue
        names = [entity_id for entity_id, _ in members]
        for entity_id, path in members[1:]:
            others = [n for n in names if n != entity_id]
            errors.append(
                _err(
                    ValidationLevel.Warning,
                    f"'{entity_id}' is a word-order duplicate of {', '.join(repr(o) for o in others)}. "
                    f"These are almost always the same thing under two names.",
                    _rel(path, base),
                )
            )
    return errors


# --- Entry point --------------------------------------------------------------


def check_data_quality(data_dir) -> list[ValidationError]:
    """Scan the data tree and report every data-quality finding."""
    data_dir = Path(data_dir)
    errors: list[ValidationError] = []
    if not data_dir.exists():
        return errors

    base = data_dir.parent

    for brand_dir in sorted(p for p in data_dir.iterdir() if p.is_dir()):
        brand_file = brand_dir / "brand.json"
        brand_data = _load_json(brand_file)
        if isinstance(brand_data, dict):
            errors.extend(_check_placeholders(brand_data, brand_file, base))
            errors.extend(_check_name_whitespace(brand_data, brand_file, base))
            errors.extend(_check_name_leading_case(brand_data, brand_file, base))

        for material_dir in sorted(p for p in brand_dir.iterdir() if p.is_dir()):
            material_file = material_dir / "material.json"
            material_data = _load_json(material_file)
            if isinstance(material_data, dict):
                errors.extend(_check_placeholders(material_data, material_file, base))
                errors.extend(_check_name_whitespace(material_data, material_file, base))
                errors.extend(_check_name_leading_case(material_data, material_file, base))

            filament_names: list[tuple[str, Path]] = []
            filament_ids: list[tuple[str, Path]] = []

            for filament_dir in sorted(p for p in material_dir.iterdir() if p.is_dir()):
                filament_file = filament_dir / "filament.json"
                filament_data = _load_json(filament_file)
                if not isinstance(filament_data, dict):
                    continue

                errors.extend(_check_placeholders(filament_data, filament_file, base))
                errors.extend(_check_name_whitespace(filament_data, filament_file, base))
                errors.extend(_check_name_leading_case(filament_data, filament_file, base))
                errors.extend(_check_orphan_filament(filament_dir, base))

                name = filament_data.get("name")
                if isinstance(name, str) and name:
                    filament_names.append((name, filament_file))
                filament_ids.append((filament_dir.name, filament_dir))

                variant_names: list[tuple[str, Path]] = []
                variant_ids: list[tuple[str, Path]] = []

                for variant_dir in sorted(p for p in filament_dir.iterdir() if p.is_dir()):
                    variant_file = variant_dir / "variant.json"
                    variant_data = _load_json(variant_file)
                    if not isinstance(variant_data, dict):
                        continue

                    errors.extend(_check_placeholders(variant_data, variant_file, base))
                    errors.extend(_check_name_whitespace(variant_data, variant_file, base))
                    errors.extend(_check_name_leading_case(variant_data, variant_file, base))

                    # Fiber codes can come from any level of the path, matching
                    # apply_fiber_traits.py's scan.
                    fiber_text = " / ".join(
                        str(part).lower()
                        for part in (
                            material_dir.name,
                            filament_dir.name,
                            filament_data.get("name") or "",
                            variant_dir.name,
                            variant_data.get("name") or "",
                        )
                        if part
                    )
                    errors.extend(_check_fiber_traits(variant_data, fiber_text, variant_file, base))

                    variant_name = variant_data.get("name")
                    if isinstance(variant_name, str) and variant_name:
                        variant_names.append((variant_name, variant_file))
                    variant_ids.append((variant_dir.name, variant_dir))

                    sizes_file = variant_dir / "sizes.json"
                    if sizes_file.exists():
                        sizes = _load_json(sizes_file)
                        errors.extend(_check_placeholders(sizes, sizes_file, base))
                        errors.extend(_check_duplicate_sizes(sizes, sizes_file, base))

                errors.extend(_check_sibling_casing(variant_names, base))
                errors.extend(_check_sibling_duplicates(variant_ids, base))

            errors.extend(_check_sibling_casing(filament_names, base))
            errors.extend(_check_sibling_duplicates(filament_ids, base))

    return errors
