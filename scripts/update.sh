#!/bin/bash
# GF-Kiosk Auto-Update — runs before server start
# Safe: always exits 0, never blocks startup
set -o pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_URL="https://github.com/Z34D/gf-board.git"

cd "$REPO_DIR" || exit 0

# --- Repo integrity check ---
# git reset --hard is not crash-safe. If the Pi loses power mid-reset,
# .git/objects can end up empty/corrupt. Detect this and re-clone.
if ! git rev-parse HEAD >/dev/null 2>&1 || ! git fsck --no-dangling --connectivity-only 2>/dev/null; then
    echo "[update] Git repo corrupt — re-cloning..."
    # Preserve local-only files
    cp "$REPO_DIR/.env" /tmp/gf-board-env-backup 2>/dev/null || true
    cp "$REPO_DIR/config.json" /tmp/gf-board-config-backup 2>/dev/null || true
    cp -r "$REPO_DIR/media" /tmp/gf-board-media-backup 2>/dev/null || true
    # Clone to tmp first, then swap (avoids deleting CWD under running script)
    TMPCLONE="/tmp/gf-board-reclone"
    rm -rf "$TMPCLONE"
    if ! timeout 60 git clone "$REMOTE_URL" "$TMPCLONE" 2>/dev/null; then
        echo "[update] Re-clone failed — cannot recover"
        rm -rf "$TMPCLONE"
        exit 0
    fi
    # Swap: remove corrupt, move fresh clone in place
    rm -rf "$REPO_DIR"
    mv "$TMPCLONE" "$REPO_DIR"
    cd "$REPO_DIR" || exit 0
    # Restore local files
    cp /tmp/gf-board-env-backup "$REPO_DIR/.env" 2>/dev/null || true
    cp /tmp/gf-board-config-backup "$REPO_DIR/config.json" 2>/dev/null || true
    if [ -d /tmp/gf-board-media-backup ]; then
        mkdir -p "$REPO_DIR/media"
        cp -r /tmp/gf-board-media-backup/* "$REPO_DIR/media/" 2>/dev/null || true
        rm -rf /tmp/gf-board-media-backup
    fi
    rm -f /tmp/gf-board-env-backup /tmp/gf-board-config-backup
    echo "[update] Repo recovered via re-clone"
    timeout 120 bun install 2>/dev/null || true
    exit 0
fi

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
