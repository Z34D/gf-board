#!/usr/bin/env bun
/**
 * Raspberry Pi Kiosk Setup Script
 *
 * Interactive terminal — prompts for WLAN, PIN etc.
 * Idempotent: safe to run multiple times.
 * Run: bun run setup
 */

const KIOSK_DIR = process.cwd();
const AUTOSTART_DIR = `${process.env.HOME}/.config/labwc`;
const AUTOSTART_FILE = `${AUTOSTART_DIR}/autostart`;
const RC_XML_FILE = `${AUTOSTART_DIR}/rc.xml`;
const BOOT_CONFIG = "/boot/firmware/config.txt";

// --- Helpers ---

import { createInterface } from "node:readline";
const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

async function shell(cmd: string): Promise<{ code: number; stdout: string }> {
  const proc = Bun.spawn(["bash", "-c", cmd], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;
  return { code, stdout: stdout.trim() };
}

async function shellRun(cmd: string): Promise<boolean> {
  const proc = Bun.spawn(["bash", "-c", cmd], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  return code === 0;
}

async function fileContains(path: string, needle: string): Promise<boolean> {
  try {
    const content = await Bun.file(path).text();
    return content.includes(needle);
  } catch {
    return false;
  }
}

async function appendToFile(path: string, content: string): Promise<void> {
  const escaped = content.replace(/'/g, "'\\''");
  await shellRun(`printf '%b\\n' '${escaped}' | sudo tee -a ${path} > /dev/null`);
}

// --- Setup Steps ---

async function setupWlan() {
  const yn = await ask("WLAN konfigurieren? (j/n): ");
  if (yn.toLowerCase() !== "j") return;

  const ssid = await ask("SSID: ");
  const password = await ask("Passwort: ");
  if (!ssid || !password) {
    console.log("[!] SSID oder Passwort leer, ueberspringe WLAN");
    return;
  }

  const safeSsid = ssid.replace(/'/g, "'\\''");
  const safePassword = password.replace(/'/g, "'\\''");

  // Delete existing connection if present (idempotent)
  await shell(`nmcli con delete '${safeSsid}' 2>/dev/null`);

  if (!await shellRun(
    `nmcli con add type wifi con-name '${safeSsid}' ssid '${safeSsid}' wifi-sec.key-mgmt wpa-psk wifi-sec.psk '${safePassword}'`,
  )) {
    console.log("[ERR] WLAN-Verbindung konnte nicht erstellt werden");
    return;
  }

  if (!await shellRun(`nmcli con up '${safeSsid}'`)) {
    console.log("[ERR] WLAN-Verbindung konnte nicht hergestellt werden");
    return;
  }

  console.log("[OK] WLAN verbunden");
}

async function preferUsbWlan() {
  // Nur deaktivieren wenn wlan1 ein echtes USB-Gerät ist
  const { stdout } = await shell("readlink -f /sys/class/net/wlan1 2>/dev/null");
  if (!stdout || !stdout.includes("/usb")) return;

  console.log("[*] USB-WLAN (wlan1) erkannt -- deaktiviere onboard WLAN...");
  if (await fileContains(BOOT_CONFIG, "dtoverlay=disable-wifi")) {
    console.log("[i] Onboard WLAN bereits deaktiviert");
    return;
  }

  await appendToFile(BOOT_CONFIG, "dtoverlay=disable-wifi");
  console.log("[OK] Onboard WLAN wird nach Reboot deaktiviert (USB-WLAN uebernimmt)");
}

async function setupAutoLogin() {
  console.log("[*] Aktiviere Auto-Login...");
  const user = process.env.USER || "pi";
  await shellRun("sudo mkdir -p /etc/systemd/system/getty@tty1.service.d");
  await shellRun(
    `printf '[Service]\\nExecStart=\\nExecStart=-/sbin/agetty --autologin ${user} --noclear %%I $TERM\\n' | sudo tee /etc/systemd/system/getty@tty1.service.d/autologin.conf > /dev/null`,
  );
  console.log("[OK] Auto-Login aktiviert");
}

async function setupKeyboard() {
  console.log("[*] Setze Tastaturlayout auf Deutsch...");
  if (await shellRun("sudo localectl set-keymap de")) {
    console.log("[OK] Tastatur: Deutsch");
  } else {
    console.log("[!] Tastaturlayout konnte nicht gesetzt werden (ueberspringe)");
  }
}

async function setupResolution() {
  console.log("[*] Setze Aufloesung auf 1080p...");
  if (await fileContains(BOOT_CONFIG, "hdmi_group=1")) {
    console.log("[i] HDMI bereits konfiguriert");
    return;
  }
  await appendToFile(BOOT_CONFIG, "hdmi_group=1\\nhdmi_mode=16");
  console.log("[OK] Aufloesung: 1080p");
}

async function disableTranslate() {
  console.log("[*] Deaktiviere Chromium-Uebersetzung...");
  await shellRun("sudo mkdir -p /etc/chromium/policies/managed");
  await shellRun(
    `echo '{ "TranslateEnabled": false }' | sudo tee /etc/chromium/policies/managed/no-translate.json > /dev/null`,
  );
  console.log("[OK] Chromium-Uebersetzung deaktiviert");
}

async function disableScreensaver() {
  console.log("[*] Deaktiviere Screensaver/Blanking...");
  const profile = `${process.env.HOME}/.profile`;
  if (await fileContains(profile, "xset s off")) {
    console.log("[i] Screensaver bereits deaktiviert");
    return;
  }

  const lines = [
    "",
    "# Disable screen blanking for kiosk",
    "xset s off 2>/dev/null || true",
    "xset -dpms 2>/dev/null || true",
    "xset s noblank 2>/dev/null || true",
  ].join("\n");
  const existing = await Bun.file(profile).text().catch(() => "");
  await Bun.write(profile, existing + lines + "\n");
  console.log("[OK] Screensaver deaktiviert");
}

async function disableAutoUpdates() {
  console.log("[*] Deaktiviere automatische Updates...");
  await shell("sudo systemctl disable --now unattended-upgrades.service 2>/dev/null || true");
  await shell("sudo systemctl mask unattended-upgrades.service 2>/dev/null || true");
  console.log("[OK] Auto-Updates deaktiviert");
}

async function setupAutostart() {
  console.log("[*] Konfiguriere Kiosk-Autostart...");
  await shellRun(`mkdir -p ${AUTOSTART_DIR}`);

  const autostart = [
    `bash ${KIOSK_DIR}/scripts/autostart.sh &`,
    // Hide mouse cursor after 5s idle (triggers labwc's HideCursor action via wtype).
    // Cursor reappears automatically on pointer movement (labwc built-in behavior).
    `swayidle -w timeout 5 'wtype -M alt -M logo -k h' &`,
    "",
  ].join("\n");
  await Bun.write(AUTOSTART_FILE, autostart);
  console.log("[OK] Autostart konfiguriert");
}

async function setupCursorHide() {
  console.log("[*] Installiere Cursor-Hide Tools (wtype, swayidle)...");
  if (!await shellRun("sudo apt-get install -y --no-install-recommends wtype swayidle")) {
    console.log("[!] wtype/swayidle konnten nicht installiert werden (ueberspringe)");
    return;
  }

  console.log("[*] Schreibe labwc rc.xml mit HideCursor-Keybind...");
  await shellRun(`mkdir -p ${AUTOSTART_DIR}`);
  const rcXml = `<?xml version="1.0"?>
<openbox_config xmlns="http://openbox.org/3.4/rc">
  <core>
    <xwaylandPersistence>yes</xwaylandPersistence>
  </core>
  <keyboard>
    <keybind key="A-W-h">
      <action name="HideCursor"/>
    </keybind>
  </keyboard>
</openbox_config>
`;
  await Bun.write(RC_XML_FILE, rcXml);
  console.log("[OK] Cursor-Hide konfiguriert (5s Idle -> weg, Maus-Bewegung -> zurueck)");
}

async function setupEnv() {
  console.log("\n[*] Google Drive Konfiguration:");
  const apiKey = await ask("GOOGLE_DRIVE_API_KEY: ");
  const folderId = await ask("GOOGLE_DRIVE_ROOT_FOLDER_ID: ");

  const lines = [
    `GOOGLE_DRIVE_API_KEY=${apiKey}`,
    `GOOGLE_DRIVE_ROOT_FOLDER_ID=${folderId}`,
  ];

  await Bun.write(`${KIOSK_DIR}/.env`, lines.join("\n") + "\n");
  console.log("[OK] .env geschrieben");
}

// --- Main ---

async function main() {
  console.log("\n=== GF-Kiosk Raspberry Pi Setup ===\n");

  await setupWlan();
  await preferUsbWlan();
  await setupAutoLogin();
  await setupKeyboard();
  await setupResolution();
  await disableTranslate();
  await disableScreensaver();
  await disableAutoUpdates();
  await setupCursorHide();
  await setupAutostart();
  await setupEnv();

  console.log(`
=== Setup abgeschlossen! ===

Kiosk wird beim naechsten Reboot automatisch gestartet.
Kiosk verlassen: Alt+Q
`);
}

main().catch(console.error).finally(() => rl.close());
