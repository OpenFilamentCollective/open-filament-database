"""
Data-quality validation.

Rules for the small, repetitive defects that reviewers kept fixing by hand on webui
submissions after PR #405: placeholder values, duplicated spool rows, casing that
diverges from a filament's own siblings, fiber traits missing from variants whose
names announce the fiber, display names that start lowercase, filaments left with no
variants, near-duplicate sibling names that differ only by word order, and
min/max filament settings recorded the wrong way round.

This is the authoritative, server-side enforcement; the webui mirrors the rules in
``webui/src/lib/utils/dataQuality.ts`` and surfaces each as an inline "Fix" hint at
entry time. Keep the two in lockstep.

Every rule reuses the detector that already exists for its concept rather than
restating it:

* fiber codes            -> ``ofd/scripts/apply_fiber_traits.py`` (``detect_codes``)
* spool identity         -> ``ofd/merge.py`` (``size_dedupe_key``)
* word-swap normalization -> ``ofd/scripts/deduplicate_data.py``

Levels are chosen so a rule only blocks a merge when the data is genuinely wrong:
``placeholder_value``, ``duplicate_size_entry``, ``name_whitespace``,
``inverted_range`` and ``purchase_link_storefront_root`` are ERRORs; the judgement calls
(``name_casing``, ``name_leading_case``, ``fiber_trait_missing``,
``orphan_filament``, ``sibling_near_duplicate``) are WARNINGs.

Sustainability data (``sustainability`` on filaments and variants,
``container_details`` on sizes) must follow "copy, never compute". These are
ERRORs: a missing source field, a percentage outside 0-100, a ``retrieved`` /
``published`` / ``reference_year`` in the future, a number absent from its
``source_quote``, and ``recycled_content.pct > 0`` without ``traits.recycled``.
``traits.recycled`` with no recycled content only WARNs, and only once the filament
or variant has a sustainability block.

Mechanical data (``mechanical`` on filaments) follows the same sourcing rules: a
missing source field, a value or ``plus_minus`` absent from its ``source_quote``, a
``retrieved`` date in the future and a unit that does not fit the property are
ERRORs. A print direction on moulded test bars and a repeated entry only WARN.

A WARNING here is advice, not a failure: ``ofd validate`` still exits 0 and reports
"All validations passed (N warnings)". Reviewers should not describe a warning as
something that breaks the build or makes data unreachable.
"""

import json
import re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit

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

# Strings contributors type when they have no value. ``certifications: ["NA"]`` (#502)
# reads downstream as a certification called "NA". None of these occur as real data.
# Mirrors ``PLACEHOLDER_WORDS`` in ``webui/src/lib/utils/dataQuality.ts``.
_PLACEHOLDER_WORDS = {"na", "n/a", "none", "null", "tbd", "-"}

_SCHEMAS_DIR = Path(__file__).resolve().parents[2] / "schemas"


def _resolve_ref(ref: str, doc: dict, docs: dict[str, dict]):
    """``#/definitions/x``, ``./other_schema.json`` or ``./other.json#/definitions/x``."""
    file_part, _, fragment = ref.partition("#")
    target = docs.get(Path(file_part).name) if file_part else doc
    for token in (t for t in fragment.split("/") if t):
        target = target.get(token) if isinstance(target, dict) else None
    return target, (docs.get(Path(file_part).name) if file_part else doc)


def _collect_enums(node, doc: dict, docs: dict, out: dict[str, set[str]], field: str, seen: set):
    """Walk schema keywords only, following ``$ref``s, recording enums by field name."""
    if not isinstance(node, dict) or id(node) in seen:
        return
    seen = seen | {id(node)}
    if field and isinstance(node.get("enum"), list):
        out.setdefault(field, set()).update(v for v in node["enum"] if isinstance(v, str))
    if isinstance(node.get("$ref"), str):
        target, target_doc = _resolve_ref(node["$ref"], doc, docs)
        if isinstance(target, dict) and isinstance(target_doc, dict):
            _collect_enums(target, target_doc, docs, out, field, seen)
    properties = node.get("properties")
    if isinstance(properties, dict):
        for name, sub in properties.items():
            _collect_enums(sub, doc, docs, out, name, seen)
    for keyword in ("items", "additionalProperties"):
        _collect_enums(node.get(keyword), doc, docs, out, field, seen)
    for keyword in ("anyOf", "oneOf", "allOf"):
        for sub in node.get(keyword) or []:
            _collect_enums(sub, doc, docs, out, field, seen)


