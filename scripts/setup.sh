#!/bin/bash
# GF-Kiosk Setup -- installs Bun, dependencies, then runs interactive setup

# Always work from repo root (parent of scripts/)
cd "$(dirname "$0")/.."

echo ""
echo "=== GF-Kiosk Setup ==="
echo ""

# 1. Install/update Bun
if command -v bun &>/dev/null; then
  echo "[OK] Bun vorhanden: $(bun --version)"
else
  echo "[*] Bun nicht gefunden -- installiere..."
  if curl -fsSL https://bun.sh/install | bash; then
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    echo "[OK] Bun installiert: $(bun --version)"
  else
    echo "[ERR] Bun-Installation fehlgeschlagen"
    exit 1
  fi
fi

# 2. Install dependencies
echo "[*] Installiere Dependencies..."
if ! bun install; then
  echo "[ERR] bun install fehlgeschlagen"
  exit 1
fi

# 3. Run interactive setup
echo ""
bun scripts/install.ts
