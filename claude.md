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
├── Chrome Extension (crash detection)
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
├── extension/               # Chrome extension (crash recovery)
│   ├── manifest.json
│   ├── background.js
│   └── content.js
├── dev-server/              # Local development
└── dist/                    # Build output
```

---

## Offline-First Architecture

The app is designed to work without internet after initial setup:

### Three Layers of Resilience

1. **Service Worker** - Caches app shell, serves from cache when Cloudflare is down
2. **OPFS** - Stores media files locally, slideshow works offline
3. **Chrome Extension** - Detects browser crashes, auto-reloads with backoff

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

### Chrome Extension (`extension/`)

**Purpose:** Detect browser crashes that Service Worker can't handle

Detects:
- "Aw, Snap!" / "Hoppla!" error pages
- Error code 5 (STATUS_ACCESS_VIOLATION)
- Error code 6 (Out of Memory)
- `chrome-error://` URLs

**Does NOT detect** (handled by Service Worker instead):
- HTTP errors (500, 502, 503, 504)
- Cloudflare error pages

**Auto-reload with backoff:** 1s → 2s → 3s → 4s → 5s (capped)

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

### Installing Chrome Extension

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `extension/` folder

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
- **Extension:** Auto-recovers from browser crashes
- **No partial states:** Only swap complete downloads

---

## Recent Changes (December 2025)

### Service Worker for Offline Support

- `public/sw.js` caches app shell
- Cache-first strategy for instant offline response
- Only caches successful responses (`response.ok`)
- Cache busting with `BUILD_TIME` on each build
- Falls back to cached `/` when server returns 502/503

### Chrome Extension Simplified

- Removed HTTP error detection (now handled by Service Worker)
- Only detects browser crashes ("Aw, Snap!", Error 5/6)
- Auto-reload with n+1 second backoff

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
- Chrome Extension detects and auto-reloads
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
