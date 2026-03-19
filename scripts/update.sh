#!/bin/bash
# GF-Kiosk Auto-Update — runs before server start
# Safe: always exits 0, never blocks startup
set -o pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR" || exit 0

echo "[update] Checking for updates..."

# 1. Try git fetch (timeout 15s — skip if offline)
if ! timeout 15 git fetch origin main 2>/dev/null; then
    echo "[update] No internet or git fetch failed — skipping update"
    exit 0
fi

# 2. Check if there are new commits
LOCAL=$(git rev-parse HEAD 2>/dev/null)
REMOTE=$(git rev-parse origin/main 2>/dev/null)

if [ "$LOCAL" = "$REMOTE" ]; then
    echo "[update] Already up to date ($LOCAL)"
    exit 0
fi

echo "[update] New version available: $LOCAL -> $REMOTE"

# 3. Hard reset to remote (no merge conflicts, ever)
if ! git reset --hard origin/main 2>/dev/null; then
    echo "[update] git reset failed — starting with current version"
    exit 0
fi

echo "[update] Code updated to $(git rev-parse --short HEAD)"

# 4. Install dependencies (timeout 120s)
if ! timeout 120 bun install 2>/dev/null; then
    echo "[update] bun install failed — starting with existing dependencies"
    exit 0
fi

echo "[update] Dependencies updated"
exit 0
