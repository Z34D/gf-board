#!/bin/bash
# GF-Kiosk System Configuration (idempotent, runs on every boot)
# Called by autostart.sh before starting the server.
# All changes here are safe to run repeatedly and can be hotfixed via git push.

LABWC_DIR="$HOME/.config/labwc"
KANSHI_DIR="$HOME/.config/kanshi"

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

# --- WLAN ---
# Ensure wifi radio is on (NM persists off-state across reboots)
nmcli radio wifi on 2>/dev/null || true
# Remove legacy firmware-level wifi disable (needs reboot to take effect)
sudo sed -i '/dtoverlay=disable-wifi/d' /boot/firmware/config.txt 2>/dev/null || true

# --- USB-WLAN preference ---
# Find which adapter is USB and which is onboard (names can be swapped)
USB_WLAN=""
ONBOARD_WLAN=""
for iface in /sys/class/net/wlan*; do
    name=$(basename "$iface")
    link=$(readlink -f "$iface" 2>/dev/null)
    if echo "$link" | grep -q usb; then
        USB_WLAN="$name"
    elif echo "$link" | grep -q mmc; then
        ONBOARD_WLAN="$name"
    fi
done

if [ -n "$USB_WLAN" ] && [ -n "$ONBOARD_WLAN" ]; then
    # Both present — disable onboard, use USB
    nmcli device disconnect "$ONBOARD_WLAN" 2>/dev/null || true
    nmcli device set "$ONBOARD_WLAN" managed no 2>/dev/null || true
    nmcli device set "$USB_WLAN" managed yes 2>/dev/null || true
elif [ -n "$ONBOARD_WLAN" ]; then
    # Only onboard — ensure it's active
    nmcli device set "$ONBOARD_WLAN" managed yes 2>/dev/null || true
elif [ -n "$USB_WLAN" ]; then
    # Only USB — ensure it's active
    nmcli device set "$USB_WLAN" managed yes 2>/dev/null || true
fi

# --- Chromium translate policy ---
if [ ! -f /etc/chromium/policies/managed/no-translate.json ]; then
    sudo mkdir -p /etc/chromium/policies/managed
    echo '{ "TranslateEnabled": false }' | sudo tee /etc/chromium/policies/managed/no-translate.json > /dev/null
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
