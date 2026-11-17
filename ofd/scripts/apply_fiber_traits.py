"""
Apply Fiber / High-Flow Traits Script.

Detects carbon-fiber (CF), glass-fiber (GF) and high-flow / high-speed (HF)
filaments from their material/filament/variant names and ensures each matching
variant carries the correct traits:

    CF  ->  contains_carbon_fiber = true, abrasive = true
    GF  ->  contains_glass_fiber  = true, abrasive = true
    HF  ->  high_flow            = true

Carbon- and glass-fiber composites are physically abrasive (they need a
hardened nozzle), so ``abrasive`` is set alongside the fibre trait. High-flow
(often marketed as "high speed") lines get the ``high_flow`` trait.

Detection is name-based and reads from, for each variant:
  - the material folder (e.g. PA6) and filament folder (e.g. cf_pla)
  - the filament.json ``id`` / ``name``
  - the variant folder and variant.json ``id`` / ``name``

so every variant under a fibre/high-flow product line is covered, plus one-off
colour variants whose own name calls out the fibre (e.g. carbon_fiber_black).

The script only ever *adds* a trait (missing or explicitly ``false`` -> ``true``);
it never removes traits and never touches variants it does not detect. Trait
keys are written in schema order, matching the ``style_data`` convention.

Usage:
    ofd script apply_fiber_traits --dry-run     # preview, change nothing
    ofd script apply_fiber_traits               # apply changes
    ofd script apply_fiber_traits --json        # machine-readable summary
"""

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ofd.base import BaseScript, ScriptResult, register_script


def load_json(path: Path) -> Any | None:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


# --- Detection ---------------------------------------------------------------
#
# The rules themselves live in ``schemas/trait_rules.json``, so this script, the
# ``fiber_trait_missing`` validator and the webui's suggestion panel
# (``webui/src/lib/utils/traitSuggestions.ts``) all read one table instead of
# three hand-synced copies. It is its own file rather than an extension of
# variant_schema.json because a rule maps a name to trait keys and says nothing
# about which entity carries them — it stays correct if traits move up to the
# filament.
#
# Text is lowercased and the pieces are joined with a non-letter separator
# before matching, so tokens can only match within a single name component.
# The bare "cf"/"gf"/"hf" tokens require non-letter boundaries (digits are
# allowed, so cf10 / gf30 / 10gf still match) to avoid matching inside words.
# Patterns must parse in both Python ``re`` and JS ``RegExp``, which is why they
# consume the preceding non-letter with ``(?:^|[^a-z])`` rather than using a
# lookbehind.

# Where a rule may be acted on. Everything is offered as a suggestion in the
# editor; only rules that are true by definition are also reported by the
# validator or written by this script.
BACKFILL = "backfill"
VALIDATE = "validate"
SUGGEST = "suggest"

SCHEMAS_DIR = Path(__file__).resolve().parents[2] / "schemas"


@dataclass(frozen=True)
class TraitRule:
    """One name-derived trait rule from ``schemas/trait_rules.json``."""

    id: str
    regex: re.Pattern[str]
    traits: tuple[str, ...]
    applies_to: frozenset[str]
    code: str | None = None

    @property
    def label(self) -> str:
        """Short name used in user-facing messages ('CF', or the rule id)."""
        return self.code or self.id


def load_trait_rules(schemas_dir: Path | None = None) -> list[TraitRule]:
    """Read the shared rule table from ``schemas/trait_rules.json``.

    Returns an empty list if the file is missing or malformed, and skips any single
    unparseable rule — detection is a convenience, and no caller should fail hard
    because of it.
    """
    doc = load_json((schemas_dir or SCHEMAS_DIR) / "trait_rules.json")
    if not isinstance(doc, dict):
        return []

    rules: list[TraitRule] = []
    for entry in doc.get("rules") or []:
        if not isinstance(entry, dict):
            continue
        pattern = entry.get("pattern")
        traits = entry.get("traits")
        rule_id = entry.get("id")
        if not (isinstance(pattern, str) and isinstance(traits, list) and isinstance(rule_id, str)):
            continue
        try:
            regex = re.compile(pattern)
        except re.error:
            continue
        rules.append(
            TraitRule(
                id=rule_id,
                regex=regex,
                traits=tuple(t for t in traits if isinstance(t, str)),
                applies_to=frozenset(entry.get("applies_to") or (SUGGEST,)),
                code=entry.get("code"),
            )
        )
    return rules


TRAIT_RULES: list[TraitRule] = load_trait_rules()

if not TRAIT_RULES:  # pragma: no cover - depends on the install layout
    # Loud on purpose. An empty table silently disables the fiber_trait_missing
    # validator and turns this script into a no-op, which looks like "the data is
    # clean" rather than "the rules are missing". SCHEMAS_DIR is resolved relative
    # to the repo, so this is what an install without the schemas/ tree looks like.
    print(
        f"WARNING: no trait rules loaded from {SCHEMAS_DIR / 'trait_rules.json'} — "
        "name-derived trait detection is disabled.",
        file=sys.stderr,
    )

