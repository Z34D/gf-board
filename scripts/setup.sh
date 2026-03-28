#!/bin/bash
# GF-Kiosk Setup -- installs Bun, dependencies, then runs interactive setup

# Always work from repo root (parent of scripts/)
cd "$(dirname "$0")/.."

echo ""
echo "=== GF-Kiosk Setup ==="
echo ""

# Ensure Bun is in PATH (installed but not in current shell session)
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

if command -v bun &>/dev/null; then
  echo "[OK] Bun vorhanden: $(bun --version)"
else
  echo "[*] Bun nicht gefunden -- installiere..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$BUN_INSTALL/bin:$PATH"
  if ! command -v bun &>/dev/null; then
    echo "[ERR] Bun-Installation fehlgeschlagen"
    exit 1
  fi
  echo "[OK] Bun installiert: $(bun --version)"
fi

# Install dependencies (remove stale node_modules on EEXIST link errors)
echo "[*] Installiere Dependencies..."
if ! bun install 2>/tmp/bun-install-err.txt; then
  if grep -q "EEXIST" /tmp/bun-install-err.txt 2>/dev/null; then
    echo "[!] Link-Fehler erkannt -- bereinige node_modules..."
    rm -rf node_modules
    bun install || { echo "[ERR] bun install fehlgeschlagen"; exit 1; }
  else
    cat /tmp/bun-install-err.txt >&2
    echo "[ERR] bun install fehlgeschlagen"
    exit 1
  fi
fi
rm -f /tmp/bun-install-err.txt
echo "[OK] Dependencies installiert"

# Run interactive setup
echo ""
bun scripts/install.ts
