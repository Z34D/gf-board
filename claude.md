# GF-Board - Project Documentation

> Digital signage kiosk for gym displays. Shows promotional content from Google Drive with offline-first operation.

## Quick Reference

| Item | Value |
|------|-------|
| **Project Root** | `C:\Users\cgzie\Documents\repo\gf-board\` |
| **Stack** | React 19 + TypeScript + Cloudflare Workers + Vite |
| **State** | Zustand |
| **Storage** | OPFS (offline), Google Drive (source) |
| **Styling** | Tailwind CSS v4 |
| **Target** | Raspberry Pi 4 + Chromium (24/7 kiosk) |

## Commands

```bash
npm run dev        # Start dev server (port 5000)
npm run dev:error  # Dev with 30% random API errors (testing)
npm run dev:502    # Dev with 502 simulation (test Service Worker)
npm run build      # Build for production
npm run deploy     # Deploy to Cloudflare Workers
```

---

## Architecture

### High-Level

```
Raspberry Pi (Chromium)
├── Service Worker (offline caching)
├── Snapper Extension (crash detection)
    ↓ HTTPS
Cloudflare Workers (Hono API)
    ↓
Google Drive (Media files per location)
```

### Key Directories

```
gf-board/
├── src/
│   ├── components/          # React components
│   │   ├── LoginPage.tsx
│   │   ├── LocationSelectionView.tsx
│   │   ├── SlideshowView.tsx
│   │   ├── Slide.tsx
│   │   └── slideshow/hooks/
│   │       ├── useSlideshowMachine.ts
│   │       └── useMediaBlobUrls.ts
│   ├── stores/
│   │   └── appStore.ts      # Zustand store
│   ├── utils/               # Utility modules
│   │   ├── opfs.ts          # OPFS file operations
│   │   ├── download.ts      # Download with timeout/retry
│   │   ├── sync.ts          # Background sync logic
│   │   └── errors.ts        # Error handling
│   └── routes/              # TanStack Router
├── worker/
│   └── index.ts             # Hono API (Cloudflare Workers)
├── public/
│   └── sw.js                # Service Worker (offline support)
├── dev-server/              # Local development
└── dist/                    # Build output
```

---

## Offline-First Architecture

The app is designed to work without internet after initial setup:

### Three Layers of Resilience

1. **Service Worker** - Caches app shell, serves from cache when Cloudflare is down
2. **OPFS** - Stores media files locally, slideshow works offline
3. **Snapper Extension** - Detects browser crashes, auto-reloads (external Chrome extension)

### Service Worker (`public/sw.js`)

**Strategy:** Cache-first with background update

- Caches app shell (`/`, `/index.html`) on install
- Serves cached version immediately
- Updates cache in background when online
- **Does NOT cache error responses** (502, 503, etc.)
- Falls back to cached `/` when server returns error
- Cache busting via `BUILD_TIME` timestamp on each deploy

```javascript
// Cache-first: instant offline response
caches.match(request).then(cached => {
  if (cached) {
    // Update in background, return cached immediately
    fetch(request).then(response => {
      if (response.ok) cache.put(request, response);
    });
    return cached;
  }
  // Not cached - fetch and cache
  return fetch(request);
});
```

### Snapper Chrome Extension

**Purpose:** Detect browser crashes that Service Worker can't handle

We use the external "Snapper" extension from the Chrome Web Store:
- **Chrome Web Store:** https://chromewebstore.google.com/detail/snapper-aw-snap-tab-reloa/jehgbfogcmbekbbcadldojojckehlkbi
- **GitHub:** https://github.com/bizplay/snapper

**How it works:**
- Polls all tabs every 30 seconds
- Executes a no-op (`1+1`) via `chrome.scripting.executeScript()`
- If `chrome.runtime.lastError` is set → tab is crashed
- Auto-reloads crashed tabs

**Detects:**
- "Aw, Snap!" crash pages
- Unresponsive tabs
- Out of memory crashes

**Does NOT detect** (handled by Service Worker instead):
- HTTP errors (500, 502, 503, 504)
- Cloudflare error pages

---

## Sync Architecture

### Non-Blocking Sync Pattern

1. **App starts immediately** with cached OPFS files
2. **Background sync** checks for changes on Google Drive
3. **Only changed files** are downloaded to `/update/` directory
4. **Files moved** from `/update/` to `/media/` after successful download
5. **Slideshow continues** uninterrupted during sync

```
OPFS Structure:
├── /media/      ← Active files (slideshow reads here)
└── /update/     ← Temporary download directory (always cleared after sync)
```

### Sync Flow

```
triggerSync()
    ↓
fetchLocationFiles()     → Get file list from API
    ↓
compareFiles()           → Determine: new, updated, deleted, unchanged
    ↓
deleteFile() × N         → Remove deleted files from /media/
    ↓
downloadFile() × N       → Download only new/updated to /update/
    ↓
Move files               → Move from /update/ to /media/
    ↓
