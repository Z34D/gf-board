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
pkill -HUP labwc 2>/dev/null || true

# --- WLAN ---
# Ensure wifi radio is on (NM persists off-state across reboots)
nmcli radio wifi on 2>/dev/null || true
# Remove legacy firmware-level wifi disable (needs reboot to take effect)
sudo sed -i '/dtoverlay=disable-wifi/d' /boot/firmware/config.txt 2>/dev/null || true

# --- USB-WLAN preference ---
# If USB dongle present, disconnect onboard to avoid routing conflicts
if readlink -f /sys/class/net/wlan1 2>/dev/null | grep -q usb; then
    nmcli device disconnect wlan0 2>/dev/null || true
fi

# --- Chromium translate policy ---
if [ ! -f /etc/chromium/policies/managed/no-translate.json ]; then
    sudo mkdir -p /etc/chromium/policies/managed
    echo '{ "TranslateEnabled": false }' | sudo tee /etc/chromium/policies/managed/no-translate.json > /dev/null
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
