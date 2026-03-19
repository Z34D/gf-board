#!/bin/bash
# GF-Kiosk Setup -- installs Bun, dependencies, then runs interactive setup
set -e

# Always work from repo root (parent of scripts/)
cd "$(dirname "$0")/.."

echo ""
echo "=== GF-Kiosk Setup ==="
echo ""

# 1. Install Bun if missing
if ! command -v bun &>/dev/null; then
  echo "[*] Bun nicht gefunden -- installiere..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  echo "[OK] Bun installiert: $(bun --version)"
else
  echo "[OK] Bun vorhanden: $(bun --version)"
fi

# 2. Install dependencies
echo "[*] Installiere Dependencies..."
bun install

# 3. Run interactive setup
echo ""
bun scripts/install.ts