def _schema_enums() -> dict[str, set[str]]:
    """Field name -> every string value a schema allows it as an enum.

    A placeholder word that a schema defines as a real value is data, not a stand-in:
    the sustainability schema (#768) has ``verification: "none"`` for "not
    independently reviewed".
    """
    docs: dict[str, dict] = {}
    for schema_file in sorted(_SCHEMAS_DIR.glob("*.json")):
        try:
            doc = json.loads(schema_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(doc, dict):
            docs[schema_file.name] = doc
    enums: dict[str, set[str]] = {}
    for doc in docs.values():
        _collect_enums(doc, doc, docs, enums, "", set())
    return enums


_ENUM_VALUES = _schema_enums()


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
    ``checkPlaceholderEntries`` flags it as one too. So do the stand-ins in
    ``_PLACEHOLDER_WORDS`` ("NA", "N/A", "TBD"...).
    """
    found: list[str] = []
    if isinstance(value, dict):
        for key, sub in value.items():
            found.extend(_placeholder_paths(sub, f"{prefix}.{key}" if prefix else key))
    elif isinstance(value, list):
        for index, sub in enumerate(value):
            found.extend(_placeholder_paths(sub, f"{prefix}[{index}]"))
    elif isinstance(value, str) and prefix and value.strip().lower() in _PLACEHOLDER_WORDS | {""}:
        field = re.sub(r"\[\d+\]$", "", prefix).rsplit(".", 1)[-1]
        if value not in _ENUM_VALUES.get(field, ()):
            found.append(prefix)
    return found


def _check_placeholders(data, file_path: Path, base: Path) -> list[ValidationError]:
    errors: list[ValidationError] = []
    for dotted in _placeholder_paths(data):
        value = _dig(data, dotted)
        what = "is blank" if value.strip() == "" else f"is a placeholder ({value!r})"
        errors.append(
            _err(
                ValidationLevel.Error,
                f"'{dotted}' {what}. Remove the field, or drop the entry from the "
                f"array — a placeholder is not the same as no value.",
                _rel(file_path, base),
            )
        )
    return errors


def _dig(data, dotted: str):
    """The value at a dotted path as produced by ``_placeholder_paths``."""
    for part in re.findall(r"[^.\[\]]+|\[\d+\]", dotted):
        data = data[int(part[1:-1])] if part.startswith("[") else data[part]
    return data


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


# --- Rule: inverted ranges ----------------------------------------------------

# (lower, upper) filament fields where the lower value must not exceed the upper.
# JSON Schema can't compare two fields, so this is where the pairing is enforced; the
# exporters copy both values straight into slicer presets. Mirrored by ``RANGE_PAIRS``
# in ``webui/src/lib/utils/dataQuality.ts``.
_RANGE_PAIRS = (
    ("min_print_temperature", "max_print_temperature"),
    ("min_bed_temperature", "max_bed_temperature"),
    ("min_fan_speed", "max_fan_speed"),
    ("dry_temperature", "max_dry_temperature"),
)


def _is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _check_inverted_ranges(data, file_path: Path, base: Path) -> list[ValidationError]:
    """A lower bound above its upper bound, e.g. ``min_fan_speed`` 80 / ``max_fan_speed`` 20."""
    if not isinstance(data, dict):
        return []
    return [
        _err(
            ValidationLevel.Error,
            f"'{low}' ({data[low]}) is greater than '{high}' ({data[high]}). "
            f"The values are probably swapped.",
            _rel(file_path, base),
        )
        for low, high in _RANGE_PAIRS
        if _is_number(data.get(low)) and _is_number(data.get(high)) and data[low] > data[high]
    ]


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


def _container_material(size: dict) -> str | None:
    """``container_material``, reading the deprecated ``spool_refill: true`` as ``refill``.

    The webui's ``containerMaterialOf`` does the same.
    """
    material = size.get("container_material")
    if material:
        return material
    return "refill" if size.get("spool_refill") is True else None


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
    # A spool and its refill share weight and diameter; the container material is what
    # tells them apart.
    if _container_material(size) != _container_material(earlier):
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


# --- Rule: purchase link to a storefront root ---------------------------------


# A lone path segment that is still the shop's landing page, not a product.
_LANDING_SEGMENTS = {"shop", "store", "home", "index.html", "index.php"}


def is_storefront_root(url: str) -> bool:
    """True when a purchase link points at a shop's front door rather than a product.

    A bare origin, or one whose only path segment is a landing area. A query naming
    anything other than tracking (``/index.php?route=product/product&product_id=1``)
    identifies a product, so it is not a root.

    Mirrors ``isStorefrontRoot`` in ``webui/src/lib/utils/urlSanitizer.ts``, minus the
    store/brand front-page comparison the webui can make with its loaded stores.
    """
    # Imported here: style_data imports ofd.validation, which imports this module.
    from ofd.scripts.style_data import _is_tracking_key

    parts = urlsplit(url.strip() if "://" in url else f"https://{url.strip()}")
    if not parts.hostname:
        return False
    if any(not _is_tracking_key(key) for key, _ in parse_qsl(parts.query, keep_blank_values=True)):
        return False
    segments = [s for s in parts.path.lower().split("/") if s]
    return not segments or (len(segments) == 1 and segments[0] in _LANDING_SEGMENTS)


def _check_storefront_root_links(sizes, file_path: Path, base: Path) -> list[ValidationError]:
    """A purchase link that is just a shop's home page.

    #454 linked ``https://store.bambulab.com/`` as the place to buy a specific
    colour. A homepage identifies neither the filament nor the colour, so a buyer
    following it lands on the front page and has to search for the spool themselves.
    """
    if not isinstance(sizes, list):
        return []

    errors: list[ValidationError] = []
    for index, size in enumerate(sizes):
        if not isinstance(size, dict):
            continue
        for link in size.get("purchase_links") or []:
            url = link.get("url") if isinstance(link, dict) else None
            if not isinstance(url, str) or not url.strip() or not is_storefront_root(url):
                continue
            errors.append(
                _err(
                    ValidationLevel.Error,
                    f"Size #{index + 1} links to the storefront root {url!r}. Link the "
                    f"product page for this colour and size instead.",
                    _rel(file_path, base),
                )
            )
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


# --- Rule: parent brand -------------------------------------------------------


def _check_parent_brands(data_dir: Path, base: Path) -> list[ValidationError]:
    """``parent_brand`` must name another existing brand, without forming a cycle.

    The schema only checks the id pattern, so a typo such as ``polymakr`` would
    otherwise pass and leave the build with nothing to resolve it to.
    """
    parents: dict[str, str] = {}
    files: dict[str, Path] = {}
    for brand_dir in sorted(p for p in data_dir.iterdir() if p.is_dir()):
        files[brand_dir.name] = brand_dir / "brand.json"
        brand_data = _load_json(files[brand_dir.name])
        if isinstance(brand_data, dict) and isinstance(brand_data.get("parent_brand"), str):
            parents[brand_dir.name] = brand_data["parent_brand"]

    errors: list[ValidationError] = []
    for brand, parent in parents.items():
        path = _rel(files[brand], base)
        if parent == brand:
            errors.append(_err(ValidationLevel.Error, "parent_brand names the brand itself", path))
            continue
        if parent not in files:
            errors.append(
                _err(
                    ValidationLevel.Error,
                    f"parent_brand '{parent}' is not a brand folder under data/",
                    path,
                )
            )
            continue
        # Walk up the chain; coming back to this brand means a cycle.
        seen = {brand}
        current = parent
        while current in parents:
            if current in seen:
                if current == brand:
                    errors.append(
                        _err(
                            ValidationLevel.Error,
                            f"parent_brand forms a cycle through '{parent}'",
                            path,
                        )
                    )
                break
            seen.add(current)
            current = parents[current]
    return errors


# --- Rules: sustainability data ----------------------------------------------
#
# Sustainability figures follow "copy, never compute": every number is copied from a
# cited source, and the quote must show it. See docs/manual.md#-sustainability-data.

_SOURCE_FIELDS = ("source_url", "source_quote", "retrieved")

# Value fields per sourced section; arrays hold one sourced entry per item.
_SUSTAINABILITY_SECTIONS = {
    "recycled_content": ("pct",),
    "bio_based_content": ("pct",),
    "carbon_footprints": ("value_kg_co2e",),
    "relative_claims": ("reduction_pct",),
}

_PCT_FIELDS = {"pct", "recycled_pct", "reduction_pct"}


def _sourced_entries(sustainability) -> list[tuple[str, dict, tuple[str, ...]]]:
    """(json path, entry, value fields) for every sourced entry in a sustainability block."""
    if not isinstance(sustainability, dict):
        return []
    entries = []
    for section, fields in _SUSTAINABILITY_SECTIONS.items():
        value = sustainability.get(section)
        if isinstance(value, dict):
            entries.append((f"sustainability.{section}", value, fields))
        elif isinstance(value, list):
            entries.extend(
                (f"sustainability.{section}[{i}]", item, fields)
                for i, item in enumerate(value)
                if isinstance(item, dict)
            )
    return entries


def _number_pattern(value) -> re.Pattern:
    """Match ``value`` as written in prose: ``5.85`` or ``5,85``, trailing zeros allowed.

    The digit boundaries stop ``5.85`` from matching inside ``15.85`` or ``5.851``.
    Thousands may be grouped with a comma or a space, as data sheets in psi do:
    ``7250`` also matches ``7,250`` and ``7 250``.
    """
    text = repr(float(value)).rstrip("0").rstrip(".")
    int_part, _, frac = text.partition(".")
    head = len(int_part) % 3 or 3
    groups = [int_part[:head]] + [int_part[i : i + 3] for i in range(head, len(int_part), 3)]
    integer = re.escape(groups[0]) + "".join(f"[,\u00a0\u202f ]?{g}" for g in groups[1:])
    number = integer + (f"[.,]{frac}0*" if frac else r"(?:[.,]0+)?")
    return re.compile(rf"(?<![\d.,]){number}(?!\d)")


def _parse_date(value):
    try:
        return date.fromisoformat(value) if isinstance(value, str) else None
    except ValueError:
        return None


def _check_sourced_entry(
    path: str,
    entry: dict,
    value_fields: tuple[str, ...],
    file_path: Path,
    base: Path,
    kind: str = "sustainability",
) -> list[ValidationError]:
    """One sourced entry: sources present, percentages in range, dates not in the
    future, and every number present verbatim in ``source_quote``."""
    from datetime import date

    rel = _rel(file_path, base)
    errors: list[ValidationError] = []

    missing = [f for f in _SOURCE_FIELDS if not str(entry.get(f) or "").strip()]
    if missing:
        errors.append(
            _err(
                ValidationLevel.Error,
                f"{path} is missing {', '.join(missing)}. Every {kind} figure "
                "needs a source URL, a verbatim quote and the date it was retrieved.",
                rel,
            )
        )

    for field in value_fields:
        value = entry.get(field)
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            continue
        if field in _PCT_FIELDS and not 0 <= value <= 100:
            errors.append(
                _err(
                    ValidationLevel.Error,
                    f"{path}.{field} is {value}; a percentage must be between 0 and 100.",
                    rel,
                )
            )
        quote = entry.get("source_quote")
        if isinstance(quote, str) and quote.strip() and not _number_pattern(value).search(quote):
            errors.append(
                _err(
                    ValidationLevel.Error,
                    f"{path}.{field} is {value}, but source_quote does not contain that "
                    "number. Copy the figure exactly as the source writes it; never "
                    "derive or convert it.",
                    rel,
                )
            )

    today = date.today()
    for field in ("retrieved", "published"):
        raw = entry.get(field)
        if raw is None:
            continue
        parsed = _parse_date(raw)
        if parsed is None:
            errors.append(
                _err(
                    ValidationLevel.Error,
                    f"{path}.{field} is {raw!r}; expected a date as YYYY-MM-DD.",
                    rel,
                )
            )
        elif parsed > today:
            errors.append(
                _err(ValidationLevel.Error, f"{path}.{field} {raw} is in the future.", rel)
            )

    year = entry.get("reference_year")
    if isinstance(year, int) and not isinstance(year, bool) and year > today.year:
        errors.append(
            _err(ValidationLevel.Error, f"{path}.reference_year {year} is in the future.", rel)
        )

    return errors


def _check_sustainability(data: dict, file_path: Path, base: Path) -> list[ValidationError]:
    """Every sourced entry in a filament's or variant's ``sustainability`` block."""
    errors: list[ValidationError] = []
    for path, entry, fields in _sourced_entries(data.get("sustainability")):
        errors.extend(_check_sourced_entry(path, entry, fields, file_path, base))
    return errors


def _check_container_details(sizes, file_path: Path, base: Path) -> list[ValidationError]:
    """``container_details`` on each size is a sourced entry like the ones above."""
    if not isinstance(sizes, list):
        return []
    errors: list[ValidationError] = []
    for i, size in enumerate(sizes):
        details = size.get("container_details") if isinstance(size, dict) else None
        if isinstance(details, dict):
            errors.extend(
                _check_sourced_entry(
                    f"[{i}].container_details", details, ("recycled_pct",), file_path, base
                )
            )
    return errors


def _check_recycled_trait(
    filament_data: dict, variant_data: dict, file_path: Path, base: Path
) -> list[ValidationError]:
    """``recycled_content`` and ``traits.recycled`` must agree on each variant.

    A variant's ``sustainability`` overrides the filament's per field, so the effective
    ``recycled_content`` is the variant's if it sets one, otherwise the filament's.
    A positive percentage without the trait is an ERROR. The trait without any recycled
    content only WARNs, and only once a sustainability block exists on the filament or
    variant: until a brand has been researched, the trait alone is expected.
    """
    filament_sus = filament_data.get("sustainability")
    variant_sus = variant_data.get("sustainability")
    filament_sus = filament_sus if isinstance(filament_sus, dict) else {}
    variant_sus = variant_sus if isinstance(variant_sus, dict) else {}

    content = variant_sus.get("recycled_content", filament_sus.get("recycled_content"))
    pct = content.get("pct") if isinstance(content, dict) else None
    traits = variant_data.get("traits")
    has_trait = isinstance(traits, dict) and traits.get("recycled") is True

    if isinstance(pct, (int, float)) and pct > 0 and not has_trait:
        return [
            _err(
                ValidationLevel.Error,
                f"recycled_content.pct is {pct} but traits.recycled is not set on this variant.",
                _rel(file_path, base),
            )
        ]
    if has_trait and (filament_sus or variant_sus) and (content is None or pct == 0):
        return [
            _err(
                ValidationLevel.Warning,
                "traits.recycled is set and sustainability data exists, but there is no "
                "recycled_content for this variant.",
                _rel(file_path, base),
            )
        ]
    return []


# --- Rules: mechanical data ---------------------------------------------------
#
# Mechanical values are copied from the brand's data sheet like sustainability figures:
# in the unit the sheet uses, with the quote that shows them. See
# docs/manual.md#-mechanical-data.

_PRESSURE_UNITS = frozenset({"MPa", "GPa", "psi", "ksi"})
_IMPACT_UNITS = frozenset({"kJ/m2", "J/m", "ft-lb/in"})
_TEMPERATURE_UNITS = frozenset({"°C", "°F"})

# Units that fit each property.
_MECHANICAL_UNITS = {
    "tensile_modulus": _PRESSURE_UNITS,
    "tensile_strength": _PRESSURE_UNITS,
    "yield_strength": _PRESSURE_UNITS,
    "flexural_modulus": _PRESSURE_UNITS,
    "flexural_strength": _PRESSURE_UNITS,
    "elongation_at_break": frozenset({"%"}),
    "impact_strength": _IMPACT_UNITS,
    "impact_strength_notched": _IMPACT_UNITS,
    "heat_deflection_045": _TEMPERATURE_UNITS,
    "heat_deflection_18": _TEMPERATURE_UNITS,
    "vicat_softening": _TEMPERATURE_UNITS,
}

_PRINT_DIRECTIONS = {"XY", "XZ", "Z"}


def _check_mechanical(data: dict, file_path: Path, base: Path) -> list[ValidationError]:
    """Every entry in a filament's ``mechanical`` array: sourced like a sustainability
    figure, a unit that fits the property, no print direction on moulded bars, and no
    repeats."""
    entries = data.get("mechanical")
    if not isinstance(entries, list):
        return []
    rel = _rel(file_path, base)
    errors: list[ValidationError] = []
    seen: dict[tuple, int] = {}
    for i, entry in enumerate(entries):
        if not isinstance(entry, dict):
            continue
        path = f"mechanical[{i}]"
        errors.extend(
            _check_sourced_entry(
                path, entry, ("value", "plus_minus"), file_path, base, kind="mechanical"
            )
        )

        prop, unit = entry.get("property"), entry.get("unit")
        allowed = _MECHANICAL_UNITS.get(prop)
        if allowed and isinstance(unit, str) and unit not in allowed:
            errors.append(
                _err(
                    ValidationLevel.Error,
                    f"{path}.unit is {unit!r}, which does not fit {prop}; use one of "
                    f"{', '.join(sorted(allowed))}, as the source writes it.",
                    rel,
                )
            )

        specimen = entry.get("specimen")
        process = specimen.get("process") if isinstance(specimen, dict) else None
        direction = entry.get("direction")
        if process == "moulded" and direction in _PRINT_DIRECTIONS:
            errors.append(
                _err(
                    ValidationLevel.Warning,
                    f"{path}.direction is {direction}, but the test bars were moulded; "
                    "moulded bars have no print direction (use unknown).",
                    rel,
                )
            )

        standard = entry.get("standard")
        standard = standard.strip() or None if isinstance(standard, str) else standard
        key = (prop, direction, entry.get("condition"), standard, unit)
        if key in seen:
            errors.append(
                _err(
                    ValidationLevel.Warning,
                    f"{path} repeats mechanical[{seen[key]}] (same property, direction, "
                    "condition, standard and unit).",
                    rel,
                )
            )
        else:
            seen[key] = i
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
                errors.extend(_check_inverted_ranges(filament_data, filament_file, base))
                errors.extend(_check_orphan_filament(filament_dir, base))
                errors.extend(_check_sustainability(filament_data, filament_file, base))
                errors.extend(_check_mechanical(filament_data, filament_file, base))

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
                    errors.extend(_check_sustainability(variant_data, variant_file, base))
                    errors.extend(
                        _check_recycled_trait(filament_data, variant_data, variant_file, base)
                    )

                    variant_name = variant_data.get("name")
                    if isinstance(variant_name, str) and variant_name:
                        variant_names.append((variant_name, variant_file))
                    variant_ids.append((variant_dir.name, variant_dir))

                    sizes_file = variant_dir / "sizes.json"
                    if sizes_file.exists():
                        sizes = _load_json(sizes_file)
                        errors.extend(_check_placeholders(sizes, sizes_file, base))
                        errors.extend(_check_duplicate_sizes(sizes, sizes_file, base))
                        errors.extend(_check_storefront_root_links(sizes, sizes_file, base))
                        errors.extend(_check_container_details(sizes, sizes_file, base))

                errors.extend(_check_sibling_casing(variant_names, base))
                errors.extend(_check_sibling_duplicates(variant_ids, base))

            errors.extend(_check_sibling_casing(filament_names, base))
            errors.extend(_check_sibling_duplicates(filament_ids, base))

    errors.extend(_check_parent_brands(data_dir, base))

    return errors
