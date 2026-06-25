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
import os
import random
import re
import sys
import time
import jc
import requests

# Global Variable(s)
BASE_DATA_DIR = "data"
SERVER_DATA_MARKDOWN = "SERVER_DATA.md"
API_DNS_ENDPOINT = "https://api.devjugal.com/dns?hostname="
SPEEDTEST_SERVERS_URL = (
    "https://www.speedtest.net/api/js/config-sdk?engine=js&limit=100&search="
)
REQUEST_DELAY_RANGE_SECONDS = (0.5, 1.5)


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


def normalize_isp_name(name):
    """Normalizes ISP names for generated markdown output."""
    special_cases = {
        "GMEDIA": "GMedia",
        "nusanet": "Nusanet",
        "Firstmedia": "FirstMedia",
        "MetfonePNP": "Metfone PNP",
        "CelcomDigi Berhad": "CelcomDigi Berhad",
        "CitraNet": "CitraNet",
        "FarEasTone Telecom": "FarEasTone Telecom",
        "fdcservers.net": "fdcservers.net",
        "GlobalXtreme": "GlobalXtreme",
        "SCTV Co.,Ltd": "SCTV Co., Ltd",
        "ORANGE FRANCE": "Orange France",
        "BHARAT SANCHAR NIGAM LTD": "Bharat Sanchar Nigam Ltd",
        "HATHWAY CABLE & DATACOM LTD.": "Hathway Cable & Datacom Ltd.",
        "ACT FIBERNET": "ACT Fibernet",
        "MyRepublic Indonesia": "MyRepublic Indonesia",
        "OneBroadband": "OneBroadband",
        "Powergrid Corporation of India Ltd": "Powergrid Corporation of India Ltd",
        "PT Indosat Tbk": "Indosat",
        "PT Smartfren": "Smartfren",
        "PT. Mora Telematika Indonesia": "Mora Telematika Indonesia",
        "PT. Aplikanusa Lintasarta": "Aplikanusa Lintasarta",
        "PT. Biznet Gio Nusantara": "Biznet Gio Nusantara",
        "RailTel Corporation of India Ltd": "RailTel Corporation of India Ltd",
        "Saudi Telecom Company (STC)": "STC",
        "SIMBA Telecom": "SIMBA Telecom",
        "SPTEL PTE. LTD.": "SPTEL Pte. Ltd.",
        "TrueMove H": "TrueMove H",
        "U Mobile Sdn Bhd": "U Mobile",
        "Unified National Networks (UNN) Sdn Bhd": "Unified National Networks (UNN)",
        "TELUS Mobility": "TELUS Mobility",
        "VNPT-NET": "VNPT-NET",
        "Yes SEATEL": "Yes SEATEL",
        "KPN B.V.": "KPN",
        "Digi (RCS & RDS)": "Digi",
        "M1 Limited": "M1",
        "Vodafone UK": "Vodafone UK",
        "ViewQwest": "ViewQwest",
        "FPT Telecom": "FPT Telecom",
        "CMC Telecom": "CMC Telecom",
        "CBN": "CBN",
        "AIS": "AIS",
        "AIS Fibre": "AIS Fibre",
        "DITO": "DITO",
        "SINET": "SINET",
        "IZZI": "Izzi",
        "NOS": "NOS",
        "MEO": "MEO",
        "BT": "BT",
    }
    if name in special_cases:
        return special_cases[name]

    words = []
    for word in name.split():
        bare = re.sub(r"[^A-Za-z0-9&.+-]", "", word)
        if bare.isupper() and len(bare) <= 5:
            words.append(word.upper())
            continue
        words.append(word[:1].upper() + word[1:].lower())
    return " ".join(words)


def format_isp_name(slug, servers):
    """Formats an ISP display name from server data, falling back to the slug."""
    if servers:
        sponsor = servers[0].get("sponsor", "").strip()
        if sponsor:
            return normalize_isp_name(sponsor)
    return normalize_isp_name(slug.replace("-", " ").title())


def update_server_data_markdown():
    """Generates a markdown index of all ISP server JSON files."""
    print("\n--- Updating server data markdown ---")
    try:
        entries = []
        for slug in sorted(
            d
            for d in os.listdir(BASE_DATA_DIR)
            if os.path.isdir(os.path.join(BASE_DATA_DIR, d))
            and os.path.isfile(os.path.join(BASE_DATA_DIR, d, "servers.json"))
        ):
            file_path = os.path.join(BASE_DATA_DIR, slug, "servers.json")
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            name = format_isp_name(slug, data.get("servers", []))
            entries.append((name, f"data/{slug}/servers.json"))

        entries.sort(key=lambda entry: entry[0].lower())

        lines = [
            "# Server Data",
            "",
            "This file is auto-generated from the JSON files in `data/`.",
            "",
        ]
        lines.extend(f"- [{name}]({path})" for name, path in entries)
        lines.append("")

        with open(SERVER_DATA_MARKDOWN, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

        print(
            f"INFO: Successfully updated '{SERVER_DATA_MARKDOWN}' with {len(entries)} ISPs"
        )
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as e:
        print(f"ERROR: Could not update server data markdown: {e}")


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
        for index, (term, country_filter) in enumerate(search_entries):
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
                if index > 0:
                    delay = random.uniform(*REQUEST_DELAY_RANGE_SECONDS)
                    print(f"INFO: Sleeping {delay:.2f}s before next API request...")
                    time.sleep(delay)

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
        update_server_data_markdown()


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
