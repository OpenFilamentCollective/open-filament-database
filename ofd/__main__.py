#!/usr/bin/env python3
"""
Open Filament Database CLI

Unified command-line interface for the Open Filament Database project.

Usage:
    uv run -m ofd <command> [options]
    python -m ofd <command> [options]

Commands:
    validate    - Validate data files against schemas
    build       - Build database exports (JSON, SQLite, CSV, API)
    serve       - Start development server with CORS
    script      - Run utility scripts (style_data, etc.)

Examples:
    uv run -m ofd validate                    # Run all validations
    uv run -m ofd validate --logos            # Only validate logos
    uv run -m ofd build                       # Build all exports
    uv run -m ofd serve                       # Start dev server on port 8000
    uv run -m ofd script style_data --dry-run  # Preview style_data changes
"""

import argparse
import sys
from pathlib import Path

# Ensure project root is in path for imports
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from ofd.commands import validate, build, serve, script, webui


class CommandHelpFormatter(argparse.RawDescriptionHelpFormatter):
    """Custom formatter that shows command descriptions in a cleaner format."""

    def _metavar_formatter(self, action, default_metavar):
        if action.metavar is not None:
            result = action.metavar
        elif action.choices is not None:
            result = '{' + ','.join(action.choices) + '}'
        else:
            result = default_metavar
        def format(tuple_size):
            if isinstance(result, tuple):
                return result
            else:
                return (result,) * tuple_size
        return format


def create_parser() -> argparse.ArgumentParser:
    """Create the main argument parser with subcommands."""
    parser = argparse.ArgumentParser(
        prog="ofd",
        description="Open Filament Database CLI - Unified tooling for the OFD project",
        formatter_class=CommandHelpFormatter,
        epilog="""
Command Details:
  validate   [--json-files] [--logos] [--folder-names] [--store-ids] [--gtin]
  build      [-o DIR] [--skip-json] [--skip-sqlite] [--skip-csv] [--skip-api]
  serve      [-d DIR] [-p PORT] [--host HOST]
  script     [--list] <script_name> [script_args...]
  webui      [-p PORT] [--host HOST] [--open] [--install]

Examples:
  ofd validate                     Run all data validations
  ofd validate --logos             Only validate logo files
  ofd build                        Build all database exports
  ofd build --skip-sqlite          Build without SQLite export
  ofd serve                        Start development server on port 8000
  ofd serve -p 3000                Start server on port 3000
  ofd script --list                List available utility scripts
  ofd script style_data --dry-run  Preview sorting changes
  ofd webui                        Start the WebUI on port 5173
  ofd webui --open                 Start WebUI and open browser
        """
    )

    parser.add_argument(
        '--version', '-V',
        action='version',
        version='%(prog)s 1.0.0'
    )

    subparsers = parser.add_subparsers(
        title='commands',
        dest='command',
        required=True,
        metavar='<command>'
    )

    # Register all subcommands
    validate.register_subcommand(subparsers)
    build.register_subcommand(subparsers)
    serve.register_subcommand(subparsers)
    script.register_subcommand(subparsers)
    webui.register_subcommand(subparsers)

    return parser


def main(argv: list[str] | None = None) -> int:
    """
    Main entry point for the CLI.

    Args:
        argv: Command-line arguments (defaults to sys.argv[1:])

    Returns:
        Exit code (0 for success, non-zero for failure)
    """
    parser = create_parser()
    args = parser.parse_args(argv)

    # Dispatch to the appropriate command handler
    if hasattr(args, 'func'):
        return args.func(args)
    else:
        parser.print_help()
        return 1


if __name__ == '__main__':
    sys.exit(main())
