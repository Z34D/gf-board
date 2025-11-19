/**
 * Generiert ein Bash-Script für Raspberry Pi 5 (Bookworm/Wayland),
 * um WLAN, Auto-Login und Kiosk-Modus einzurichten.
 * PASTE-FREUNDLICH: Kann direkt in die Console kopiert werden!
 *
 * Setup-Schritte:
 * 1. WLAN konfigurieren (NetworkManager)
 * 2. Auto-Login aktivieren (raspi-config)
 * 3. Kiosk-Autostart (ALLE METHODEN für maximale Kompatibilität)
 * 4. Bildschirmschoner deaktivieren (raspi-config)
 *
 * Autostart-Methode: SHOTGUN APPROACH (alle gleichzeitig!)
 * - ~/start_gf_kiosk.sh - Start-Script
 * - ~/.config/wayfire.ini [autostart] - Für wayfire
 * - ~/.config/labwc/autostart - Für labwc (user)
 * - /etc/xdg/labwc/autostart - Für labwc (system-wide)
 *
 * Chromium Flags (aus Raspberry Pi Forums):
 * - --start-maximized --kiosk (REIHENFOLGE WICHTIG!)
 * - --ozone-platform=wayland (Wayland-Support)
 * - --enable-features=OverlayScrollbar
 *
 * @param ssid - Der Name des WLAN-Netzwerks (Optional: Leer lassen zum Überspringen)
 * @param password - Das WLAN-Passwort (Optional: Leer lassen zum Überspringen)
 * @param url - Die Ziel-Website
 * @returns String containing the complete bash script
 */
/**
 * Generiert ein Debug-Script um herauszufinden welcher Compositor läuft
 * und welche Autostart-Dateien existieren.
 * @returns String containing the debug bash commands
 */
export function generateDebugScript(): string {
	return `# ================================================
# GF-Board Debug Script - Compositor & Autostart Detection
# ================================================
# Kopiere alles und paste es in die Pi-Console

echo "================================================"
echo "  GF-Board System-Diagnose"
echo "================================================"
echo ""

# 1. Display Server
echo "1. Display Server:"
echo "   XDG_SESSION_TYPE: $XDG_SESSION_TYPE"
echo ""

# 2. Laufender Compositor
echo "2. Laufender Compositor:"
ps aux | grep -E "wayfire|labwc|X11|Xorg" | grep -v grep
echo ""

# 3. OS Version
echo "3. Raspberry Pi OS Version:"
cat /etc/os-release | grep -E "PRETTY_NAME|VERSION"
echo ""

# 4. Existierende Config-Dateien
echo "4. Config-Dateien Check:"
echo ""

echo "   ~/.config/wayfire.ini:"
if [ -f "$HOME/.config/wayfire.ini" ]; then
	echo "   ✓ EXISTIERT"
else
	echo "   ✗ NICHT VORHANDEN"
fi
echo ""

echo "   ~/.config/labwc/:"
if [ -d "$HOME/.config/labwc" ]; then
	echo "   ✓ VERZEICHNIS EXISTIERT"
	ls -la "$HOME/.config/labwc/" 2>/dev/null
else
	echo "   ✗ NICHT VORHANDEN"
fi
echo ""

echo "   ~/.config/lxsession/LXDE-pi/:"
if [ -d "$HOME/.config/lxsession/LXDE-pi" ]; then
	echo "   ✓ VERZEICHNIS EXISTIERT"
else
	echo "   ✗ NICHT VORHANDEN"
fi
echo ""

# 5. Autostart-Datei Inhalte
echo "5. Autostart-Datei Inhalte:"
echo ""

echo "=== ~/.config/labwc/autostart ==="
if [ -f "$HOME/.config/labwc/autostart" ]; then
	cat "$HOME/.config/labwc/autostart"
else
	echo "(Datei existiert nicht)"
fi
echo ""

echo "=== ~/.config/wayfire.ini [autostart] Section ==="
if [ -f "$HOME/.config/wayfire.ini" ]; then
	grep -A 20 "\\[autostart\\]" "$HOME/.config/wayfire.ini" 2>/dev/null || echo "(Keine [autostart] section gefunden)"
else
	echo "(Datei existiert nicht)"
fi
echo ""

echo "=== ~/.config/lxsession/LXDE-pi/autostart ==="
if [ -f "$HOME/.config/lxsession/LXDE-pi/autostart" ]; then
	cat "$HOME/.config/lxsession/LXDE-pi/autostart"
else
	echo "(Datei existiert nicht)"
fi
echo ""

# 6. Kiosk-Script falls vorhanden
echo "6. GF-Board Kiosk-Script:"
echo ""
if [ -f "$HOME/start_gf_kiosk.sh" ]; then
	echo "   ✓ ~/start_gf_kiosk.sh EXISTIERT"
	echo "   Inhalt:"
	cat "$HOME/start_gf_kiosk.sh"
else
	echo "   ✗ ~/start_gf_kiosk.sh NICHT GEFUNDEN"
fi
echo ""

echo "================================================"
echo "  Diagnose abgeschlossen!"
echo "  Kopiere die gesamte Ausgabe und sende sie."
echo "================================================"
`;
}

