/**
 * Generiert ein Bash-Script für Raspberry Pi 5 (Bookworm/Wayland),
 * um WLAN, Auto-Login und Kiosk-Modus einzurichten.
 * PASTE-FREUNDLICH: Kann direkt in die Console kopiert werden!
 *
 * Setup-Schritte:
 * 1. WLAN konfigurieren (NetworkManager)
 * 2. Auto-Login aktivieren (raspi-config)
 * 3. Kiosk-Autostart (NUR labwc user autostart - EINE Methode!)
 * 4. Bildschirmschoner deaktivieren (raspi-config)
 * 5. Automatische Updates deaktivieren (wichtig für Kiosk-Stabilität!)
 *
 * Autostart-Methode:
 * - NUR ~/.config/labwc/autostart (KEINE parallelen Methoden mehr!)
 * - Direkt in der Datei, kein separates Script
 *
 * Chromium Flags (KORRIGIERT):
 * - --user-data-dir=$HOME/.chromium-kiosk (separates Profil, verhindert Keyring)
 * - --password-store=basic (KEIN Keyring-Popup!)
 * - --start-maximized --start-fullscreen (F11 funktioniert!)
 * - --disable-restore-session-state (KEINE Wiederherstellen-Bubble!)
 * - --ozone-platform=wayland (Wayland-Support)
 *
 * @param ssid - Der Name des WLAN-Netzwerks (Optional: Leer lassen zum Überspringen)
 * @param password - Das WLAN-Passwort (Optional: Leer lassen zum Überspringen)
 * @param url - Die Ziel-Website
 * @returns String containing the complete bash script
 */

/**
 * Generiert ein komplettes Cleanup-Script das ALLE Autostart-Methoden löscht.
 * @returns String containing the complete cleanup bash script
 */
