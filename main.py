#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fetches Speedtest server information and saves the results into a dedicated
directory for each query under a 'data' folder.
"""

__author__ = "Jugal Kishore <me@devjugal.com>"

import argparse
import json
import sys
import os
import requests

SPEEDTEST_SERVERS_URL = "https://www.speedtest.net/api/js/config-sdk?engine=js&https_functional=true&limit=100&search="
BASE_DATA_DIR = "data"


def parse_args():
    """Parses command line arguments."""
    parser = argparse.ArgumentParser(
        description="Fetch Speedtest servers, creating a separate directory for each query."
    )
    parser.add_argument(
        "-s",
        "--search",
        type=str,
        required=True,
        help="Comma-separated search strings to filter servers (e.g., 'Bharti Airtel,Jio')",
    )
    return parser.parse_args()


def sanitize_name(name):
    """Sanitizes a string for use as a directory or file name."""
    return name.strip().lower().replace(" ", "-")


def main():
    """Main function to fetch server data and save it to individual directories."""
    args = parse_args()

    search_terms = [term.strip() for term in args.search.split(",") if term.strip()]

    if not search_terms:
        print("Error: Please provide at least one valid search term.")
        sys.exit(1)

    # Ensure the base data directory exists
    try:
        os.makedirs(BASE_DATA_DIR, exist_ok=True)
        print(f"INFO: Ensuring base data directory exists: '{BASE_DATA_DIR}/'")
    except OSError as e:
        print(f"ERROR: Could not create base directory '{BASE_DATA_DIR}/': {e}")
        sys.exit(1)

    for term in search_terms:
        print(f"\n--- Processing term: {term} ---")

        sanitized_term = sanitize_name(term)
        term_data_dir = os.path.join(BASE_DATA_DIR, sanitized_term)

        # Create a dedicated directory for this term
        try:
            os.makedirs(term_data_dir, exist_ok=True)
            print(f"INFO: Using directory: '{term_data_dir}/'")
        except OSError as e:
            print(f"ERROR: Could not create directory '{term_data_dir}/': {e}")
            continue

        print(f"INFO: Fetching servers for '{term}'...")
        try:
            response = requests.get(
                f"{SPEEDTEST_SERVERS_URL}{term}", timeout=30, allow_redirects=True
            )
            response.raise_for_status()
            data = response.json().get("servers", [])

            if not data:
                print(f"WARNING: No servers found for '{term}'.")
                continue

            file_path = os.path.join(term_data_dir, "servers.json")

            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=4)

            print(f"INFO: Successfully saved {len(data)} servers to '{file_path}'")

        except requests.exceptions.RequestException as e:
            print(f"ERROR: Could not fetch servers for '{term}': {e}")
        except json.JSONDecodeError:
            print(f"ERROR: Failed to decode JSON response for '{term}'.")


if __name__ == "__main__":
    main()