export function generatePiSetupScript(ssid: string, password: string, url: string): string {
	// Wir escapen einfache Anführungszeichen für Bash, um Injection zu vermeiden
	const safeSsid = ssid ? ssid.replace(/'/g, "'\\''") : "";
	const safePass = password ? password.replace(/'/g, "'\\''") : "";
	const safeUrl = url.replace(/'/g, "'\\''");

	return `# ================================================
# Raspberry Pi 5 Kiosk Setup (Wayland)
# ================================================
# ANLEITUNG: Einfach alles kopieren und in die Pi-Console pasten!

# --- KONFIGURATION ---
WIFI_SSID='${safeSsid}'
WIFI_PASS='${safePass}'
TARGET_URL='${safeUrl}'
# ---------------------

# Farben für Output
GREEN='\\033[0;32m'
RED='\\033[0;31m'
YELLOW='\\033[1;33m'
NC='\\033[0m'

echo ""
echo "================================================"
echo "   Raspberry Pi 5 Kiosk Setup (Wayland)"
echo "================================================"
echo ""

# 1. WLAN EINPFLEGEN (NetworkManager)
if [ -n "$WIFI_SSID" ] && [ -n "$WIFI_PASS" ]; then
	echo -n "Konfiguriere WLAN ('$WIFI_SSID')... "

	# Lösche existierende Verbindung
	if sudo nmcli connection show "$WIFI_SSID" >/dev/null 2>&1; then
		sudo nmcli connection delete "$WIFI_SSID" >/dev/null 2>&1
	fi

	# Neue Verbindung anlegen
	sudo nmcli con add type wifi ifname wlan0 con-name "$WIFI_SSID" ssid "$WIFI_SSID" >/dev/null 2>&1
	sudo nmcli con modify "$WIFI_SSID" wifi-sec.key-mgmt wpa-psk >/dev/null 2>&1
	sudo nmcli con modify "$WIFI_SSID" wifi-sec.psk "$WIFI_PASS" >/dev/null 2>&1

	if sudo nmcli connection show | grep -q "$WIFI_SSID"; then
		echo -e "\${GREEN}[OK]\${NC}"
		WIFI_STATUS="OK"
	else
		echo -e "\${RED}[FEHLER]\${NC}"
		WIFI_STATUS="FAIL"
	fi
else
	echo -e "WLAN Konfiguration... \${YELLOW}[ÜBERSPRUNGEN]\${NC}"
	WIFI_STATUS="SKIPPED"
fi

# 2. AUTO-LOGIN AKTIVIEREN
echo -n "Aktiviere Auto-Login (Desktop)... "
if sudo raspi-config nonint do_boot_behaviour B4 >/dev/null 2>&1; then
	echo -e "\${GREEN}[OK]\${NC}"
	AUTOLOGIN_STATUS="OK"
else
	echo -e "\${RED}[FEHLER]\${NC}"
	AUTOLOGIN_STATUS="FAIL"
fi

# 3. AUTOSTART EINRICHTEN (ALLE METHODEN - SHOTGUN APPROACH!)
echo -n "Erstelle Kiosk-Autostart (mehrere Methoden)... "

# Finde den richtigen Chromium-Befehl (chromium ODER chromium-browser)
if command -v chromium >/dev/null 2>&1; then
	CHROMIUM_CMD="chromium"
elif command -v chromium-browser >/dev/null 2>&1; then
	CHROMIUM_CMD="chromium-browser"
else
	echo -e "\${RED}[FEHLER - Chromium nicht installiert!]\${NC}"
	CHROMIUM_CMD="chromium-browser"
fi

# Erstelle Start-Script mit dem richtigen Befehl
KIOSK_SCRIPT="$HOME/start_gf_kiosk.sh"
echo "#!/bin/bash" > "$KIOSK_SCRIPT"
echo "$CHROMIUM_CMD --start-maximized --kiosk --noerrdialogs --disable-infobars --no-first-run --ozone-platform=wayland --enable-features=OverlayScrollbar --disable-features=Translate '$TARGET_URL' &" >> "$KIOSK_SCRIPT"
chmod +x "$KIOSK_SCRIPT"

# METHODE 1: wayfire.ini (falls wayfire läuft)
WAYFIRE_CONFIG="$HOME/.config/wayfire.ini"
if [ ! -f "$WAYFIRE_CONFIG" ]; then
	touch "$WAYFIRE_CONFIG"
fi
# Entferne alte Einträge
sed -i '/^runme/d' "$WAYFIRE_CONFIG" 2>/dev/null
sed -i '/^kiosk/d' "$WAYFIRE_CONFIG" 2>/dev/null
sed -i '/^chromium/d' "$WAYFIRE_CONFIG" 2>/dev/null
# Füge [autostart] Section hinzu falls nicht vorhanden
if ! grep -q "\\[autostart\\]" "$WAYFIRE_CONFIG"; then
	echo "" >> "$WAYFIRE_CONFIG"
	echo "[autostart]" >> "$WAYFIRE_CONFIG"
fi
# Füge Script hinzu
sed -i "/\\[autostart\\]/a runme = $KIOSK_SCRIPT" "$WAYFIRE_CONFIG"

# METHODE 2: labwc user autostart
LABWC_USER="$HOME/.config/labwc"
mkdir -p "$LABWC_USER"
echo "$KIOSK_SCRIPT" > "$LABWC_USER/autostart"
chmod +x "$LABWC_USER/autostart"

# METHODE 3: labwc system-wide autostart (mit sudo)
if sudo test -d /etc/xdg/labwc 2>/dev/null; then
	echo "" | sudo tee -a /etc/xdg/labwc/autostart >/dev/null
	echo "# GF-Board Kiosk" | sudo tee -a /etc/xdg/labwc/autostart >/dev/null
	echo "$KIOSK_SCRIPT" | sudo tee -a /etc/xdg/labwc/autostart >/dev/null
fi

# Cleanup alte fehlerhafte Methoden
rm -f "$HOME/.config/lxsession/LXDE-pi/autostart" >/dev/null 2>&1
rm -f "$HOME/.config/autostart/kiosk.desktop" >/dev/null 2>&1

# Verifiziere
if [ -f "$KIOSK_SCRIPT" ]; then
	echo -e "\${GREEN}[OK]\${NC}"
	AUTOSTART_STATUS="OK"
else
	echo -e "\${RED}[FEHLER]\${NC}"
	AUTOSTART_STATUS="FAIL"
fi

# 4. SCREEN BLANKING DEAKTIVIEREN
echo -n "Deaktiviere Bildschirmschoner... "
if sudo raspi-config nonint do_blanking 1 >/dev/null 2>&1; then
	echo -e "\${GREEN}[OK]\${NC}"
	BLANKING_STATUS="OK"
else
	echo -e "\${RED}[WARNUNG]\${NC}"
	BLANKING_STATUS="WARN"
fi

echo ""
echo "================================================"
echo "                ZUSAMMENFASSUNG"
echo "================================================"

if [ "$WIFI_STATUS" == "OK" ]; then
	echo -e "WLAN Profil:         \${GREEN}✓ GESPEICHERT\${NC}"
elif [ "$WIFI_STATUS" == "SKIPPED" ]; then
	echo -e "WLAN Profil:         \${YELLOW}⊘ ÜBERSPRUNGEN\${NC}"
else
	echo -e "WLAN Profil:         \${RED}✗ FEHLGESCHLAGEN\${NC}"
fi

if [ "$AUTOLOGIN_STATUS" == "OK" ]; then
	echo -e "Auto-Login:          \${GREEN}✓ AKTIVIERT\${NC}"
else
	echo -e "Auto-Login:          \${RED}✗ FEHLGESCHLAGEN\${NC}"
fi

if [ "$AUTOSTART_STATUS" == "OK" ]; then
	echo -e "Autostart (Multi):   \${GREEN}✓ KONFIGURIERT\${NC} ($TARGET_URL)"
else
	echo -e "Autostart (Multi):   \${RED}✗ FEHLGESCHLAGEN\${NC}"
fi

if [ "$BLANKING_STATUS" == "OK" ]; then
	echo -e "Bildschirmschoner:   \${GREEN}✓ DEAKTIVIERT\${NC}"
else
	echo -e "Bildschirmschoner:   \${YELLOW}⚠ WARNUNG\${NC}"
fi

echo "================================================"
echo ""
echo "HINWEIS: Nach dem Neustart startet Chromium automatisch."
echo ""
echo "Falls Chromium NICHT startet, teste manuell:"
echo "  ~/start_gf_kiosk.sh"
echo ""
echo "Prüfe welche Autostart-Dateien existieren:"
echo "  ls -la ~/.config/wayfire.ini"
echo "  ls -la ~/.config/labwc/autostart"
echo "  cat /etc/xdg/labwc/autostart"
echo ""
echo "================================================"
echo ""

read -p "Setup abgeschlossen. Jetzt neustarten? (y/n): " confirm
if [[ $confirm == [yY] || $confirm == [yY][eE][sS] ]]; then
	echo "Neustart wird initiiert..."
	sudo reboot
else
	echo "Abbruch. Bitte manuell neustarten damit alle Änderungen wirksam werden."
fi
`;
}
