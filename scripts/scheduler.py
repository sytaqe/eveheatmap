#!/usr/bin/env python3
# SPDX-License-Identifier: CC0-1.0
# This file is released into the public domain under the CC0 1.0 Universal license.
"""
Runs fetch_kills.py every hour at :00.
Keep this process running in the background.
"""

import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

FETCH_SCRIPT = Path(__file__).parent / "fetch_kills.py"


def wait_until_next_hour():
    now = datetime.now(timezone.utc)
    seconds_past = now.minute * 60 + now.second + now.microsecond / 1_000_000
    sleep_for = 3600 - seconds_past
    next_run = now.replace(minute=0, second=0, microsecond=0)
    print(f"Next fetch at {next_run.strftime('%H:%M')} UTC ({sleep_for:.0f}s from now)")
    time.sleep(sleep_for)


def run_fetch():
    result = subprocess.run([sys.executable, str(FETCH_SCRIPT)], capture_output=True, text=True)
    if result.stdout:
        print(result.stdout.rstrip())
    if result.stderr:
        print(result.stderr.rstrip(), file=sys.stderr)


def main():
    print("Kill fetch scheduler started. Press Ctrl+C to stop.")
    while True:
        wait_until_next_hour()
        run_fetch()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nScheduler stopped.")