clearDir(/update/)       → Clean up temp directory
    ↓
loadLocalMedia()         → Refresh slideshow
```

### Network Error Handling

**Network offline** (`ERR_INTERNET_DISCONNECTED`, `Failed to fetch`):
- Sync aborts immediately (no retry)
- App continues with cached media
- Next scheduled sync will retry

**Server errors** (500, 502, 503):
- Service Worker serves cached app
- API calls fail, sync aborts
- Media files still work from OPFS

**Download timeout** (10 minutes per file):
- File marked as failed
- Retry up to 5 times with exponential backoff
- Other files continue downloading

### Automatic Recovery

| Time | Action |
|------|--------|
| 1:00 AM | Scheduled sync (configurable) |
| 3:00 AM | Auto page reload (fresh state) |

If network returns at 2 AM, the 3 AM reload will sync everything.

---

## Key Files

### Utils (`src/utils/`)

| File | Purpose |
|------|---------|
| `opfs.ts` | OPFS operations: read, write, list, delete, directories |
| `download.ts` | Download with 10min timeout, streaming to blob, network error detection |
| `sync.ts` | Background sync, file comparison, immediate abort on network failure |
| `errors.ts` | Safe async wrappers, global error handlers |

### Store (`src/stores/appStore.ts`)

Zustand store with:
- `selectedLocation` - Current gym
- `mediaFiles` - Array of media objects
- `syncStatus` - Syncing state, errors, messages
- `schedulerConfig` - Auto-sync settings (interval, enabled)
- `triggerSync()` - Start background sync
- `loadLocalMedia()` - Load from OPFS
- `startScheduler()` - Start auto-sync timer

### Slideshow Hooks

| Hook | Purpose |
|------|---------|
| `useSlideshowMachine` | State machine: IDLE → LOADING → READY → PLAYING |
| `useMediaBlobUrls` | Convert OPFS files to blob URLs |

---

## Features

### Locations

5 German gym locations with separate content:
- Flieden, Neuhof, Gersfeld, Schlitz, Eichenzell

### Sync Intervals (configurable in dashboard)

- 5 minutes
- 4 hours
- 8 hours
- Daily at 1:00 AM (default)

### Auto-Reload

Page reloads at 3:00 AM for fresh state (configured in `index.html`).

### Authentication

- PIN-based login
- JWT token (10-year validity for kiosk)
- Stored in httpOnly cookie
- PIN cached in localStorage for auto-login
- **Offline mode:** Works without API if PIN is saved

### Keyboard Navigation

- `→` / `Space` - Next slide
- `←` - Previous slide
- `L` - Return to location selection

---

## Development

### Environment Variables

**Dev (`dev-server/`):**
```
BACKEND_PORT=3001
FRONTEND_PORT=5000
RANDOM_ERROR_RATE=0-100  # Percentage of API calls that fail (testing)
Default PIN: 1234
```

**Production (Cloudflare):**
```
GOOGLE_DRIVE_API_KEY     # Environment variable
KIOSK_PIN                # Environment variable
JWT_SECRET               # Environment variable
```

### Google Drive Structure

```
Root Folder/
├── Shared/              ← Content for all locations
├── Flieden/             ← Location-specific
├── Neuhof/
├── Gersfeld/
├── Schlitz/
└── Eichenzell/
```

### Testing

```bash
# Test error handling (random API failures)
npm run dev:error

# Test Service Worker with 502 errors
npm run dev:502
# Then use DevTools → Network → Offline to test SW fallback
```

### Installing Snapper Extension

1. Open Chrome Web Store: https://chromewebstore.google.com/detail/snapper-aw-snap-tab-reloa/jehgbfogcmbekbbcadldojojckehlkbi
2. Click "Add to Chrome"
3. Extension auto-monitors all tabs for crashes

---

## Debugging

### Clear OPFS

```javascript
// Browser console
const root = await navigator.storage.getDirectory();
for await (const [name] of root) {
  await root.removeEntry(name, { recursive: true });
}
```

### Clear Saved PIN

```javascript
localStorage.removeItem('gf-kiosk-pin')
```

### Unregister Service Worker

```javascript
// Browser console
navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
```

### Check Scheduler Status

Console shows: `⏰ Scheduler active: daily1am, next sync: 31.12.2025, 01:00:00`

### RPi Monitoring

```bash
# Memory
watch -n 1 'free -h'

