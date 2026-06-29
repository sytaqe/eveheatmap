#!/usr/bin/env python3
# SPDX-License-Identifier: CC0-1.0
# This file is released into the public domain under the CC0 1.0 Universal license.
"""
Fetch system kill and jump stats from ESI and save to public/data/kills/.

Usage:
  python fetch_kills.py          # run once
  python fetch_kills.py --loop   # run every hour indefinitely
"""

import urllib.request
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta

ESI_BASE = "https://esi.evetech.net/latest/universe"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "data", "kills")
INDEX_FILE = os.path.join(OUTPUT_DIR, "index.json")
HOURLY_AVG_FILE = os.path.join(OUTPUT_DIR, "hourly_avg.json")
RETENTION_DAYS = 7


def fetch_json(url):
    with urllib.request.urlopen(url, timeout=30) as resp:
        return json.loads(resp.read())


def fetch_data():
    kills_raw = fetch_json(f"{ESI_BASE}/system_kills/?datasource=tranquility")
    jumps_raw = fetch_json(f"{ESI_BASE}/system_jumps/?datasource=tranquility")

    jumps = {str(e["system_id"]): e.get("ship_jumps", 0) for e in jumps_raw}

    result = {}
    for entry in kills_raw:
        sid = str(entry["system_id"])
        rec = {}
        for key, val in [
            ("s", entry.get("ship_kills", 0)),
            ("p", entry.get("pod_kills", 0)),
            ("n", entry.get("npc_kills", 0)),
            ("j", jumps.pop(sid, 0)),
        ]:
            if val:
                rec[key] = val
        if rec:
            result[sid] = rec
    # Systems with jumps but no kills
    for sid, j in jumps.items():
        if j:
            result[sid] = {"j": j}

    return result


def load_index():
    if os.path.exists(INDEX_FILE):
        with open(INDEX_FILE) as f:
            return json.load(f)
    return []


def save_index(index):
    with open(INDEX_FILE, "w") as f:
        json.dump(index, f)


def update_hourly_avg(index):
    sums = {}   # hour -> sid -> {s, p, n, j}
    counts = {} # hour -> sid -> int

    for entry in index:
        hour = datetime.fromisoformat(entry["timestamp"]).hour
        filepath = os.path.join(OUTPUT_DIR, entry["filename"])
        if not os.path.exists(filepath):
            continue
        with open(filepath) as f:
            data = json.load(f)
        for sid, v in data.items():
            sums.setdefault(hour, {}).setdefault(sid, {"s": 0, "p": 0, "n": 0, "j": 0})
            counts.setdefault(hour, {}).setdefault(sid, 0)
            sums[hour][sid]["s"] += v.get("s", 0)
            sums[hour][sid]["p"] += v.get("p", 0)
            sums[hour][sid]["n"] += v.get("n", 0)
            sums[hour][sid]["j"] += v.get("j", 0)
            counts[hour][sid] += 1

    result = {}
    for hour, systems in sums.items():
        result[str(hour)] = {
            sid: {k: v / counts[hour][sid] for k, v in vals.items()}
            for sid, vals in systems.items()
        }

    with open(HOURLY_AVG_FILE, "w") as f:
        json.dump(result, f)
    print(f"  Updated hourly_avg.json ({len(result)} hours)")


def run_once():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    now = datetime.now(timezone.utc)
    timestamp = now.strftime("%Y%m%d_%H%M")
    filename = f"kills_{timestamp}.json"
    out_path = os.path.join(OUTPUT_DIR, filename)

    print(f"[{now.isoformat()}] Fetching system kills and jumps...")
    try:
        data = fetch_data()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return

    with open(out_path, "w") as f:
        json.dump(data, f)
    print(f"  Saved {len(data)} systems → {filename}")

    index = load_index()
    index.append({"timestamp": now.isoformat(), "filename": filename})
    cutoff = now - timedelta(days=RETENTION_DAYS) + timedelta(seconds=10)
    kept = []
    for entry in index:
        ts = datetime.fromisoformat(entry["timestamp"])
        if ts >= cutoff:
            kept.append(entry)
        else:
            old = os.path.join(OUTPUT_DIR, entry["filename"])
            if os.path.exists(old):
                os.remove(old)
    save_index(kept)
    update_hourly_avg(kept)


def main():
    loop = "--loop" in sys.argv
    if loop:
        print("Running in loop mode (every hour). Ctrl+C to stop.")
        while True:
            run_once()
            time.sleep(3600)
    else:
        run_once()


if __name__ == "__main__":
    main()
