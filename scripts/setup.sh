#!/bin/bash
# GF-Kiosk Setup -- installs Bun, dependencies, then runs interactive setup

# Always work from repo root (parent of scripts/)
cd "$(dirname "$0")/.."

echo ""
echo "=== GF-Kiosk Setup ==="
echo ""

# Resolve real user home (works with and without sudo)
REAL_HOME="${HOME:-$(eval echo ~"${SUDO_USER:-$USER}")}"
export BUN_INSTALL="${BUN_INSTALL:-$REAL_HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

# Also check common install locations
for p in /usr/local/bin /usr/bin "$REAL_HOME/.bun/bin"; do
  [ -x "$p/bun" ] && export PATH="$p:$PATH"
done

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

# Install dependencies
echo "[*] Installiere Dependencies..."
if ! bun install --ignore-scripts; then
  echo "[ERR] bun install fehlgeschlagen"
  exit 1
fi
# Run postinstall for the bun npm package using bun itself (no node needed)
[ -f node_modules/bun/install.js ] && bun node_modules/bun/install.js 2>/dev/null || true
echo "[OK] Dependencies installiert"

# Run interactive setup
echo ""
bun scripts/install.ts
