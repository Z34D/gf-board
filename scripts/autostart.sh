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

# Ensure 1080p resolution via kanshi (only if not already 1080p)
CURRENT_RES=$(wlr-randr 2>/dev/null | grep -oP '\d+x\d+.*\(current\)' | grep -oP '^\d+x\d+')
if [ "$CURRENT_RES" != "1920x1080" ]; then
    KANSHI_DIR="$HOME/.config/kanshi"
    KANSHI_CONFIG="$KANSHI_DIR/config"
    mkdir -p "$KANSHI_DIR"
    cat > "$KANSHI_CONFIG" << 'EOF'
profile {
    output HDMI-A-1 mode 1920x1080@60.000Hz position 0,0 transform normal
}
profile {
    output HDMI-A-2 mode 1920x1080@60.000Hz position 0,0 transform normal
}
EOF
    pkill kanshi 2>/dev/null; sleep 0.5; kanshi &
fi

# Ensure WLAN is activated
sudo sed -i '/dtoverlay=disable-wifi/d' /boot/firmware/config.txt 2>/dev/null || true
rfkill unblock wifi 2>/dev/null || true
nmcli radio wifi on 2>/dev/null || true

# If USB-WLAN dongle present, disconnect onboard WLAN (avoid routing conflicts)
if readlink -f /sys/class/net/wlan1 2>/dev/null | grep -q usb; then
    nmcli device disconnect wlan0 2>/dev/null || true
fi

# Run update (safe -- always exits 0)
bash scripts/update.sh 2>&1 | tee /tmp/kiosk-update.log

# Start server in a loop (crash recovery)
while true; do
    echo "[autostart] Bun gestartet: $(date '+%d.%m.%Y %H:%M:%S')" >> /tmp/kiosk-server.log
    bun run start 2>&1 >> /tmp/kiosk-server.log
    echo "[autostart] Bun beendet: $(date '+%d.%m.%Y %H:%M:%S') -- Neustart in 10s..." >> /tmp/kiosk-server.log
    sleep 10
done
