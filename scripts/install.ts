#!/usr/bin/env bun
/**
 * Raspberry Pi Kiosk Setup Script
 *
 * Interactive terminal — prompts for WLAN, API keys etc.
 * Run once on fresh Pi: bun run setup
 * System config (resolution, keybinds, WLAN) is handled by ensure-system.sh
 */

const KIOSK_DIR = process.cwd();
const AUTOSTART_DIR = `${process.env.HOME}/.config/labwc`;
const AUTOSTART_FILE = `${AUTOSTART_DIR}/autostart`;

// --- Helpers ---

import { createInterface } from "node:readline";
const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

async function shell(cmd: string): Promise<{ code: number; stdout: string }> {
  const proc = Bun.spawn(["bash", "-c", cmd], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;
  return { code, stdout: stdout.trim() };
}

async function shellRun(cmd: string): Promise<boolean> {
  const proc = Bun.spawn(["bash", "-c", cmd], {
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  return code === 0;
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
    `nmcli con add type wifi con-name '${safeSsid}' ssid '${safeSsid}' ifname '*' wifi-sec.key-mgmt wpa-psk wifi-sec.psk '${safePassword}'`,
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

async function disableAutoUpdates() {
  console.log("[*] Deaktiviere automatische Updates...");
  await shell("sudo systemctl disable --now unattended-upgrades.service 2>/dev/null || true");
  await shell("sudo systemctl mask unattended-upgrades.service 2>/dev/null || true");
  console.log("[OK] Auto-Updates deaktiviert");
}

async function installDependencies() {
  console.log("[*] Installiere System-Pakete (wtype, swayidle)...");
  if (!await shellRun("sudo apt-get install -y --no-install-recommends wtype swayidle")) {
    console.log("[!] Pakete konnten nicht installiert werden (ueberspringe)");
  } else {
    console.log("[OK] System-Pakete installiert");
  }
}

async function setupAutostart() {
  console.log("[*] Konfiguriere Kiosk-Autostart...");
  await shellRun(`mkdir -p ${AUTOSTART_DIR}`);

  const autostart = [
    `bash ${KIOSK_DIR}/scripts/autostart.sh &`,
    `swayidle -w timeout 5 'wtype -M alt -M logo -k h' &`,
    "",
  ].join("\n");
  await Bun.write(AUTOSTART_FILE, autostart);
  console.log("[OK] Autostart konfiguriert");
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
  await setupAutoLogin();
  await setupKeyboard();
  await disableAutoUpdates();
  await installDependencies();
  await setupAutostart();
  await setupEnv();

  // Run ensure-system.sh to apply system config immediately
  console.log("\n[*] Wende System-Konfiguration an...");
  await shellRun("bash scripts/ensure-system.sh");

  console.log(`
=== Setup abgeschlossen! ===

Kiosk wird beim naechsten Reboot automatisch gestartet.
Kiosk verlassen: Alt+Q
`);
}

main().catch(console.error).finally(() => rl.close());
