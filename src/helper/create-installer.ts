/**
 * Generiert ein Bash-Script für Raspberry Pi 4/5 (Bookworm/Wayland),
 * um WLAN, Auto-Login und Kiosk-Modus einzurichten.
 * PASTE-FREUNDLICH: Kann direkt in die Console kopiert werden!
 *
 * Setup-Schritte:
 * 1. WLAN konfigurieren (NetworkManager)
 * 1b. USB-WLAN bevorzugen (deaktiviert onboard wlan0 wenn wlan1 vorhanden)
 * 2. Auto-Login aktivieren (raspi-config)
 * 3. Tastatur auf Deutsch setzen
 * 4. Auflösung auf 1080p fixieren
 * 5. Kiosk-Autostart (NUR labwc user autostart - EINE Methode!)
 * 6. Bildschirmschoner deaktivieren (raspi-config)
 * 7. Automatische Updates deaktivieren (wichtig für Kiosk-Stabilität!)
 * 8. Snapper Extension installieren (Crash-Recovery)
 *
 * WLAN-Setup:
 * - Wenn wlan1 (USB-Stick) vorhanden: Onboard WLAN wird deaktiviert
 * - Pi nutzt dann nur noch USB-WLAN (bessere Reichweite/Stabilität)
 *
 * Autostart-Methode:
 * - NUR ~/.config/labwc/autostart (KEINE parallelen Methoden mehr!)
 * - Direkt in der Datei, kein separates Script
 *
 * Chromium Flags:
 * - --kiosk (Echter Kiosk-Modus, kein Escape möglich)
 * - --user-data-dir=$HOME/.chromium-kiosk (separates Profil, verhindert Keyring)
 * - --password-store=basic (KEIN Keyring-Popup!)
 * - --disable-dev-shm-usage + --memory-pressure-off (Memory-Optimierung für Pi)
 * - --disable-restore-session-state (KEINE Wiederherstellen-Bubble!)
 * - --ozone-platform=wayland (Wayland-Support)
 *
 * Kiosk verlassen:
 * - Strg+Alt+F3 → Terminal (TTY3)
 * - pkill chromium → Chromium beenden
 * - Strg+Alt+F7 → Zurück zum Desktop
 *
 * @param ssid - Der Name des WLAN-Netzwerks (Optional: Leer lassen zum Überspringen)
 * @param password - Das WLAN-Passwort (Optional: Leer lassen zum Überspringen)
 * @param url - Die Ziel-Website
 * @returns String containing the complete bash script
 */

