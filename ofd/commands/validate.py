"""
Validate command - Validates data files against schemas.

This command provides comprehensive validation for the Open Filament Database,
including JSON schema validation, logo validation, folder name checks, and more.
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Dict, List

from ofd.validation import (
    ValidationOrchestrator,
    ValidationResult,
    ValidationError,
)


# Project root for resolving relative paths
project_root = Path(__file__).parent.parent.parent

# ANSI colors (only when stdout is a terminal)
_color = hasattr(sys.stdout, 'isatty') and sys.stdout.isatty()

def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if _color else text

def _red(t: str) -> str: return _c("31", t)
def _green(t: str) -> str: return _c("32", t)
def _yellow(t: str) -> str: return _c("33", t)
def _cyan(t: str) -> str: return _c("36", t)
def _bold(t: str) -> str: return _c("1", t)
def _dim(t: str) -> str: return _c("2", t)


def register_subcommand(subparsers: argparse._SubParsersAction) -> None:
    """Register the validate subcommand."""
    parser = subparsers.add_parser(
        'validate',
        help='Validate data files against schemas',
        description='Validate all data files (brands, materials, filaments, variants, sizes, stores) against their JSON schemas.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  ofd validate                 Run all validations
  ofd validate --logos         Only validate logo files
  ofd validate --json-files    Only validate JSON schema compliance
  ofd validate --json          Output results as JSON
  ofd validate --progress      Emit progress events for SSE
        """
    )

    # Validation scope options
    scope_group = parser.add_argument_group('validation scope')
    scope_group.add_argument(
        '--json-files',
        action='store_true',
        help='Validate JSON files against schemas'
    )
    scope_group.add_argument(
        '--logos', '--logo-files',
        action='store_true',
        dest='logos',
        help='Validate logo files (dimensions, naming, format)'
    )
    scope_group.add_argument(
        '--folder-names',
        action='store_true',
        help='Validate folder names match JSON content'
    )
    scope_group.add_argument(
        '--store-ids',
        action='store_true',
        help='Validate store IDs in purchase links'
    )
    scope_group.add_argument(
        '--gtin',
        action='store_true',
        help='Validate GTIN/EAN fields'
    )

    # Output options
    output_group = parser.add_argument_group('output options')
    output_group.add_argument(
        '--json',
        action='store_true',
        help='Output results as JSON'
    )
    output_group.add_argument(
        '--progress',
        action='store_true',
        help='Emit progress events (for SSE streaming)'
    )

    # Directory options
    dir_group = parser.add_argument_group('directory options')
    dir_group.add_argument(
        '--data-dir',
        default='data',
        help='Data directory (default: data)'
    )
    dir_group.add_argument(
        '--stores-dir',
        default='stores',
        help='Stores directory (default: stores)'
    )

    parser.set_defaults(func=run_validate)


def run_validate(args: argparse.Namespace) -> int:
    """
    Execute the validate command.

    Args:
        args: Parsed command-line arguments

    Returns:
        Exit code (0 for success, 1 for validation errors)
    """
    # Resolve directories
    data_dir = project_root / args.data_dir
    stores_dir = project_root / args.stores_dir

    # Check directories exist
    if not data_dir.exists():
        print(f"Error: Data directory '{data_dir}' does not exist", file=sys.stderr)
        return 1
    if not stores_dir.exists():
        print(f"Error: Stores directory '{stores_dir}' does not exist", file=sys.stderr)
        return 1

    # Create orchestrator
    orchestrator = ValidationOrchestrator(
        data_dir=data_dir,
        stores_dir=stores_dir,
        max_workers=os.cpu_count(),
        progress_mode=args.progress
    )

    result = ValidationResult()

    # Determine what to validate
    specific_validations = any([
        args.json_files,
        args.logos,
        args.folder_names,
        args.store_ids,
        args.gtin,
    ])

    if not specific_validations:
        # Run all validations
        if not args.json and not args.progress:
            print(_bold("Running all validations..."))
        result = orchestrator.validate_all()
    else:
        # Run specific validations
        if args.json_files:
            result.merge(orchestrator.validate_json_files())
        if args.logos:
            result.merge(orchestrator.validate_logo_files())
        if args.folder_names:
            result.merge(orchestrator.validate_folder_names())
        if args.store_ids:
            result.merge(orchestrator.validate_store_ids())
        if args.gtin:
            result.merge(orchestrator.validate_gtin())

    # Output results
    if args.json:
        output = result.to_dict()
        if args.progress:
            print(json.dumps(output))
        else:
            print(json.dumps(output, indent=2))
        return 0 if result.is_valid else 1

    # Text output mode — print all findings, but only fail on errors
    if result.errors:
        # Group errors by category
        errors_by_category: Dict[str, List[ValidationError]] = {}
        for error in result.errors:
            if error.category not in errors_by_category:
                errors_by_category[error.category] = []
            errors_by_category[error.category].append(error)

        # Print errors grouped by category
        for category, errors in sorted(errors_by_category.items()):
            error_count = sum(1 for e in errors if e.level.value == "ERROR")
            warn_count = len(errors) - error_count
            counts = []
            if error_count:
                counts.append(_red(f"{error_count} errors"))
            if warn_count:
                counts.append(_yellow(f"{warn_count} warnings"))
            print(f"\n{_bold(category)} ({', '.join(counts)}):")
            for error in errors:
                level = error.level.value
                if level == "ERROR":
                    tag = _red("ERROR")
                else:
                    tag = _yellow("WARN ")
                path_str = f" {_dim(str(error.path))}" if error.path else ""
                print(f"  {tag}  {error.message}{path_str}")

    if not result.is_valid:
        # Summary
        parts = []
        if result.error_count:
            parts.append(_red(f"{result.error_count} errors"))
        if result.warning_count:
            parts.append(_yellow(f"{result.warning_count} warnings"))
        print(f"\n{_red('x')} Validation failed: {', '.join(parts)}")
        return 1
    else:
        if result.warning_count:
            print(f"\n{_green('+')} All validations passed ({_yellow(f'{result.warning_count} warnings')})")
        else:
            print(f"\n{_green('+')} All validations passed!")
        return 0
