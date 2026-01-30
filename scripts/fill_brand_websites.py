#!/usr/bin/env python3
"""
Fill empty brand website fields using Brandfetch API.

Usage:
    python scripts/fill_brand_websites.py --dry-run  # See what would be done
    python scripts/fill_brand_websites.py --limit 5   # Process only 5 brands
    python scripts/fill_brand_websites.py             # Process all brands
"""

import json
import os
import sys
import argparse
import time
from pathlib import Path
from typing import Optional, Dict, Any

try:
    import requests
except ImportError:
    print("Error: 'requests' module not found. Install with: pip install requests")
    sys.exit(1)


def load_env_variable(name: str) -> Optional[str]:
    """Load environment variable from .env file or environment."""
    # Try environment first
    value = os.getenv(name)
    if value:
        return value

    # Try .env file
    env_file = Path(__file__).parent.parent / ".env"
    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line.startswith(f"{name}="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def generate_potential_domains(brand_name: str, brand_id: str) -> list[str]:
    """Generate potential domain names from brand name and ID."""
    domains = []

    # Use brand_id as-is (already has underscores)
    domains.append(f"{brand_id.replace('_', '')}.com")  # Remove underscores
    domains.append(f"{brand_id.replace('_', '-')}.com")  # Replace with dashes

    # Use brand name variations
    name_clean = brand_name.lower().replace(' ', '').replace('-', '').replace('_', '')
    domains.append(f"{name_clean}.com")

    # Try with dashes
    name_dash = brand_name.lower().replace(' ', '-').replace('_', '-')
    domains.append(f"{name_dash}.com")

    # Remove duplicates while preserving order
    seen = set()
    unique_domains = []
    for domain in domains:
        if domain not in seen:
            seen.add(domain)
            unique_domains.append(domain)

    return unique_domains


def fetch_brand_info(domain: str, api_key: str) -> Optional[Dict[str, Any]]:
    """Fetch brand information from Brandfetch API."""
    url = f"https://api.brandfetch.io/v2/brands/{domain}"
    headers = {"Authorization": f"Bearer {api_key}"}

    try:
        response = requests.get(url, headers=headers, timeout=10)

        if response.status_code == 200:
            return response.json()
        elif response.status_code == 404:
            return None
        else:
            print(f"  ⚠️  API error for {domain}: {response.status_code}")
            return None

    except requests.exceptions.RequestException as e:
        print(f"  ⚠️  Request error for {domain}: {e}")
        return None


def extract_website_from_response(data: Dict[str, Any]) -> Optional[str]:
    """Extract website URL from Brandfetch API response."""
    # Try to get the domain from the response
    if "domain" in data:
        domain = data["domain"]
        # Remove protocol if present
        domain = domain.replace("http://", "").replace("https://", "")
        return domain

    # Try links section
    if "links" in data:
        for link in data.get("links", []):
            if link.get("name") == "website" or link.get("type") == "website":
                url = link.get("url", "")
                # Remove protocol if present
                url = url.replace("http://", "").replace("https://", "")
                return url

    return None


def update_brand_json(brand_path: Path, website: str, dry_run: bool = False) -> bool:
    """Update brand.json file with website URL."""
    try:
        with open(brand_path, 'r') as f:
            data = json.load(f)

        data["website"] = website

        if dry_run:
            print(f"  [DRY RUN] Would update {brand_path.name} with: {website}")
            return True

        # Write with proper formatting (2-space indent, sorted keys, newline at end)
        with open(brand_path, 'w') as f:
            json.dump(data, f, indent=2, sort_keys=True, ensure_ascii=False)
            f.write('\n')  # Add newline at end of file

        print(f"  ✅ Updated {data['name']} with: {website}")
        return True

    except Exception as e:
        print(f"  ❌ Error updating {brand_path}: {e}")
        return False


def find_empty_website_brands(data_dir: Path) -> list[tuple[Path, Dict[str, Any]]]:
    """Find all brand.json files with empty website fields."""
    brands_with_empty_websites = []

    for brand_json in data_dir.glob("*/brand.json"):
        try:
            with open(brand_json, 'r') as f:
                data = json.load(f)

            if data.get("website", "").strip() == "":
                brands_with_empty_websites.append((brand_json, data))

        except Exception as e:
            print(f"⚠️  Error reading {brand_json}: {e}")

    return brands_with_empty_websites


def main():
    parser = argparse.ArgumentParser(description="Fill empty brand website fields using Brandfetch API")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without making changes")
    parser.add_argument("--limit", type=int, help="Limit number of brands to process")
    parser.add_argument("--delay", type=float, default=0.5, help="Delay between API calls in seconds (default: 0.5)")
    args = parser.parse_args()

    # Load API key
    api_key = load_env_variable("BRANDFETCH_SECRET_API_KEY")
    if not api_key:
        print("❌ Error: BRANDFETCH_SECRET_API_KEY not found in environment or .env file")
        print("   Add it to .env file: BRANDFETCH_SECRET_API_KEY=your_key_here")
        sys.exit(1)

    # Find data directory
    data_dir = Path(__file__).parent.parent / "data"
    if not data_dir.exists():
        print(f"❌ Error: Data directory not found at {data_dir}")
        sys.exit(1)

    # Find brands with empty websites
    print("🔍 Scanning for brands with empty websites...")
    brands = find_empty_website_brands(data_dir)
    print(f"📊 Found {len(brands)} brands with empty websites\n")

    if not brands:
        print("✅ All brands already have websites!")
        return

    # Apply limit if specified
    if args.limit:
        brands = brands[:args.limit]
        print(f"⚙️  Processing only first {args.limit} brands (--limit flag)\n")

    if args.dry_run:
        print("🧪 DRY RUN MODE - No changes will be made\n")

    # Process each brand
    successful = 0
    failed = 0
    api_calls = 0

    for brand_path, brand_data in brands:
        brand_name = brand_data.get("name", "Unknown")
        brand_id = brand_data.get("id", "")

        print(f"🔎 Processing: {brand_name} ({brand_id})")

        # Generate potential domains
        potential_domains = generate_potential_domains(brand_name, brand_id)
        print(f"  Trying domains: {', '.join(potential_domains[:3])}...")

        # Try each domain until we find one that works
        website_found = None
        for domain in potential_domains:
            if args.dry_run and api_calls >= 3:
                print(f"  [DRY RUN] Skipping API call for {domain}")
                continue

            api_calls += 1
            brand_info = fetch_brand_info(domain, api_key)

            if brand_info:
                website_found = extract_website_from_response(brand_info)
                if website_found:
                    print(f"  🎯 Found via {domain}")
                    break

            # Add delay to avoid rate limiting
            time.sleep(args.delay)

        if website_found:
            if update_brand_json(brand_path, website_found, dry_run=args.dry_run):
                successful += 1
            else:
                failed += 1
        else:
            print(f"  ❌ No website found for {brand_name}")
            failed += 1

        print()

    # Summary
    print("=" * 60)
    print(f"📊 Summary:")
    print(f"   ✅ Successfully updated: {successful}")
    print(f"   ❌ Failed: {failed}")
    print(f"   📡 API calls made: {api_calls}")
    print(f"   📉 Remaining quota: ~{100 - api_calls}")

    if args.dry_run:
        print(f"\n💡 This was a dry run. Use without --dry-run to make actual changes.")


if __name__ == "__main__":
    main()
