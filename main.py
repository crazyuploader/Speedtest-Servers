#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fetches Speedtest server information and saves the results into a dedicated
directory for each query under a 'data' folder.
"""

__author__ = "Jugal Kishore <me@devjugal.com>"

import argparse
from datetime import datetime, timezone
import json
import sys
import os
import jc
import requests

# Global Variable(s)
BASE_DATA_DIR = "data"
API_DNS_ENDPOINT = "https://api.devjugal.com/dns?hostname="
SPEEDTEST_SERVERS_URL = (
    "https://www.speedtest.net/api/js/config-sdk?engine=js&limit=100&search="
)


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


def resolve_hostname(hostname):
    """Resolves a hostname to its IP address."""
    answer = {}
    ipv4 = ""
    ipv6 = ""
    try:
        url = API_DNS_ENDPOINT + hostname + "&record_type=A"
        data = requests.get(url, timeout=10)
        data.raise_for_status()
        ipv4 = data.json().get("result")
    except requests.exceptions.RequestException:
        pass
    except json.JSONDecodeError:
        pass

    try:
        url = API_DNS_ENDPOINT + hostname + "&record_type=AAAA"
        data = requests.get(url, timeout=10)
        data.raise_for_status()
        ipv6 = data.json().get("result")
    except requests.exceptions.RequestException:
        pass
    except json.JSONDecodeError:
        pass
    if ipv4:
        answer["A"] = ipv4
    if ipv6:
        answer["AAAA"] = ipv6
    if not ipv4 and ipv6:
        return None
    return answer


def sanitize_name(name):
    """Sanitizes a string for use as a directory or file name."""
    return name.strip().lower().replace(" ", "-")


def main():
    """Main function to fetch server data and save it to individual directories."""
    args = parse_args()

    # Each entry is pipe-separated; within an entry, comma separates search term from optional country filter
    raw_entries = [e.strip() for e in args.search.split("|") if e.strip()]
    search_entries = []
    for entry in raw_entries:
        parts = [p.strip() for p in entry.split(",", 1)]
        term = parts[0]
        country_filter = parts[1] if len(parts) > 1 else None
        if term:
            search_entries.append((term, country_filter))

    if not search_entries:
        print("Error: Please provide at least one valid search term.")
        sys.exit(1)

    # Ensure the base data directory exists
    try:
        os.makedirs(BASE_DATA_DIR, exist_ok=True)
        print(f"INFO: Ensuring base data directory exists: '{BASE_DATA_DIR}/'")
    except OSError as e:
        print(f"ERROR: Could not create base directory '{BASE_DATA_DIR}/': {e}")
        sys.exit(1)

    try:
        for term, country_filter in search_entries:
            label = f"{term.title()}" + (f" (country: {country_filter})" if country_filter else "")
            print(f"\n--- Processing: {label} ---")

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
                data = {}
                servers_data = response.json().get("servers", [])

                if not servers_data:
                    print(f"WARNING: No servers found for '{term}'.")
                    continue

                if country_filter:
                    cf = country_filter.lower()
                    before = len(servers_data)
                    servers_data = [
                        s for s in servers_data
                        if s.get("country", "").lower() == cf
                        or s.get("cc", "").lower() == cf
                    ]
                    print(f"INFO: Country filter '{country_filter}': {before} → {len(servers_data)} servers")
                    if not servers_data:
                        print(f"WARNING: No servers remain after country filter for '{term}'.")
                        continue

                for server in servers_data:
                    server.pop("distance", None)
                    hostname = jc.parse("url", server.get("url", "")).get("hostname", None)
                    if hostname:
                        server["hostname"] = hostname
                        ip_address = resolve_hostname(hostname) or {}
                        server["ip_address"] = ip_address
                        server["ipv6_capable"] = "yes" if ip_address.get("AAAA") else "no"

                # Sort servers alphabetically by the 'name' key (City Name)
                servers_data.sort(key=lambda s: s.get("name", "").lower())

                current_time = datetime.now(timezone.utc).astimezone().isoformat()
                data = {
                    "servers": servers_data,
                    "total_servers": len(servers_data),
                    "updated_at": current_time,
                }

                file_path = os.path.join(term_data_dir, "servers.json")

                with open(file_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=4)

                print(
                    f"INFO: Successfully saved {len(servers_data)} servers to '{file_path}'"
                )
                print(f"\nSummary for '{term.title()}':")
                for i, server in enumerate(servers_data, 1):
                    print(f"{i}. {server.get('name')} - IPv6: {server['ipv6_capable']}")

            except requests.exceptions.RequestException as e:
                print(f"ERROR: Could not fetch servers for '{term}': {e}")
            except json.JSONDecodeError:
                print(f"ERROR: Failed to decode JSON response for '{term}'.")
    finally:
        update_isp_list()


def update_isp_list():
    """Updates the isps.json file with all directories in BASE_DATA_DIR that contain servers.json."""
    print("\n--- Updating ISP list ---")
    try:
        os.makedirs(BASE_DATA_DIR, exist_ok=True)
        isp_dirs = sorted(
            d
            for d in os.listdir(BASE_DATA_DIR)
            if os.path.isdir(os.path.join(BASE_DATA_DIR, d))
            and os.path.isfile(os.path.join(BASE_DATA_DIR, d, "servers.json"))
        )
        file_path = os.path.join(BASE_DATA_DIR, "isps.json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(isp_dirs, f, ensure_ascii=False, indent=4)
        print(f"INFO: Successfully updated '{file_path}' with {len(isp_dirs)} ISPs")
    except (OSError, TypeError, ValueError) as e:
        print(f"ERROR: Could not update ISP list: {e}")


if __name__ == "__main__":
    main()
