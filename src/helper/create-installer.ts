/**
 * Generiert ein Bash-Script für Raspberry Pi 5 (Bookworm/Wayland),
 * um WLAN und Kiosk-Modus einzurichten.
 * @param ssid - Der Name des WLAN-Netzwerks (Optional: Leer lassen zum Überspringen)
 * @param password - Das WLAN-Passwort (Optional: Leer lassen zum Überspringen)
 * @param url - Die Ziel-Website
 * @returns String containing the complete bash script
 */
export function generatePiSetupScript(ssid: string, password: string, url: string): string {
	// Wir escapen einfache Anführungszeichen für Bash, um Injection zu vermeiden
	const safeSsid = ssid ? ssid.replace(/'/g, "'\\''") : "";
	const safePass = password ? password.replace(/'/g, "'\\''") : "";
	const safeUrl = url.replace(/'/g, "'\\''");

	return `#!/bin/bash
  
  # --- KONFIGURATION ---
  WIFI_SSID='${safeSsid}'
  WIFI_PASS='${safePass}'
  TARGET_URL='${safeUrl}'
  # ---------------------
  
  # Farben für Output
  GREEN='\\033[0;32m'
  RED='\\033[0;31m'
  YELLOW='\\033[1;33m'
  NC='\\033[0m' # No Color
  
  echo "------------------------------------------------"
  echo "Starte Raspberry Pi 5 Kiosk Setup..."
  echo "------------------------------------------------"
  
  # 1. WLAN EINPFLEGEN (NetworkManager)
  # Wir prüfen, ob SSID und Passwort nicht leer sind (-n)
  if [ -n "$WIFI_SSID" ] && [ -n "$WIFI_PASS" ]; then
	  echo -n "Konfiguriere WLAN ('$WIFI_SSID')... "
  
	  # Lösche existierende Verbindung mit gleichem Namen, um Duplikate zu vermeiden
	  if sudo nmcli connection show "$WIFI_SSID" >/dev/null 2>&1; then
		  sudo nmcli connection delete "$WIFI_SSID" >/dev/null 2>&1
	  fi
  
	  # Neue Verbindung anlegen (funktioniert auch offline)
	  sudo nmcli con add type wifi ifname wlan0 con-name "$WIFI_SSID" ssid "$WIFI_SSID" >/dev/null 2>&1
	  sudo nmcli con modify "$WIFI_SSID" wifi-sec.key-mgmt wpa-psk >/dev/null 2>&1
	  sudo nmcli con modify "$WIFI_SSID" wifi-sec.psk "$WIFI_PASS" >/dev/null 2>&1
  
	  # Check: Existiert das Profil im NetworkManager?
	  if sudo nmcli connection show | grep -q "$WIFI_SSID"; then
		  echo -e "\${GREEN}[OK]\${NC}"
		  WIFI_STATUS="OK"
	  else
		  echo -e "\${RED}[FEHLER]\${NC}"
		  WIFI_STATUS="FAIL"
	  fi
  else
	  echo -e "WLAN Konfiguration... \${YELLOW}[ÜBERSPRUNGEN]\${NC} (SSID oder PW fehlt)"
	  WIFI_STATUS="SKIPPED"
  fi
  
  # 2. AUTOSTART EINRICHTEN (Wayland/XDG)
  echo -n "Erstelle Autostart-Datei... "
  
  AUTOSTART_DIR="$HOME/.config/autostart"
  mkdir -p "$AUTOSTART_DIR"
  
  cat <<EOF > "$AUTOSTART_DIR/kiosk.desktop"
  [Desktop Entry]
  Type=Application
  Name=Kiosk
  Exec=chromium-browser --kiosk --noerrdialogs --disable-infobars --check-for-update-interval=31536000 --incognito $TARGET_URL
  StartupNotify=false
  Terminal=false
  EOF
  
  # Check: Datei vorhanden?
  if [ -f "$AUTOSTART_DIR/kiosk.desktop" ]; then
	  echo -e "\${GREEN}[OK]\${NC}"
	  AUTOSTART_STATUS="OK"
  else
	  echo -e "\${RED}[FEHLER]\${NC}"
	  AUTOSTART_STATUS="FAIL"
  fi
  
  # 3. SCREEN BLANKING DEAKTIVIEREN (Wichtig für Kiosk)
  echo -n "Deaktiviere Bildschirmschoner... "
  # Nutzt das raspi-config Tool im non-interactive Modus (1 = disable blanking)
  if sudo raspi-config nonint do_blanking 1; then
	  echo -e "\${GREEN}[OK]\${NC}"
  else
	  echo -e "\${RED}[WARNUNG - Manuell prüfen]\${NC}"
  fi
  
  echo "------------------------------------------------"
  echo "ZUSAMMENFASSUNG:"
  if [ "$WIFI_STATUS" == "OK" ]; then
	  echo -e "WLAN Profil: \${GREEN}GESPEICHERT\${NC}"
  elif [ "$WIFI_STATUS" == "SKIPPED" ]; then
	  echo -e "WLAN Profil: \${YELLOW}ÜBERSPRUNGEN\${NC}"
  else
	  echo -e "WLAN Profil: \${RED}FEHLGESCHLAGEN\${NC}"
  fi
  
  if [ "$AUTOSTART_STATUS" == "OK" ]; then
	  echo -e "Autostart:   \${GREEN}AKTIVIERT\${NC} ($TARGET_URL)"
  else
	  echo -e "Autostart:   \${RED}FEHLGESCHLAGEN\${NC}"
  fi
  echo "------------------------------------------------"
  
  read -p "Setup abgeschlossen. Jetzt neustarten? (y/n): " confirm
  if [[ $confirm == [yY] || $confirm == [yY][eE][sS] ]]; then
	  echo "Neustart wird initiiert..."
	  sudo reboot
  else
	  echo "Abbruch. Bitte manuell neustarten."
  fi
  `;
}