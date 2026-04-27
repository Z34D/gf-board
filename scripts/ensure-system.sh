#!/bin/bash
# GF-Kiosk System Configuration (idempotent, runs on every boot)
# Called by autostart.sh before starting the server.
# All changes here are safe to run repeatedly and can be hotfixed via git push.

LABWC_DIR="$HOME/.config/labwc"
KANSHI_DIR="$HOME/.config/kanshi"

# --- sudo without prompt (hardcoded default Pi password) ---
# Lets ensure-system run non-interactively at boot via labwc autostart, even if
# the pi user is not configured for NOPASSWD. We register a SUDO_ASKPASS helper
# that just echoes the password, then call sudo with -A throughout this script.
ASKPASS_HELPER=$(mktemp)
printf '#!/bin/bash\necho pi\n' > "$ASKPASS_HELPER"
chmod 700 "$ASKPASS_HELPER"
export SUDO_ASKPASS="$ASKPASS_HELPER"
trap 'rm -f "$ASKPASS_HELPER"' EXIT

# --- 1080p Resolution via kanshi ---
CURRENT_RES=$(wlr-randr 2>/dev/null | grep -oP '\d+x\d+.*\(current\)' | grep -oP '^\d+x\d+')
if [ "$CURRENT_RES" != "1920x1080" ]; then
    mkdir -p "$KANSHI_DIR"
    cat > "$KANSHI_DIR/config" << 'EOF'
profile {
    output HDMI-A-1 mode 1920x1080@60.000Hz position 0,0 transform normal
}
profile {
    output HDMI-A-2 mode 1920x1080@60.000Hz position 0,0 transform normal
}
EOF
    pkill kanshi 2>/dev/null; sleep 0.5; kanshi &
fi

# --- labwc keybinds (Alt+Q kill kiosk, Alt+Super+H hide cursor) ---
mkdir -p "$LABWC_DIR"
cat > "$LABWC_DIR/rc.xml" << 'EOF'
<?xml version="1.0"?>
<openbox_config xmlns="http://openbox.org/3.4/rc">
  <core>
    <xwaylandPersistence>yes</xwaylandPersistence>
  </core>
  <keyboard>
    <keybind key="A-W-h">
      <action name="HideCursor"/>
    </keybind>
    <keybind key="A-q">
      <action name="Execute"><command>curl -s -X POST http://localhost:3000/api/kill-kiosk</command></action>
    </keybind>
  </keyboard>
</openbox_config>
EOF

# Reload labwc config and restart swayidle so HideCursor works immediately
pkill -HUP labwc 2>/dev/null || true
pkill swayidle 2>/dev/null || true
swayidle -w timeout 5 'wtype -M alt -M logo -k h' &

# --- WLAN reset ---
# Undo common stale states on every boot: rfkill, NM wifi-off, legacy dtoverlay,
# and unmanaged wlan devices left behind from older versions.
sudo -A sed -i '/^dtoverlay=disable-wifi/d' /boot/firmware/config.txt 2>/dev/null || true
rfkill unblock wifi 2>/dev/null || true
nmcli radio wifi on 2>/dev/null || true

for iface in /sys/class/net/wlan*; do
    [ -e "$iface" ] || continue
    name=$(basename "$iface")
    nmcli device set "$name" managed yes 2>/dev/null || true
done

# --- Chromium translate policy ---
if [ ! -f /etc/chromium/policies/managed/no-translate.json ]; then
    sudo -A mkdir -p /etc/chromium/policies/managed
    echo '{ "TranslateEnabled": false }' | sudo -A tee /etc/chromium/policies/managed/no-translate.json > /dev/null
fi

# --- Bun PATH ---
if ! grep -q 'BUN_INSTALL' "$HOME/.bashrc" 2>/dev/null; then
    cat >> "$HOME/.bashrc" << 'EOF'

# Bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
EOF
fi

# --- Screen blanking ---
if ! grep -q 'xset s off' "$HOME/.profile" 2>/dev/null; then
    cat >> "$HOME/.profile" << 'EOF'

# Disable screen blanking for kiosk
xset s off 2>/dev/null || true
xset -dpms 2>/dev/null || true
xset s noblank 2>/dev/null || true
EOF
fi

exit 0