# Chromium processes
ps aux | grep chromium
```

---

## Raspberry Pi Optimizations

### Optimized Chromium Kiosk Command

```bash
chromium-browser \
  # === KIOSK & WINDOW ===
  --start-maximized \
  --start-fullscreen \
  --user-data-dir=$HOME/.chromium-kiosk \
  --ozone-platform=wayland \
  \
  # === MEMORY OPTIMIZATION (wichtig für Pi!) ===
  --disable-dev-shm-usage \
  --memory-pressure-off \
  \
  # === DISABLE BACKGROUND ACTIVITY ===
  --disable-background-networking \
  --disable-background-timer-throttling \
  --disable-renderer-backgrounding \
  --disable-backgrounding-occluded-windows \
  --disable-component-update \
  --disable-sync \
  --disable-domain-reliability \
  \
  # === DISABLE UI INTERRUPTIONS ===
  --noerrdialogs \
  --disable-infobars \
  --disable-hang-monitor \
  --disable-prompt-on-repost \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --no-first-run \
  \
  # === DISABLE UNNECESSARY FEATURES ===
  --disable-client-side-phishing-detection \
  --disable-default-apps \
  --password-store=basic \
  --use-mock-keychain \
  \
  # === FEATURES ===
  --enable-features=OverlayScrollbar \
  --disable-features=Translate,TranslateUI \
  \
  "https://gf-kiosk.brandwork.tech/"
```

**One-liner für labwc autostart (Fullscreen, F11 zum Verlassen):**
```bash
chromium-browser --start-maximized --start-fullscreen --user-data-dir=$HOME/.chromium-kiosk --ozone-platform=wayland --disable-dev-shm-usage --memory-pressure-off --disable-background-networking --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-component-update --disable-sync --disable-domain-reliability --noerrdialogs --disable-infobars --disable-hang-monitor --disable-prompt-on-repost --disable-session-crashed-bubble --disable-restore-session-state --no-first-run --disable-client-side-phishing-detection --disable-default-apps --password-store=basic --use-mock-keychain --enable-features=OverlayScrollbar --disable-features=Translate,TranslateUI "https://gf-kiosk.brandwork.tech/" &
```

**One-liner mit echtem Kiosk-Modus (versteckt Cursor, kein Escape möglich):**
```bash
chromium-browser --kiosk --user-data-dir=$HOME/.chromium-kiosk --ozone-platform=wayland --disable-dev-shm-usage --memory-pressure-off --disable-background-networking --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-component-update --disable-sync --disable-domain-reliability --noerrdialogs --disable-infobars --disable-hang-monitor --disable-prompt-on-repost --disable-session-crashed-bubble --disable-restore-session-state --no-first-run --disable-client-side-phishing-detection --disable-default-apps --password-store=basic --use-mock-keychain --enable-features=OverlayScrollbar --disable-features=Translate,TranslateUI "https://gf-kiosk.brandwork.tech/" &
```

| Modus | Flag | Cursor | Escape |
|-------|------|--------|--------|
| Fullscreen | `--start-fullscreen` | Sichtbar | F11 |
| Kiosk | `--kiosk` | Versteckt | Nicht möglich (SSH/VNC nötig) |

| Flag-Gruppe | Zweck |
|-------------|-------|
| Memory | Verhindert Out-of-Memory, limitiert Cache |
| Background | Keine Hintergrund-Netzwerkaktivität, spart CPU/RAM |
| UI | Keine Dialoge, keine Restore-Bubble, keine Infobars |
| Features | Kein Keyring-Popup, keine Extensions, kein Translate |

### Memory

- **Streaming downloads:** No buffering large files in RAM
- **OPFS storage:** Files on disk, not in memory
- **Blob URL management:** Revoke on unmount

### Performance

- **CSS cursor hiding:** No JS event listeners for mouse hide
- **Code splitting:** Lazy load routes
- **Minimal dependencies:** Zustand over Redux
- **React 19:** Automatic memoization (no useCallback needed)

### Reliability

- **Offline-first:** Works without network after initial sync
- **Service Worker:** Cached app shell survives Cloudflare outages
- **Snapper:** Auto-recovers from browser crashes (external extension)
- **No partial states:** Only swap complete downloads

---

## Recent Changes (December 2025)

### Service Worker for Offline Support

- `public/sw.js` caches app shell
- Cache-first strategy for instant offline response
- Only caches successful responses (`response.ok`)
- Cache busting with `BUILD_TIME` on each build
- Falls back to cached `/` when server returns 502/503

### Switched to Snapper Extension

- Removed custom `extension/` folder
- Now using external "Snapper" extension from Chrome Web Store
- More robust crash detection via polling + script execution
- Maintained by bizplay, battle-tested with 287+ users

### Network Error Handling

- Sync aborts immediately on network failure (no infinite retry)
- App continues with cached media
- Recovery on next scheduled sync or page reload

### Dev Testing Commands

- `npm run dev:502` - Simulate Cloudflare 502 errors
- Test Service Worker behavior before production

---

## Known Issues

### Chromium "Aw, Snap!" Error 5

**Cause:** Out of memory after weeks of operation.

**Mitigation:** 
- Snapper extension detects and auto-reloads
- 3 AM auto-reload helps
- Consider weekly Chromium restart via systemd

---

## Glossary

| Term | Meaning |
|------|---------|
| OPFS | Origin Private File System - Browser storage API |
| Blob URL | `blob:http://...` URL for in-memory file |
| SW | Service Worker - Offline caching layer |
| RPi | Raspberry Pi |
