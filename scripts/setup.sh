#!/bin/bash
# GF-Kiosk Setup -- installs Bun, then runs interactive setup

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

# Run interactive setup (no dependencies needed, pure Bun APIs)
bun scripts/install.ts
