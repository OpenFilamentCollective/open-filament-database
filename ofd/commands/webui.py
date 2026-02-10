"""
WebUI command - Start the WebUI development server.

This command runs `npm run dev` in the webui directory to start
the SvelteKit development server for editing the filament database.
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent.parent


def register_subcommand(subparsers: argparse._SubParsersAction) -> None:
    """Register the webui subcommand."""
    parser = subparsers.add_parser(
        'webui',
        help='Start the WebUI development server',
        description='Start the SvelteKit development server for the WebUI.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  ofd webui                 Start the WebUI dev server
  ofd webui --port 3000     Start on a custom port
  ofd webui --host 0.0.0.0  Bind to all interfaces
  ofd webui --open          Open browser automatically
  ofd webui --install       Run npm ci before starting
        """
    )

    parser.add_argument(
        '-p', '--port',
        type=int,
        default=5173,
        help='Port to serve on (default: 5173)'
    )
    parser.add_argument(
        '--host',
        default='localhost',
        help='Host to bind to (default: localhost)'
    )
    parser.add_argument(
        '--open',
        action='store_true',
        help='Open browser automatically'
    )
    parser.add_argument(
        '--install',
        action='store_true',
        help='Run npm ci before starting the server'
    )

    parser.set_defaults(func=run_webui)


def get_npm_cmd() -> list[str]:
    """Get the npm command that works on the current platform.

    On Windows, npm is a .cmd file that requires either shell=True or
    explicit path resolution. We find and return the full path to avoid
    using shell=True for security.

    Returns:
        List containing the npm command (may be path to npm.cmd on Windows)
    """
    npm_path = shutil.which('npm')
    if npm_path:
        return [npm_path]
    return ['npm']  # Fallback, will fail if npm not found


def check_npm() -> bool:
    """Check if npm is available."""
    return shutil.which('npm') is not None


def check_node_modules() -> bool:
    """Check if node_modules exists in webui directory."""
    webui_dir = project_root / 'webui'
    return (webui_dir / 'node_modules').exists()


def run_npm_ci(webui_dir: Path) -> int:
    """Run npm ci in the webui directory."""
    print("Installing Node.js dependencies...")
    result = subprocess.run(
        get_npm_cmd() + ['ci'],
        cwd=webui_dir,
    )
    return result.returncode


def run_webui(args: argparse.Namespace) -> int:
    """
    Execute the webui command.

    Args:
        args: Parsed command-line arguments

    Returns:
        Exit code (0 for success, 1 for errors)
    """
    webui_dir = project_root / 'webui'

    # Check webui directory exists
    if not webui_dir.exists():
        print(f"Error: WebUI directory '{webui_dir}' does not exist", file=sys.stderr)
        return 1

    # Check npm is available
    if not check_npm():
        print("Error: npm is not installed or not in PATH", file=sys.stderr)
        print("\nPlease install Node.js from: https://nodejs.org/", file=sys.stderr)
        print("Or see: docs/installing-software.md", file=sys.stderr)
        return 1

    # Install dependencies if requested or if node_modules doesn't exist
    node_modules_exists = check_node_modules()
    if args.install or not node_modules_exists:
        if not node_modules_exists:
            print("Node modules not found, running npm ci...")
        exit_code = run_npm_ci(webui_dir)
        if exit_code != 0:
            print("Error: npm ci failed", file=sys.stderr)
            return exit_code

    # Build the vite dev command
    # The '--' tells npm to pass subsequent arguments to the underlying script
    cmd = get_npm_cmd() + ['run', 'dev', '--']

    # Add port if not default
    if args.port != 5173:
        cmd.extend(['--port', str(args.port)])

    # Add host
    cmd.extend(['--host', args.host])

    # Add open flag
    if args.open:
        cmd.append('--open')

    print("=" * 60)
    print("Open Filament Database - WebUI Development Server")
    print("=" * 60)
    print(f"  Starting server at: http://{args.host}:{args.port}")
    print("  Press Ctrl+C to stop")
    print("=" * 60)

    try:
        result = subprocess.run(
            cmd,
            cwd=webui_dir,
        )
        return result.returncode
    except KeyboardInterrupt:
        print("\n\nShutting down WebUI server...")
        return 0
