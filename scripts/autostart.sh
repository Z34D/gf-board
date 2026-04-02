#!/bin/bash
# GF-Kiosk Autostart -- called by labwc on desktop login
# 1. Waits for desktop
# 2. Runs update (safe, never blocks)
# 3. Starts server in a crash-recovery loop

# Navigate to repo root (parent of scripts/)
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR" || exit 1

# Bun PATH
export PATH="$HOME/.bun/bin:/usr/local/bin:/usr/bin:$PATH"

# Wait for XWayland socket to be ready
for i in $(seq 1 200); do
    [ -S /tmp/.X11-unix/X0 ] && break
    sleep 0.1
done

# Open terminal with server log (visible after Alt+Q kills Chromium)
touch /tmp/kiosk-server.log
DISPLAY=:0 WAYLAND_DISPLAY=wayland-0 lxterminal --title="GF-Kiosk" -e bash -c 'tail -n 200 -f /tmp/kiosk-server.log' &

# Wait for desktop to be fully loaded
sleep 10

# Run update (safe -- always exits 0)
bash scripts/update.sh 2>&1 | tee /tmp/kiosk-update.log

# Start server in a loop (crash recovery)
while true; do
    echo "[autostart] Bun gestartet: $(date '+%d.%m.%Y %H:%M:%S')" >> /tmp/kiosk-server.log
    bun run start 2>&1 >> /tmp/kiosk-server.log
    echo "[autostart] Bun beendet: $(date '+%d.%m.%Y %H:%M:%S') -- Neustart in 10s..." >> /tmp/kiosk-server.log
    sleep 10
done
