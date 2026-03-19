#!/bin/bash
# GF-Kiosk Autostart -- called by labwc on desktop login
# 1. Waits for desktop
# 2. Runs update (safe, never blocks)
# 3. Starts server in a crash-recovery loop

# Navigate to repo root (parent of scripts/)
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR" || exit 1

# Wait for desktop to be fully loaded
sleep 10

# Run update (safe -- always exits 0)
bash scripts/update.sh 2>&1 | tee /tmp/kiosk-update.log

# Start server in a loop (crash recovery)
while true; do
    echo "[autostart] Starting server..."
    bun run start 2>&1 | tee -a /tmp/kiosk-server.log
    echo "[autostart] Server exited, restarting in 10s..."
    sleep 10
done
