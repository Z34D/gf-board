#!/bin/bash
# GF-Kiosk Setup -- installs Bun, dependencies, then runs interactive setup

# Always work from repo root (parent of scripts/)
cd "$(dirname "$0")/.."

echo ""
echo "=== GF-Kiosk Setup ==="
echo ""

# 1. Ensure Bun is in PATH (might be installed but not in current shell)
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

if command -v bun &>/dev/null; then
  echo "[OK] Bun vorhanden: $(bun --version)"
else
  echo "[*] Bun nicht gefunden -- installiere..."
  curl -fsSL https://bun.sh/install | bash || { echo "[ERR] Bun-Installation fehlgeschlagen"; exit 1; }
  echo "[OK] Bun installiert: $(bun --version)"
fi

# 2. Install dependencies
echo "[*] Installiere Dependencies..."
bun install || { echo "[ERR] bun install fehlgeschlagen"; exit 1; }

# 3. Run interactive setup
echo ""
bun scripts/install.ts
