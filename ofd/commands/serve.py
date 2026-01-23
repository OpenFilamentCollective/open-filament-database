"""
Serve command - Development server with CORS support.

This command starts an HTTP server to serve the built API files
with CORS headers enabled for local development.
"""

import argparse
import http.server
import socketserver
import sys
from pathlib import Path


class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP request handler with CORS headers enabled."""

    def end_headers(self):
        # Add CORS headers to allow requests from any origin
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        # Add cache control for development
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        """Handle OPTIONS requests for CORS preflight."""
        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        """Override to customize logging format."""
        # Show path without the directory prefix for cleaner logs
        print(f"[{self.log_date_time_string()}] {format % args}")


def register_subcommand(subparsers: argparse._SubParsersAction) -> None:
    """Register the serve subcommand."""
    parser = subparsers.add_parser(
        'serve',
        help='Start development server with CORS',
        description='Start an HTTP server to serve the built API files with CORS enabled.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  ofd serve                     Serve dist/ on port 8000
  ofd serve -d dist/api         Serve specific directory
  ofd serve -p 3000             Serve on port 3000
  ofd serve --host 127.0.0.1    Bind to specific host
        """
    )

    parser.add_argument(
        '-d', '--directory',
        default='dist',
        help='Directory to serve (default: dist)'
    )
    parser.add_argument(
        '-p', '--port',
        type=int,
        default=8000,
        help='Port to serve on (default: 8000)'
    )
    parser.add_argument(
        '--host',
        default='',
        help='Host to bind to (default: all interfaces)'
    )

    parser.set_defaults(func=run_serve)


def run_serve(args: argparse.Namespace) -> int:
    """
    Execute the serve command.

    Args:
        args: Parsed command-line arguments

    Returns:
        Exit code (0 for success, 1 for errors)
    """
    import errno

    # Resolve directory path
    project_root = Path(__file__).parent.parent.parent
    serve_dir = project_root / args.directory

    # Verify directory exists
    if not serve_dir.exists():
        print(f"Error: Directory '{serve_dir}' does not exist", file=sys.stderr)
        print(f"\nRun 'ofd build' first to generate the API files", file=sys.stderr)
        return 1

    # Convert to absolute path
    serve_dir = serve_dir.resolve()

    # Create request handler with specified directory
    def handler(*handler_args, **handler_kwargs):
        return CORSRequestHandler(*handler_args, directory=str(serve_dir), **handler_kwargs)

    # Try to find an available port
    max_port_attempts = 10
    port = args.port

    for attempt in range(max_port_attempts):
        try:
            with socketserver.TCPServer((args.host, port), handler) as httpd:
                host_display = args.host if args.host else 'localhost'
                print("=" * 60)
                print("Open Filament Database - Development Server")
                print("=" * 60)
                print(f"  Serving directory: {serve_dir}")
                print(f"  Server address:    http://{host_display}:{port}")
                if port != args.port:
                    print(f"  (Port {args.port} was in use, using {port} instead)")
                print(f"  CORS:              Enabled (all origins)")
                print(f"  Cache:             Disabled (development mode)")
                print("\nMain Endpoints:")
                print(f"  - API Root:      http://{host_display}:{port}/api/v1/index.json")
                print(f"  - Brands:        http://{host_display}:{port}/api/v1/brands/index.json")
                print(f"  - Stores:        http://{host_display}:{port}/api/v1/stores/index.json")
                print(f"  - Brand Logos:   http://{host_display}:{port}/api/v1/brands/logo/index.json")
                print(f"  - Store Logos:   http://{host_display}:{port}/api/v1/stores/logo/index.json")
                print(f"  - Schemas:       http://{host_display}:{port}/api/v1/schemas/index.json")
                print(f"  - All Data:      http://{host_display}:{port}/json/all.json")
                print(f"  - HTML:          http://{host_display}:{port}/index.html")
                print(f"\nNote: All paths match https://api.openfilamentdatabase.org/")
                print("\nPress Ctrl+C to stop")
                print("=" * 60)
                try:
                    httpd.serve_forever()
                except KeyboardInterrupt:
                    print("\n\nShutting down server...")
                    return 0
        except OSError as e:
            if e.errno == errno.EADDRINUSE:
                port += 1
                continue
            print(f"Error starting server: {e}", file=sys.stderr)
            return 1

    print(f"Error: Could not find an available port (tried {args.port}-{port - 1})", file=sys.stderr)
    return 1