export function generateCompleteCleanupScript(): string {
	return `# ================================================
# GF-Board COMPLETE CLEANUP (GRÜNDLICH!)
# ================================================
# Löscht ALLE Autostart-Methoden komplett!

echo "================================================"
echo "   GF-Board COMPLETE CLEANUP"
echo "================================================"
echo ""
echo "⚠️  Löscht ALLE Autostart-Konfigurationen!"
echo ""

# Stoppe ALLE Chromium-Instanzen (auch hängende)
echo -n "Stoppe Chromium... "
pkill -9 chromium 2>/dev/null
sleep 2
echo "✓"

# 1. Kiosk-Script
echo -n "Lösche ~/start_gf_kiosk.sh... "
rm -f ~/start_gf_kiosk.sh*
echo "✓"

# 2. labwc user autostart - KOMPLETT LÖSCHEN
echo -n "Lösche ~/.config/labwc/... "
rm -rf ~/.config/labwc/
echo "✓"

# 3. labwc system-wide autostart - KOMPLETT BEREINIGEN
echo -n "Bereinige /etc/xdg/labwc/autostart... "
if sudo test -f /etc/xdg/labwc/autostart; then
	# Lösche ALLE Backups zuerst
	sudo rm -f /etc/xdg/labwc/autostart.backup* 2>/dev/null
	# Lösche ALLE GF-Board und chromium Zeilen
	sudo sed -i '/start_gf_kiosk/d' /etc/xdg/labwc/autostart
	sudo sed -i '/GF-Board/d' /etc/xdg/labwc/autostart
	sudo sed -i '/chromium/d' /etc/xdg/labwc/autostart
	echo "✓"
else
	echo "⊘"
fi

# 4. wayfire.ini - KOMPLETT BEREINIGEN (KEIN BACKUP!)
echo -n "Bereinige ~/.config/wayfire.ini... "
if [ -f ~/.config/wayfire.ini ]; then
	# Lösche alte Backups
	rm -f ~/.config/wayfire.ini.backup* 2>/dev/null
	# Bereinige
	sed -i '/runme/d' ~/.config/wayfire.ini
	sed -i '/chromium/d' ~/.config/wayfire.ini
	sed -i '/kiosk/d' ~/.config/wayfire.ini
	sed -i '/start_gf/d' ~/.config/wayfire.ini
	echo "✓"
else
	echo "⊘"
fi

# 5. LXDE Autostart
echo -n "Lösche LXDE autostart... "
rm -rf ~/.config/lxsession/LXDE-pi/
echo "✓"

# 6. XDG .desktop - ALLES
echo -n "Lösche XDG .desktop... "
rm -rf ~/.config/autostart/
echo "✓"

# 7. systemd service
echo -n "Lösche systemd service... "
systemctl --user stop kiosk.service 2>/dev/null
systemctl --user disable kiosk.service 2>/dev/null
rm -f ~/.config/systemd/user/kiosk.service
systemctl --user daemon-reload 2>/dev/null
echo "✓"

# 8. Chromium Kiosk User Data (falls vorhanden)
echo -n "Lösche Chromium Kiosk Profil... "
rm -rf ~/.chromium-kiosk 2>/dev/null
echo "✓"

echo ""
echo "================================================"
echo "   ✓ ALLES KOMPLETT GELÖSCHT!"
echo "================================================"
echo ""
echo "Prüfe ob noch Chromium läuft:"
ps aux | grep chromium | grep -v grep || echo "✓ Kein Chromium läuft mehr"
echo ""
echo "Jetzt Setup-Script neu ausführen!"
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

# 3. AUTOSTART EINRICHTEN (NUR EINE METHODE!)
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
# - --password-store=basic: Kein Keyring!
# - --start-fullscreen: F11 funktioniert (nicht --kiosk!)
# - --disable-restore-session-state: Keine Wiederherstellen-Bubble!
# PRE-START CLEANUP:
# - Setzt "exit_type" auf "Normal" und "exited_cleanly" auf true
# - Verhindert "Sitzung wiederherstellen?"-Popup nach Absturz
cat > "$LABWC_DIR/autostart" << 'LABWC_EOF'
#!/bin/sh
# GF-Board Kiosk Autostart

# CLEANUP: Chromium Crash-Flags zurücksetzen (verhindert Restore-Bubble)
PREFS="\$HOME/.chromium-kiosk/Default/Preferences"
if [ -f "\$PREFS" ]; then
  sed -i 's/"exit_type":"[^"]*"/"exit_type":"Normal"/g' "\$PREFS"
  sed -i 's/"exited_cleanly":[^,}]*/"exited_cleanly":true/g' "\$PREFS"
fi

# Starte Chromium mit Anti-Restore-Flags
LABWC_EOF
echo "$CHROMIUM_CMD --user-data-dir=\$HOME/.chromium-kiosk --password-store=basic --use-mock-keychain --start-maximized --start-fullscreen --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble --disable-restore-session-state --disable-background-mode --disable-backgrounding-occluded-windows --disable-sync --ozone-platform=wayland --enable-features=OverlayScrollbar --disable-features=Translate '$TARGET_URL' &" >> "$LABWC_DIR/autostart"
chmod +x "$LABWC_DIR/autostart"

# Verifiziere
if [ -f "$LABWC_DIR/autostart" ]; then
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

# 5. AUTOMATISCHE UPDATES DEAKTIVIEREN (wichtig für Kiosk!)
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

if [ "$AUTOLOGIN_STATUS" == "OK" ]; then
	echo -e "Auto-Login:          \${GREEN}✓ AKTIVIERT\${NC}"
else
	echo -e "Auto-Login:          \${RED}✗ FEHLGESCHLAGEN\${NC}"
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
echo "  • F11 drücken = Kiosk-Modus verlassen"
echo "  • F11 nochmal = Zurück in Fullscreen"
echo ""
echo "Falls Chromium NICHT startet:"
echo "  cat ~/.config/labwc/autostart"
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
