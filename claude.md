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
npm run dev        # Start dev server
npm run dev:error  # Dev with 30% random API errors (testing)
npm run build      # Build for production
npm run deploy     # Deploy to Cloudflare Workers
```

---

## Architecture

### High-Level

```
Raspberry Pi (Chromium)
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
├── dev-server/              # Local development
└── dist/                    # Build output
```

---

## Core Concepts

### Non-Blocking Sync Architecture

The app uses a **non-blocking sync** pattern:

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
fetchLocationFiles()     → Get file list from API (with retry)
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

### Error Handling & Retry

- **API fetch retry:** 5 attempts with exponential backoff (1min → 15min)
- **Download timeout:** 10 minutes per file
- **Download retry:** 5 attempts with exponential backoff
- **Partial failure:** Keep existing media, clear `/update/`, don't corrupt state
- **Global handlers:** Catch unhandled errors, prevent app crashes
- **Offline mode:** If API unreachable but saved PIN exists → continue with cached data

---

## Key Files

### Utils (`src/utils/`)

| File | Purpose |
|------|---------|
| `opfs.ts` | OPFS operations: read, write, list, delete, directories |
| `download.ts` | Download with 10min timeout, streaming to blob |
| `sync.ts` | Background sync, file comparison, retry logic |
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

Page reloads at 3:00 AM for fresh state.

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

## Offline-First Design

The kiosk is designed to work without internet after initial setup:

1. **Saved PIN** in localStorage allows bypass of auth check when API is down
2. **OPFS cache** stores all media files locally
3. **Sync failures** don't crash the app - it continues with existing content
4. **Retry logic** automatically recovers when connection returns

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

### Testing Error Handling

```bash
npm run dev:error  # 30% of API calls randomly fail with 500/503/timeout
```

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

- **CSS cursor hiding:** No JS event listeners
- **Code splitting:** Lazy load routes
- **Minimal dependencies:** Zustand over Redux

### Reliability

- **Offline-first:** Works without network after initial sync
- **Auto-recovery:** Retry failed downloads and API calls
- **No partial states:** Only swap complete downloads

---

## Recent Changes (December 2025)

### Non-Blocking Sync Refactor

- Slideshow starts immediately with cached files
- Sync runs in background, only downloads changed files
- No more copying unchanged files around
- `/update/` directory always cleared after sync

### Retry Logic for All API Calls

- `fetchLocationFiles()` now retries on failure
- Exponential backoff: 1min → 2min → 4min → 8min → 15min
- Up to 5 retry attempts

### Offline Mode

- If auth check fails but saved PIN exists → allow access
- Kiosk continues working when Cloudflare is down

### Dev Error Simulation

- `npm run dev:error` for testing error handling
- Randomly returns 500, 503, or timeout on API calls

---

## Known Issues

### Chromium "Aw, Snap!" Error 5

**Cause:** Out of memory after weeks of operation.

**Workaround:** 
- 3am auto-reload helps
- Consider weekly Chromium restart via systemd

---

## Glossary

| Term | Meaning |
|------|---------|
| OPFS | Origin Private File System - Browser storage API |
| Blob URL | `blob:http://...` URL for in-memory file |
| RPi | Raspberry Pi |
