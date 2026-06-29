#!/usr/bin/env python3
# SPDX-License-Identifier: CC0-1.0
# This file is released into the public domain under the CC0 1.0 Universal license.
"""
Download EVE Online SDE (JSONL format) and extract only the map files needed.
Skips download if the locally cached build number matches the latest.

Output: public/data/mapSolarSystems.jsonl, public/data/mapStargates.jsonl
"""

import urllib.request
import zipfile
import io
import json
import os

SDE_VERSION_URL = "https://developers.eveonline.com/static-data/tranquility/latest.jsonl"
SDE_URL = "https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip"
TARGET_FILES = {"mapSolarSystems.jsonl", "mapStargates.jsonl", "mapRegions.jsonl"}
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "data")
VERSION_FILE = os.path.join(OUTPUT_DIR, "sde_version.json")


def fetch_latest_build():
    with urllib.request.urlopen(SDE_VERSION_URL, timeout=10) as resp:
        for line in resp.read().decode().splitlines():
            entry = json.loads(line)
            if entry.get("_key") == "sde":
                return str(entry["buildNumber"])
    raise RuntimeError("Could not find sde build number in latest.jsonl")


def load_cached_build():
    if os.path.exists(VERSION_FILE):
        with open(VERSION_FILE) as f:
            return json.load(f).get("buildNumber")
    return None


def save_cached_build(build):
    with open(VERSION_FILE, "w") as f:
        json.dump({"buildNumber": build}, f)


def download_and_extract(build):
    print(f"Downloading SDE build {build} ...")
    with urllib.request.urlopen(SDE_URL, timeout=300) as response:
        total = response.headers.get("Content-Length")
        data = bytearray()
        chunk_size = 1024 * 256
        downloaded = 0
        while True:
            chunk = response.read(chunk_size)
            if not chunk:
                break
            data.extend(chunk)
            downloaded += len(chunk)
            if total:
                pct = downloaded / int(total) * 100
                print(f"\r  {downloaded // 1024 // 1024} MB / {int(total) // 1024 // 1024} MB ({pct:.1f}%)", end="", flush=True)
    print("\nDownload complete.")

    print("Extracting required files...")
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for name in zf.namelist():
            basename = os.path.basename(name)
            if basename in TARGET_FILES:
                out_path = os.path.join(OUTPUT_DIR, basename)
                with zf.open(name) as src, open(out_path, "wb") as dst:
                    dst.write(src.read())
                print(f"  Extracted: {basename}")


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("Checking latest SDE build number...")
    latest = fetch_latest_build()
    cached = load_cached_build()

    files_present = all(
        os.path.exists(os.path.join(OUTPUT_DIR, f)) for f in TARGET_FILES
    )
    if cached == latest and files_present:
        print(f"SDE is up to date (build {latest}). Nothing to do.")
        return

    if cached:
        print(f"New SDE build available: {cached} → {latest}")
    else:
        print(f"No cached SDE found. Downloading build {latest}.")

    download_and_extract(latest)
    save_cached_build(latest)
    print("Done.")


if __name__ == "__main__":
    main()