# The rules this script and the validator act on: the fiber/high-flow codes that
# are true by definition. The wider suggestion-only set is the editor's business.
_ENFORCED = [r for r in TRAIT_RULES if BACKFILL in r.applies_to or VALIDATE in r.applies_to]

# Which trait(s) each detected code implies. Keyed by the rule's short label so
# messages keep reading "Name suggests CF, GF".
CODE_TRAITS: dict[str, tuple[str, ...]] = {r.label: r.traits for r in _ENFORCED}


def detect_codes(text: str) -> set[str]:
    """Return the set of enforced rule labels (e.g. {'CF','HF'}) matching the text."""
    return {r.label for r in _ENFORCED if r.regex.search(text)}


def detect_suggested_traits(text: str) -> list[str]:
    """Every trait suggested by the full rule table, de-duplicated, in rule order.

    This is the superset ``detect_codes`` narrows: it includes the appearance
    rules (silk, matte, glitter, …) that are useful as editor suggestions but too
    soft to report as validation findings or to write automatically.
    """
    keys: list[str] = []
    for rule in TRAIT_RULES:
        if SUGGEST not in rule.applies_to or not rule.regex.search(text):
            continue
        for key in rule.traits:
            if key not in keys:
                keys.append(key)
    return keys


def _norm(*parts: str) -> str:
    """Lowercase and join name parts with a non-letter separator."""
    return " / ".join(p for p in parts if p).lower()


# --- Stats -------------------------------------------------------------------


@dataclass
class Stats:
    variants_scanned: int = 0
    variants_modified: int = 0
    files_skipped: int = 0
    cf_detected: int = 0
    gf_detected: int = 0
    hf_detected: int = 0
    traits_added: dict[str, int] = field(default_factory=dict)
    flipped_from_false: int = 0

    def add_trait(self, key: str) -> None:
        self.traits_added[key] = self.traits_added.get(key, 0) + 1

    def to_dict(self) -> dict[str, Any]:
        return {
            "variants_scanned": self.variants_scanned,
            "variants_modified": self.variants_modified,
            "files_skipped": self.files_skipped,
            "cf_detected": self.cf_detected,
            "gf_detected": self.gf_detected,
            "hf_detected": self.hf_detected,
            "traits_added": dict(sorted(self.traits_added.items())),
            "flipped_from_false": self.flipped_from_false,
        }


def _trait_order(schemas_dir: Path) -> list[str]:
    """Read the trait property order from the variant schema (best effort)."""
    schema = load_json(schemas_dir / "variant_schema.json")
    try:
        return list(schema["properties"]["traits"]["properties"].keys())
    except (TypeError, KeyError):
        return []


def _variant_order(schemas_dir: Path) -> list[str]:
    """Read the top-level property order from the variant schema (best effort)."""
    schema = load_json(schemas_dir / "variant_schema.json")
    try:
        return list(schema["properties"].keys())
    except (TypeError, KeyError):
        return []


def _reorder(d: dict[str, Any], order: list[str]) -> dict[str, Any]:
    """Return a dict with keys in `order` first (when present), extras appended
    in their original order. Mirrors style_data's schema-first ordering."""
    out: dict[str, Any] = {}
    for k in order:
        if k in d:
            out[k] = d[k]
    for k in d:
        if k not in out:
            out[k] = d[k]
    return out


