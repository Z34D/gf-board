#!/usr/bin/env bun
/**
 * Raspberry Pi Kiosk Setup Script
 *
 * Interactive terminal — prompts for WLAN, PIN etc.
 * Run: bun run setup
 */

const KIOSK_DIR = process.cwd();
const AUTOSTART_DIR = `${process.env.HOME}/.config/labwc`;
const AUTOSTART_FILE = `${AUTOSTART_DIR}/autostart`;
const BOOT_CONFIG = "/boot/firmware/config.txt";

// --- Helpers ---

async function ask(question: string): Promise<string> {
  process.stdout.write(question);
  const reader = Bun.stdin.stream().getReader();
  const { value } = await reader.read();
  reader.releaseLock();
  return value ? new TextDecoder().decode(value).trim() : "";
}

async function shell(cmd: string): Promise<string> {
  const proc = Bun.spawn(["bash", "-c", cmd], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out.trim();
}

async function shellOrFail(cmd: string): Promise<void> {
  const proc = Bun.spawn(["bash", "-c", cmd], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`Command failed (${code}): ${cmd}`);
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
  await shellOrFail(`printf '%b\\n' '${escaped}' | sudo tee -a ${path} > /dev/null`);
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
  await shellOrFail(
    `nmcli con add type wifi con-name '${safeSsid}' ssid '${safeSsid}' wifi-sec.key-mgmt wpa-psk wifi-sec.psk '${safePassword}'`,
  );
  await shellOrFail(`nmcli con up '${safeSsid}'`);
  console.log("[OK] WLAN verbunden");
}

async function preferUsbWlan() {
  const hasUsbWlan = await shell("ls /sys/class/net/wlan1 2>/dev/null").then((r) => r.length > 0).catch(() => false);
  if (!hasUsbWlan) return;

  console.log("[*] USB-WLAN (wlan1) erkannt -- deaktiviere onboard WLAN...");
  if (!(await fileContains(BOOT_CONFIG, "dtoverlay=disable-wifi"))) {
    await appendToFile(BOOT_CONFIG, "dtoverlay=disable-wifi");
    console.log("[OK] Onboard WLAN wird nach Reboot deaktiviert (USB-WLAN uebernimmt)");
  } else {
    console.log("[i] Onboard WLAN bereits deaktiviert");
  }
}

async function setupAutoLogin() {
  console.log("[*] Aktiviere Auto-Login...");
  const user = process.env.USER || "pi";
  await shellOrFail("sudo mkdir -p /etc/systemd/system/getty@tty1.service.d");
  await shellOrFail(
    `printf '[Service]\\nExecStart=\\nExecStart=-/sbin/agetty --autologin ${user} --noclear %%I $TERM\\n' | sudo tee /etc/systemd/system/getty@tty1.service.d/autologin.conf > /dev/null`,
  );
  console.log("[OK] Auto-Login aktiviert");
}

async function setupKeyboard() {
  console.log("[*] Setze Tastaturlayout auf Deutsch...");
  await shellOrFail("sudo localectl set-keymap de");
  console.log("[OK] Tastatur: Deutsch");
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
  await shellOrFail("sudo mkdir -p /etc/chromium/policies/managed");
  await shellOrFail(
    `echo '{ "TranslateEnabled": false }' | sudo tee /etc/chromium/policies/managed/no-translate.json > /dev/null`,
  );
  console.log("[OK] Chromium-Uebersetzung deaktiviert");
}

async function disableScreensaver() {
  console.log("[*] Deaktiviere Screensaver/Blanking...");
  const profile = `${process.env.HOME}/.profile`;
  if (!(await fileContains(profile, "xset s off"))) {
    const lines = [
      "",
      "# Disable screen blanking for kiosk",
      "xset s off 2>/dev/null || true",
      "xset -dpms 2>/dev/null || true",
      "xset s noblank 2>/dev/null || true",
    ].join("\n");
    const existing = await Bun.file(profile).text().catch(() => "");
    await Bun.write(profile, existing + lines + "\n");
  }
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
  await shellOrFail(`mkdir -p ${AUTOSTART_DIR}`);

  const autostart = [
    `bash ${KIOSK_DIR}/scripts/autostart.sh &`,
    "",
  ].join("\n");

  await Bun.write(AUTOSTART_FILE, autostart);
  console.log("[OK] Autostart konfiguriert");
}

async function setupEnv() {
  console.log("\n[*] Kiosk-Konfiguration:");
  const pin = await ask("KIOSK_PIN: ");

  const lines = [
    `KIOSK_PIN=${pin || "0000"}`,
    `WORKER_URL=https://gf-kiosk.brandwork.tech`,
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
  await setupAutostart();
  await setupEnv();

  console.log(`
=== Setup abgeschlossen! ===

Naechste Schritte:
  1. cd ${KIOSK_DIR}
  2. bun install
  3. bun run start  (oder: sudo reboot fuer Autostart-Test)

Kiosk verlassen:
  Strg+Alt+F3 -> pkill chromium -> Strg+Alt+F7
`);
}

main().catch(console.error);