export function generatePiSetupScript(
  ssid: string,
  password: string,
  url: string,
): string {
  // Wir escapen einfache Anführungszeichen für Bash, um Injection zu vermeiden
  const safeSsid = ssid ? ssid.replace(/'/g, "'\\''") : "";
  const safePass = password ? password.replace(/'/g, "'\\''") : "";
  const safeUrl = url.replace(/'/g, "'\\''");

  return `# ================================================
# Raspberry Pi 4&5 Kiosk Setup (Wayland)
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
echo "   Raspberry Pi 4&5 Kiosk Setup (Wayland)"
echo "================================================"
echo ""

# 1. WLAN EINPFLEGEN (NetworkManager)
if [ -n "$WIFI_SSID" ] && [ -n "$WIFI_PASS" ]; then
	echo -n "Konfiguriere WLAN ('$WIFI_SSID')... "

	# Lösche existierende Verbindung
	sudo nmcli connection delete "$WIFI_SSID" >/dev/null 2>&1

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

# 1b. USB-WLAN BEVORZUGEN (wlan1 statt onboard wlan0)
if ip link show wlan1 >/dev/null 2>&1; then
	echo -n "USB-WLAN gefunden, deaktiviere onboard WLAN... "
	CONFIG_FILE="/boot/firmware/config.txt"
	if ! grep -q "dtoverlay=disable-wifi" "$CONFIG_FILE" 2>/dev/null; then
		echo "dtoverlay=disable-wifi" | sudo tee -a "$CONFIG_FILE" >/dev/null
		echo -e "\${GREEN}[OK - wlan1 wird nach Neustart verwendet]\${NC}"
		WLAN1_STATUS="OK"
	else
		echo -e "\${GREEN}[Bereits konfiguriert]\${NC}"
		WLAN1_STATUS="OK"
	fi
else
	WLAN1_STATUS="SKIPPED"
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

# 3. TASTATUR-LAYOUT AUF DEUTSCH SETZEN
echo -n "Setze Tastatur-Layout auf Deutsch... "
# Setze deutsches Tastatur-Layout (XKBLAYOUT=de)
sudo raspi-config nonint do_configure_keyboard de >/dev/null 2>&1
# Zusätzlich in /etc/default/keyboard sicherstellen
if sudo test -f /etc/default/keyboard; then
	sudo sed -i 's/^XKBLAYOUT=.*/XKBLAYOUT="de"/' /etc/default/keyboard
	sudo sed -i 's/^XKBVARIANT=.*/XKBVARIANT=""/' /etc/default/keyboard
	sudo sed -i 's/^XKBOPTIONS=.*/XKBOPTIONS=""/' /etc/default/keyboard
fi
echo -e "\${GREEN}[OK]\${NC}"
KEYBOARD_STATUS="OK"

# 4. AUFLÖSUNG AUF 1080p FIXIEREN
echo -n "Fixiere Auflösung auf 1080p... "
# Setze HDMI-Mode auf 1080p 60Hz (hdmi_mode=82 für 1920x1080 60Hz)
CONFIG_FILE="/boot/firmware/config.txt"
if sudo test -f "\$CONFIG_FILE"; then
	# Entferne alte hdmi_group und hdmi_mode Einträge
	sudo sed -i '/^hdmi_group=/d' "\$CONFIG_FILE"
	sudo sed -i '/^hdmi_mode=/d' "\$CONFIG_FILE"
	sudo sed -i '/^hdmi_drive=/d' "\$CONFIG_FILE"
	# Füge neue Konfiguration hinzu
	echo "" | sudo tee -a "\$CONFIG_FILE" >/dev/null
	echo "# GF-Board 1080p Resolution" | sudo tee -a "\$CONFIG_FILE" >/dev/null
	echo "hdmi_group=2" | sudo tee -a "\$CONFIG_FILE" >/dev/null
	echo "hdmi_mode=82" | sudo tee -a "\$CONFIG_FILE" >/dev/null
	echo "hdmi_drive=2" | sudo tee -a "\$CONFIG_FILE" >/dev/null
	echo -e "\${GREEN}[OK]\${NC}"
	RESOLUTION_STATUS="OK"
else
	echo -e "\${RED}[FEHLER - config.txt nicht gefunden]\${NC}"
	RESOLUTION_STATUS="FAIL"
fi

# 5. AUTOSTART EINRICHTEN (NUR EINE METHODE!)
echo -n "Erstelle Kiosk-Autostart... "

# Finde den richtigen Chromium-Befehl (chromium ODER chromium-browser)
if command -v chromium >/dev/null 2>&1; then
	CHROMIUM_CMD="chromium"
elif command -v chromium-browser >/dev/null 2>&1; then
	CHROMIUM_CMD="chromium-browser"
else
	echo -e "\${RED}[FEHLER - Chromium nicht installiert!]\${NC}"
	CHROMIUM_CMD="chromium-browser"
fi

# Erstelle labwc autostart Verzeichnis
LABWC_DIR="$HOME/.config/labwc"
mkdir -p "$LABWC_DIR"

# Erstelle autostart Datei - NUR EINE METHODE!
# WICHTIGE FLAGS:
# - --user-data-dir: Separates Profil (verhindert Keyring-Popup)
# - --kiosk: Echter Kiosk-Modus (Fullscreen, kein Escape)
# - --password-store=basic: Kein Keyring!
# - --disable-dev-shm-usage + --memory-pressure-off: Memory-Optimierung für Pi
# - --disable-restore-session-state: Keine Wiederherstellen-Bubble!
# PRE-START CLEANUP:
# - Setzt "exit_type" auf "Normal" und "exited_cleanly" auf true
# - Verhindert "Sitzung wiederherstellen?"-Popup nach Absturz
cat > "$LABWC_DIR/autostart" << 'LABWC_EOF'
#!/bin/sh
# GF-Board Kiosk Autostart

# Warte bis Desktop vollständig geladen ist
sleep 10

# CLEANUP: Chromium Crash-Flags zurücksetzen (verhindert Restore-Bubble)
PREFS="\$HOME/.chromium-kiosk/Default/Preferences"
if [ -f "\$PREFS" ]; then
  sed -i 's/"exit_type":"[^"]*"/"exit_type":"Normal"/g' "\$PREFS"
  sed -i 's/"exited_cleanly":[^,}]*/"exited_cleanly":true/g' "\$PREFS"
fi

# Starte Chromium mit Anti-Restore-Flags
LABWC_EOF
echo "$CHROMIUM_CMD --user-data-dir=\$HOME/.chromium-kiosk --kiosk --ozone-platform=wayland --disable-dev-shm-usage --memory-pressure-off --disable-background-networking --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-component-update --disable-sync --disable-domain-reliability --noerrdialogs --disable-infobars --disable-hang-monitor --disable-prompt-on-repost --disable-session-crashed-bubble --disable-restore-session-state --no-first-run --disable-client-side-phishing-detection --disable-default-apps --password-store=basic --use-mock-keychain --enable-features=OverlayScrollbar --disable-features=Translate,TranslateUI '$TARGET_URL' &" >> "$LABWC_DIR/autostart"
chmod +x "$LABWC_DIR/autostart"

# Verifiziere
if [ -f "$LABWC_DIR/autostart" ]; then
	echo -e "\${GREEN}[OK]\${NC}"
	AUTOSTART_STATUS="OK"
else
	echo -e "\${RED}[FEHLER]\${NC}"
	AUTOSTART_STATUS="FAIL"
fi

# 6. SCREEN BLANKING DEAKTIVIEREN
echo -n "Deaktiviere Bildschirmschoner... "
if sudo raspi-config nonint do_blanking 1 >/dev/null 2>&1; then
	echo -e "\${GREEN}[OK]\${NC}"
	BLANKING_STATUS="OK"
else
	echo -e "\${RED}[WARNUNG]\${NC}"
	BLANKING_STATUS="WARN"
fi

# 7. AUTOMATISCHE UPDATES DEAKTIVIEREN (wichtig für Kiosk!)
echo -n "Deaktiviere automatische Updates... "
# Stoppe und deaktiviere apt-daily Timer
sudo systemctl stop apt-daily.timer >/dev/null 2>&1
sudo systemctl disable apt-daily.timer >/dev/null 2>&1
sudo systemctl stop apt-daily-upgrade.timer >/dev/null 2>&1
sudo systemctl disable apt-daily-upgrade.timer >/dev/null 2>&1
# Deaktiviere unattended-upgrades falls installiert
sudo systemctl stop unattended-upgrades >/dev/null 2>&1
sudo systemctl disable unattended-upgrades >/dev/null 2>&1
echo -e "\${GREEN}[OK]\${NC}"
UPDATES_STATUS="OK"

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

if [ "$WLAN1_STATUS" == "OK" ]; then
	echo -e "USB-WLAN (wlan1):    \${GREEN}✓ AKTIVIERT (onboard deaktiviert)\${NC}"
fi

if [ "$AUTOLOGIN_STATUS" == "OK" ]; then
	echo -e "Auto-Login:          \${GREEN}✓ AKTIVIERT\${NC}"
else
	echo -e "Auto-Login:          \${RED}✗ FEHLGESCHLAGEN\${NC}"
fi

if [ "$KEYBOARD_STATUS" == "OK" ]; then
	echo -e "Tastatur-Layout:     \${GREEN}✓ DEUTSCH\${NC}"
else
	echo -e "Tastatur-Layout:     \${YELLOW}⚠ WARNUNG\${NC}"
fi

if [ "$RESOLUTION_STATUS" == "OK" ]; then
	echo -e "Auflösung:           \${GREEN}✓ 1080p FIXIERT\${NC}"
else
	echo -e "Auflösung:           \${RED}✗ FEHLGESCHLAGEN\${NC}"
fi

if [ "$AUTOSTART_STATUS" == "OK" ]; then
	echo -e "Autostart (labwc):   \${GREEN}✓ KONFIGURIERT\${NC} ($TARGET_URL)"
else
	echo -e "Autostart (labwc):   \${RED}✗ FEHLGESCHLAGEN\${NC}"
fi

if [ "$BLANKING_STATUS" == "OK" ]; then
	echo -e "Bildschirmschoner:   \${GREEN}✓ DEAKTIVIERT\${NC}"
else
	echo -e "Bildschirmschoner:   \${YELLOW}⚠ WARNUNG\${NC}"
fi

if [ "$UPDATES_STATUS" == "OK" ]; then
	echo -e "Auto-Updates:        \${GREEN}✓ DEAKTIVIERT\${NC}"
else
	echo -e "Auto-Updates:        \${YELLOW}⚠ WARNUNG\${NC}"
fi

echo "================================================"
echo ""
echo "✓ Setup abgeschlossen!"
echo ""
echo "WICHTIG:"
echo "  • Chromium startet automatisch nach Neustart"
echo "  • Kiosk-Modus: Kein Escape mit F11 möglich!"
echo ""
echo "KIOSK VERLASSEN:"
echo "  1. Strg+Alt+F3  → Terminal öffnen"
echo "  2. pkill chromium"
echo "  3. Strg+Alt+F7  → Zurück zum Desktop"
echo ""
echo "Falls Chromium NICHT startet:"
echo "  cat ~/.config/labwc/autostart"
echo ""
echo "================================================"
echo ""

# Snapper Extension installieren
echo "Öffne Chromium zum Installieren der Snapper Extension..."
echo "(Crash-Recovery für Kiosk-Modus)"
echo ""
echo "→ Klicke auf 'Hinzufügen' um die Extension zu installieren"
echo "→ Schließe dann Chromium (Strg+W oder X)"
echo ""
$CHROMIUM_CMD --user-data-dir=$HOME/.chromium-kiosk --ozone-platform=wayland "https://chromewebstore.google.com/detail/snapper-aw-snap-tab-reloa/jehgbfogcmbekbbcadldojojckehlkbi"

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
