#!/bin/bash
# GF-Kiosk Setup -- installs Bun, dependencies, then runs interactive setup

# Always work from repo root (parent of scripts/)
cd "$(dirname "$0")/.."

echo ""
echo "=== GF-Kiosk Setup ==="
echo ""

# 1. Ensure Bun is in PATH (installed but not in current shell session)
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

if command -v bun &>/dev/null; then
  echo "[OK] Bun vorhanden: $(bun --version)"
else
  echo "[*] Bun nicht gefunden -- installiere..."
  curl -fsSL https://bun.sh/install | bash
  # Re-export PATH after install (installer modifies .bashrc but not current shell)
  export PATH="$BUN_INSTALL/bin:$PATH"
  if ! command -v bun &>/dev/null; then
    echo "[ERR] Bun-Installation fehlgeschlagen"
    exit 1
  fi
  echo "[OK] Bun installiert: $(bun --version)"
fi

# 2. Install dependencies (clean node_modules if linking fails)
echo "[*] Installiere Dependencies..."
if ! bun install 2>&1; then
  echo "[!] bun install fehlgeschlagen -- bereinige und versuche erneut..."
  rm -rf node_modules bun.lock
  if ! bun install; then
    echo "[ERR] bun install fehlgeschlagen"
    exit 1
  fi
fi

# 3. Run interactive setup
echo ""
bun scripts/install.ts