@register_script
class ApplyFiberTraitsScript(BaseScript):
    """Detect CF / GF / HF filaments by name and apply the matching traits."""

    name = "apply_fiber_traits"
    description = "Detect carbon-fiber (CF), glass-fiber (GF) and high-flow (HF) variants and apply their traits"

    def configure_parser(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument(
            "--dry-run", action="store_true", help="Preview changes without modifying files"
        )
        parser.add_argument(
            "--validate",
            action="store_true",
            help="Run JSON-schema validation after applying (skipped in --dry-run)",
        )

    def run(self, args: argparse.Namespace) -> ScriptResult:
        dry_run = getattr(args, "dry_run", False)
        do_validate = getattr(args, "validate", False)

        if not self.data_dir.exists():
            return ScriptResult(success=False, message=f"Data directory not found: {self.data_dir}")

        trait_order = _trait_order(self.schemas_dir)
        variant_order = _variant_order(self.schemas_dir)

        if dry_run:
            self.log("=== DRY RUN - no files will be modified ===\n")

        stats = Stats()
        changes: list[dict[str, Any]] = []

        for brand_dir in sorted(self.data_dir.iterdir()):
            if not brand_dir.is_dir():
                continue
            for material_dir in sorted(brand_dir.iterdir()):
                if not material_dir.is_dir():
                    continue
                material_name = material_dir.name
                for filament_dir in sorted(material_dir.iterdir()):
                    if not filament_dir.is_dir():
                        continue

                    fil = load_json(filament_dir / "filament.json") or {}
                    filament_text = _norm(
                        material_name,
                        filament_dir.name,
                        str(fil.get("id", "")),
                        str(fil.get("name", "")),
                    )
                    filament_codes = detect_codes(filament_text)

                    for variant_dir in sorted(filament_dir.iterdir()):
                        if not variant_dir.is_dir():
                            continue
                        variant_file = variant_dir / "variant.json"
                        if not variant_file.exists():
                            continue
                        self._process_variant(
                            variant_file,
                            variant_dir,
                            filament_codes,
                            filament_text,
                            trait_order,
                            variant_order,
                            dry_run,
                            stats,
                            changes,
                        )

        self._report(stats, changes, dry_run)

        result_data: dict[str, Any] = {"dry_run": dry_run, "stats": stats.to_dict()}

        # Optional post-apply validation (schema check for the new high_flow trait, etc.)
        if do_validate and not dry_run:
            self.log("\nValidating JSON files against schemas...")
            try:
                from ofd.validation import ValidationOrchestrator

                res = ValidationOrchestrator(self.data_dir, self.stores_dir).validate_json_files()
                result_data["validation"] = {
                    "is_valid": res.is_valid,
                    "error_count": res.error_count,
                }
                if res.is_valid:
                    self.log("Validation passed!")
                else:
                    self.log(f"Validation FAILED: {res.error_count} error(s)")
                    for e in (res.errors or [])[:20]:
                        self.log(f"  {e}")
                    return ScriptResult(
                        success=False,
                        message=f"Applied traits but validation failed: {res.error_count} errors",
                        data=result_data,
                    )
            except Exception as e:  # pragma: no cover - validation is best-effort
                self.log(f"Could not run validation: {e}")

        return ScriptResult(
            success=True,
            message=(
                f"{'Would modify' if dry_run else 'Modified'} {stats.variants_modified} variant(s)"
            ),
            data=result_data,
        )

    def _process_variant(
        self,
        variant_file: Path,
        variant_dir: Path,
        filament_codes: set[str],
        filament_text: str,
        trait_order: list[str],
        variant_order: list[str],
        dry_run: bool,
        stats: Stats,
        changes: list[dict[str, Any]],
    ) -> None:
        data = load_json(variant_file)
        if not isinstance(data, dict):
            stats.files_skipped += 1
            return

        stats.variants_scanned += 1

        variant_text = _norm(variant_dir.name, str(data.get("id", "")), str(data.get("name", "")))
        codes = filament_codes | detect_codes(variant_text)
        if not codes:
            return

        if "CF" in codes:
            stats.cf_detected += 1
        if "GF" in codes:
            stats.gf_detected += 1
        if "HF" in codes:
            stats.hf_detected += 1

        # Traits this variant should have set to true.
        wanted: set[str] = set()
        for code in codes:
            wanted.update(CODE_TRAITS[code])

        traits = data.get("traits")
        if not isinstance(traits, dict):
            traits = {}

        added: list[str] = []
        for key in wanted:
            if traits.get(key) is not True:
                if traits.get(key) is False:
                    stats.flipped_from_false += 1
                traits[key] = True
                added.append(key)
                stats.add_trait(key)

        if not added:
            return

        # Write traits in schema order, then re-key the whole variant in schema order.
        data["traits"] = _reorder(traits, trait_order)
        new_data = _reorder(data, variant_order)

        stats.variants_modified += 1
        rel = variant_file.relative_to(self.project_root)
        changes.append({"path": str(rel), "codes": sorted(codes), "traits_added": sorted(added)})
        verb = "Would add" if dry_run else "Added"
        self.log(f"  {verb} [{'+'.join(sorted(added))}] -> {rel}")

        if not dry_run:
            with open(variant_file, "w", encoding="utf-8") as f:
                json.dump(new_data, f, indent=2, ensure_ascii=False)
                f.write("\n")

    def _report(self, stats: Stats, changes: list[dict[str, Any]], dry_run: bool) -> None:
        self.log(f"\n{'=' * 60}")
        self.log("DRY RUN SUMMARY" if dry_run else "SUMMARY")
        self.log("=" * 60)
        self.log(f"Variants scanned:  {stats.variants_scanned}")
        self.log(
            f"Detected  CF/GF/HF: {stats.cf_detected} / {stats.gf_detected} / {stats.hf_detected}"
        )
        self.log(f"Variants {'to modify' if dry_run else 'modified'}: {stats.variants_modified}")
        if stats.flipped_from_false:
            self.log(f"Traits flipped false->true: {stats.flipped_from_false}")
        if stats.traits_added:
            self.log("Traits added:")
            for key, n in sorted(stats.traits_added.items()):
                self.log(f"  {key}: {n}")
        if stats.files_skipped:
            self.log(f"Files skipped (unreadable): {stats.files_skipped}")
        self.log("\nDone!")
