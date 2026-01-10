#!/usr/bin/env python3
"""
Simple HTTP server with CORS enabled for local development.
Serves the dist directory on port 8000 by default.

Usage:
    python scripts/serve_api.py              # Serves dist/ on port 8000
    python scripts/serve_api.py -d dist/api  # Serves dist/api on port 8000
    python scripts/serve_api.py -p 3000      # Serves dist/ on port 3000
    python scripts/serve_api.py -d dist/api -p 3000
"""

import argparse
import http.server
import socketserver
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


def main():
    parser = argparse.ArgumentParser(
        description="Serve the Open Filament Database API with CORS enabled"
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

    args = parser.parse_args()

    # Resolve directory path
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    serve_dir = project_root / args.directory

    # Verify directory exists
    if not serve_dir.exists():
        print(f"Error: Directory '{serve_dir}' does not exist")
        print(f"\nRun 'python -m builder.build' first to generate the API files")
        return 1

    # Convert to absolute path
    serve_dir = serve_dir.resolve()

    # Create request handler with specified directory
    def handler(*handler_args, **handler_kwargs):
        return CORSRequestHandler(*handler_args, directory=str(serve_dir), **handler_kwargs)

    # Start server
    with socketserver.TCPServer((args.host, args.port), handler) as httpd:
        host_display = args.host if args.host else 'localhost'
        print("=" * 60)
        print("Open Filament Database - Development Server")
        print("=" * 60)
        print(f"✓ Serving directory: {serve_dir}")
        print(f"✓ Server address:    http://{host_display}:{args.port}")
        print(f"✓ CORS:              Enabled (all origins)")
        print(f"✓ Cache:             Disabled (development mode)")
        print("\nMain Endpoints:")
        print(f"  - API Root:      http://{host_display}:{args.port}/api/v1/index.json")
        print(f"  - Brands:        http://{host_display}:{args.port}/api/v1/brands/index.json")
        print(f"  - Stores:        http://{host_display}:{args.port}/api/v1/stores/index.json")
        print(f"  - Brand Logos:   http://{host_display}:{args.port}/api/v1/brands/logo/index.json")
        print(f"  - Store Logos:   http://{host_display}:{args.port}/api/v1/stores/logo/index.json")
        print(f"  - Schemas:       http://{host_display}:{args.port}/api/v1/schemas/index.json")
        print(f"  - All Data:      http://{host_display}:{args.port}/json/all.json")
        print(f"  - HTML:          http://{host_display}:{args.port}/index.html")
        print(f"\nNote: All paths match https://api.openfilamentdatabase.org/")
        print("\nPress Ctrl+C to stop")
        print("=" * 60)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nShutting down server...")
            return 0

    return 0


if __name__ == "__main__":
    exit(main())
