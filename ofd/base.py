"""
Base classes for OFD CLI scripts.

This module provides a base class that all utility scripts should inherit from.
It standardizes argument parsing, execution, and output formatting.
"""

import argparse
import json
import sys
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional


@dataclass
class ScriptResult:
    """Result from running a script."""
    success: bool = True
    message: str = ""
    data: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'success': self.success,
            'message': self.message,
            **self.data
        }


class BaseScript(ABC):
    """
    Base class for OFD utility scripts.

    Subclasses should implement:
        - name: The script name (used in CLI)
        - description: Short description of what the script does
        - configure_parser(): Add script-specific arguments
        - run(): Execute the script logic

    Example:
        class MyScript(BaseScript):
            name = "my_script"
            description = "Does something useful"

            def configure_parser(self, parser: argparse.ArgumentParser) -> None:
                parser.add_argument('--my-arg', help='My argument')

            def run(self, args: argparse.Namespace) -> ScriptResult:
                # Do work here
                return ScriptResult(success=True, message="Done!")
    """

    # Subclasses should override these
    name: str = "base"
    description: str = "Base script class"

    def __init__(self, project_root: Optional[Path] = None):
        """
        Initialize the script.

        Args:
            project_root: Root directory of the project. If None, determined automatically.
        """
        if project_root is None:
            # Determine project root relative to this file
            self.project_root = Path(__file__).parent.parent
        else:
            self.project_root = project_root

        self.data_dir = self.project_root / "data"
        self.stores_dir = self.project_root / "stores"
        self.schemas_dir = self.project_root / "schemas"

        # Output mode flags
        self.json_mode = False
        self.progress_mode = False

    def get_parser(self) -> argparse.ArgumentParser:
        """Create and configure the argument parser."""
        parser = argparse.ArgumentParser(
            prog=f"ofd script {self.name}",
            description=self.description
        )

        # Add common arguments
        parser.add_argument(
            '--json',
            action='store_true',
            help='Output results as JSON'
        )
        parser.add_argument(
            '--progress',
            action='store_true',
            help='Emit progress events for SSE streaming'
        )

        # Let subclass add its own arguments
        self.configure_parser(parser)

        return parser

    @abstractmethod
    def configure_parser(self, parser: argparse.ArgumentParser) -> None:
        """
        Add script-specific arguments to the parser.

        Args:
            parser: The argument parser to configure
        """
        pass

    @abstractmethod
    def run(self, args: argparse.Namespace) -> ScriptResult:
        """
        Execute the script logic.

        Args:
            args: Parsed command-line arguments

        Returns:
            ScriptResult indicating success/failure and any output data
        """
        pass

    def emit_progress(self, stage: str, percent: int, message: str = '') -> None:
        """
        Emit a progress event for SSE streaming.

        Args:
            stage: Current stage identifier
            percent: Progress percentage (0-100)
            message: Optional status message
        """
        if self.progress_mode and hasattr(sys.stdout, 'isatty') and not sys.stdout.isatty():
            print(json.dumps({
                'type': 'progress',
                'stage': stage,
                'percent': percent,
                'message': message
            }), flush=True)

    def log(self, message: str) -> None:
        """
        Log a message (respects json_mode).

        Args:
            message: Message to log
        """
        if not self.json_mode:
            print(message)

    def main(self, argv: Optional[list[str]] = None) -> int:
        """
        Main entry point for the script.

        Args:
            argv: Command-line arguments (defaults to sys.argv[1:])

        Returns:
            Exit code (0 for success, non-zero for failure)
        """
        parser = self.get_parser()
        args = parser.parse_args(argv)

        # Set output modes
        self.json_mode = getattr(args, 'json', False)
        self.progress_mode = getattr(args, 'progress', False)

        try:
            result = self.run(args)
        except Exception as e:
            result = ScriptResult(
                success=False,
                message=f"Script failed with error: {str(e)}"
            )

        # Output result
        if self.json_mode:
            output = result.to_dict()
            if self.progress_mode:
                print(json.dumps(output))
            else:
                print(json.dumps(output, indent=2))
        elif not result.success:
            print(f"Error: {result.message}", file=sys.stderr)

        return 0 if result.success else 1


# Registry of available scripts
_script_registry: dict[str, type[BaseScript]] = {}


def register_script(script_class: type[BaseScript]) -> type[BaseScript]:
    """
    Decorator to register a script class.

    Usage:
        @register_script
        class MyScript(BaseScript):
            name = "my_script"
            ...
    """
    _script_registry[script_class.name] = script_class
    return script_class


def get_script(name: str) -> Optional[type[BaseScript]]:
    """Get a registered script class by name."""
    return _script_registry.get(name)


def list_scripts() -> list[tuple[str, str, list[str]]]:
    """
    List all registered scripts with their descriptions and key arguments.

    Returns:
        List of tuples: (name, description, key_args)
    """
    result = []
    for name, cls in sorted(_script_registry.items()):
        # Get key arguments by instantiating and checking the parser
        script = cls()
        parser = script.get_parser()

        # Extract non-common arguments (skip --json, --progress, -h)
        key_args = []
        for action in parser._actions:
            if action.dest in ('help', 'json', 'progress'):
                continue
            if action.option_strings:
                # Use the long form if available
                opt = action.option_strings[-1]
                key_args.append(opt)

        result.append((name, cls.description, key_args))

    return result
