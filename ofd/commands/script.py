"""
Script command - Run utility scripts.

This command dispatches to registered utility scripts that extend BaseScript.
Scripts are auto-discovered from the ofd.scripts package.
"""

import argparse
import sys
from pathlib import Path

# Add project root to path for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from ofd.base import get_script, list_scripts


def register_subcommand(subparsers: argparse._SubParsersAction) -> None:
    """Register the script subcommand."""
    parser = subparsers.add_parser(
        'script',
        help='Run utility scripts',
        description='Run utility scripts for data management and maintenance.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  ofd script --list                    List all available scripts
  ofd script style_data                 Run style_data script
  ofd script style_data --dry-run       Run style_data in dry-run mode
  ofd script style_data --help          Show help for style_data script
  ofd script load_profiles             Run load_profiles script
        """
    )

    parser.add_argument(
        '--list', '-l',
        action='store_true',
        help='List all available scripts'
    )
    parser.add_argument(
        'script_name',
        nargs='?',
        help='Name of the script to run'
    )
    parser.add_argument(
        'script_args',
        nargs=argparse.REMAINDER,
        help='Arguments to pass to the script'
    )

    parser.set_defaults(func=run_script)


def run_script(args: argparse.Namespace) -> int:
    """
    Execute the script command.

    Args:
        args: Parsed command-line arguments

    Returns:
        Exit code (0 for success, 1 for errors)
    """
    # Import scripts to register them
    # This must happen after the base module is imported
    try:
        import ofd.scripts  # noqa: F401
    except ImportError as e:
        print(f"Warning: Could not import scripts module: {e}", file=sys.stderr)

    # List available scripts
    if args.list or not args.script_name:
        scripts = list_scripts()
        if not scripts:
            print("No scripts available.")
            print("\nScripts can be added by creating classes that extend BaseScript")
            print("in the ofd/scripts/ directory and decorating them with @register_script")
            return 0

        print("Available scripts:\n")
        for name, description, key_args in scripts:
            args_str = ' '.join(f'[{a}]' for a in key_args[:3])  # Show up to 3 key args
            if len(key_args) > 3:
                args_str += ' ...'
            print(f"  {name}")
            print(f"      {description}")
            if args_str:
                print(f"      Args: {args_str}")
            print()

        print("Usage: ofd script <script_name> [options]")
        print("Use 'ofd script <script_name> --help' for script-specific options.")
        return 0

    # Get the script class
    script_class = get_script(args.script_name)
    if script_class is None:
        print(f"Error: Unknown script '{args.script_name}'", file=sys.stderr)
        print("\nUse 'ofd script --list' to see available scripts.", file=sys.stderr)
        return 1

    # Instantiate and run the script
    script = script_class()
    return script.main(args.script_args)
