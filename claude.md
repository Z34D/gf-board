# GF-Board - Project Documentation

> A gymnasium/fitness facility digital signage kiosk application for displaying promotional content from Google Drive with offline-first operation and intelligent synchronization.

**Project Root:** `C:\Users\cgzie\Documents\repo\gf-board\`
**Repository:** Git-based (main branch)
**Status:** Production-ready
**Last Updated:** November 20, 2025

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Project Structure](#project-structure)
5. [Core Components](#core-components)
6. [Data Flow](#data-flow)
7. [Development Guide](#development-guide)
8. [Deployment Guide](#deployment-guide)
9. [Raspberry Pi Specific](#raspberry-pi-specific)
10. [Recent Fixes & Improvements](#recent-fixes--improvements)
11. [Known Issues & Debugging](#known-issues--debugging)

---

## Project Overview

### What is GF-Board?

GF-Board is a digital signage system designed for fitness facilities (gyms). It displays a slideshow of promotional images and videos on kiosk displays throughout gym locations. The application is optimized for 24/7 operation on Raspberry Pi hardware with automatic content synchronization from Google Drive.

### Key Features

- **Multi-Location Support:** 5 German gym locations with separate content
  - Flieden, Neuhof, Gersfeld, Schlitz, Eichenzell
- **Offline-First:** Uses OPFS (Origin Private File System) to cache files locally
- **Smart Sync:** Intelligent synchronization with Google Drive
  - Configurable intervals: 5 min, 4 hours, 8 hours, or daily at 1am
  - Only downloads/updates changed files
  - Streams large files to prevent RAM overflow on RPi
- **Secure Access:** PIN-based authentication with JWT tokens
- **Kiosk Mode:** Auto-hiding cursor, full-screen presentation
- **Responsive:** Works on various display sizes and resolutions
- **Auto-Refresh:** Automatic page reload at 3am for data freshness

---

## Architecture

### High-Level Architecture

```
┌──────────────────────┐
│  Chromium Browser    │
│  (Raspberry Pi 4)    │
│  ├─ React 19 SPA     │
│  ├─ TanStack Router  │
│  ├─ Zustand state    │
│  └─ OPFS storage     │
└──────────┬───────────┘
           │ HTTPS
           ↓
┌──────────────────────────────────┐
│  Cloudflare Workers (Edge)       │
│  ├─ Hono API server              │
│  ├─ Auth middleware              │
│  ├─ Google Drive proxy           │
│  ├─ Streaming responses          │
│  └─ KV storage                   │
└──────────┬──────────────────────┘
           │
    ┌──────┴──────┐
    ↓             ↓
┌─────────┐  ┌──────────────────┐
│ KV Store│  │ Google Drive API │
│ (Secrets)  │ (Media files)     │
└─────────┘  └──────────────────┘
```

### Architecture Pattern

**Jamstack + Serverless Edge Computing**
- Frontend: Static React SPA
- Backend: Cloudflare Workers (edge functions)
- Storage: Google Drive (content) + Cloudflare KV (config)
- Cache: Browser OPFS (offline)

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 19.2.0 | UI framework |
| TypeScript | 5.8.3 | Type safety |
| Vite | 7.2.2 | Build tool & dev server |
| TanStack Router | 1.134.15 | Client-side routing |
| Tailwind CSS | v4 | Styling |
| Zustand | 5.0.8 | State management |
| opfs-tools | 0.7.4 | OPFS file access |

### Backend

| Technology | Version | Purpose |
|-----------|---------|---------|
| Hono | 4.10.4 | Web framework (Cloudflare Workers) |
| Cloudflare Workers | - | Edge computing |
| Cloudflare KV | - | Key-value storage |
| Google Drive API | v3 | Content source |

### Development

| Tool | Version | Purpose |
|------|---------|---------|
| Bun | latest | Runtime & package manager |
| Wrangler | 4.46.0 | Cloudflare CLI |
| ESLint | 9.39.1 | Code linting |
| @vitejs/plugin-react-swc | 4.2.1 | Fast transpilation |

---

## Project Structure

```
gf-board/
├── src/
│   ├── components/
│   │   ├── LoginPage.tsx              # PIN authentication
│   │   ├── LocationSelectionView.tsx  # Location picker + scheduler
│   │   ├── SlideshowView.tsx          # Main slideshow component
│   │   ├── Slide.tsx                  # Individual slide renderer
│   │   └── slideshow/hooks/
│   │       ├── useSlideshowMachine.ts    # State machine (IMPORTANT)
│   │       ├── useMediaBlobUrls.ts       # OPFS to blob conversion
│   │       └── useCursorManagement.ts    # Cursor auto-hide
│   ├── stores/
│   │   └── appStore.ts                # Zustand store (CORE LOGIC)
│   ├── routes/
│   │   ├── __root.tsx                 # Root layout
│   │   ├── index.tsx                  # Main board
│   │   └── login.tsx                  # Login page
│   ├── App.tsx
│   ├── main.tsx
│   └── vite-env.d.ts
├── worker/
│   └── index.ts                       # Hono API server (BACKEND)
├── dev-server/
│   ├── dev.ts                         # Process manager
│   ├── devServer.ts                   # Hono dev server
│   └── localKV.ts                     # Local KV emulation
├── public/
│   └── gf-favicon.svg
├── dist/                              # Build output
├── index.html                         # Entry point (includes 3am reload)
├── vite.config.ts
├── wrangler.toml                      # Cloudflare config
├── tsconfig.base.json
├── tsconfig.app.json
├── tsconfig.worker.json
├── tsconfig.node.json
├── package.json
├── package-lock.json
└── claude.md                          # This file
```

### Key Files

**CORE LOGIC (Critical for understanding):**
- `src/stores/appStore.ts` - All state management + sync logic (607 lines)
- `worker/index.ts` - Backend API + Google Drive proxy (237 lines)
- `src/components/slideshow/hooks/useSlideshowMachine.ts` - Slideshow state machine (202 lines)

**UI COMPONENTS:**
- `src/components/SlideshowView.tsx` - Main slideshow (123 lines)
- `src/components/LocationSelectionView.tsx` - Location picker (140 lines)
- `src/components/Slide.tsx` - Slide renderer (109 lines)

**DEVELOPMENT:**
- `dev-server/devServer.ts` - Dev environment setup (69 lines)
- `dev-server/localKV.ts` - Local KV storage emulation (78 lines)

---

## Core Components

### 1. State Management (appStore.ts)

**Zustand store managing:**

**Location & Media:**
- `selectedLocation` - Current gym location
- `mediaFiles` - Array of synced media objects
- `availableLocations` - 5 gym locations

**Sync Operations:**
- `syncStatus.isSyncing` - Sync in progress flag
- `syncStatus.lastSync` - Last sync timestamp
- `syncStatus.error` - Error messages
- `syncLocationMedia()` - Main sync orchestrator

**Core Sync Flow:**
```
syncLocationMedia() →
  1. listDriveFolder() - Get folder structure
  2. Collect files from "Shared" + location folders
  3. getLocalFiles() - Get OPFS files
  4. compareFiles() - Determine actions
  5. executeSyncActions() - Download/update/delete
```

**File Operations:**
- `listDriveFolder(folderId)` - Query Google Drive
- `downloadFileFromDrive(fileId)` - Download file
- `saveToOPFS(path, file)` - Save to OPFS
- `loadFromOPFS(path)` - Load from OPFS
- `getLocalFiles()` - Scan OPFS

**Scheduler (Auto-sync):**
- `schedulerConfig` - Interval settings
- `startScheduler()` - Start auto-sync loop
- `stopScheduler()` - Stop scheduler
- `calculateNextSync()` - Compute next sync time

**Persistence:**
- Uses Zustand persist middleware
- Stores to LocalStorage: `"gf-board-storage"`
- Restores on app load

### 2. Slideshow State Machine (useSlideshowMachine.ts)

**State Transitions:**
```
IDLE → LOADING → READY → PLAYING ↔ TRANSITIONING
```

**State Machine Details:**

| State | Trigger | Next State | Action |
|-------|---------|-----------|--------|
| IDLE | slides.length > 0 | LOADING | Init loading |
| LOADING | blob URLs ready | READY | All files loaded |
| READY | slides ready | PLAYING | Start playback |
| PLAYING | Duration elapsed | TRANSITIONING | Prepare next slide |
| TRANSITIONING | 400ms timeout | PLAYING | Show next slide |

**Auto-Advance Logic:**
- **Images:** 10-second timer
- **Videos:** Based on actual duration (via `video.duration`)
  - Fallback: stored duration or default 10s

**Video Playback Fix (Latest):**
- Only plays when `readyState >= 2` (current frame available)
- Uses `canplay` event if metadata not yet loaded
- Sets `currentTime = 0` before playback starts
- Prevents showing last frame (race condition fix)

**Navigation:**
- `goToNext()` - Next slide
- `goToPrev()` - Previous slide
- `goToSlide(index, direction)` - Jump to specific slide

### 3. Cursor Management (useCursorManagement.ts)

**Recent Optimization for RPi:**
- Show cursor on mouse movement
- **50ms debounce** (RPi performance optimization)
- Auto-hide after 3 seconds of inactivity
- Uses `document.documentElement` (not just body) for full coverage

### 4. OPFS to Blob Conversion (useMediaBlobUrls.ts)

**Process:**
1. Memoize mediaFiles to prevent unnecessary re-renders
2. For each file, check if already loaded
3. Load file from OPFS using `opfs-tools`
4. Create blob URL with `URL.createObjectURL()`
5. Map localPath → blobUrl
6. Revoke URLs on component unmount

**Memory Management:**
- Tracks loaded files to avoid duplicate conversions
- Revokes blob URLs only on unmount (not on every change)
- Good for stable gym content

### 5. Slide Renderer (Slide.tsx)

**Handles:**
- Image rendering with `object-fit: contain`
- Video rendering with proper playback setup
- Smooth transitions (0.4s CSS animation)
- Z-index and opacity management for layer ordering
- Dynamic `src` assignment (only when active slide)

**Recent Fix:**
- `src={isActive ? slide.href : undefined}` (not empty string)
- Prevents browser from loading inactive videos unnecessarily

---

## Data Flow

### User Interaction Flow

```
1. LOGIN
   ┌─────────────────────────────────────┐
   │ User enters PIN on LoginPage        │
   └─────────┬───────────────────────────┘
             │ POST /api/auth/login
             ↓
   ┌─────────────────────────────────────┐
   │ Worker verifies PIN (from KV)       │
   │ Generates JWT token                 │
   │ Sets httpOnly cookie                │
   └─────────┬───────────────────────────┘
             │ Redirect to /board
             ↓
   ┌─────────────────────────────────────┐
   │ Route checks /api/auth/check        │
   │ Renders LocationSelectionView       │
   └─────────────────────────────────────┘

2. LOCATION SELECTION
   ┌─────────────────────────────────────┐
   │ User clicks location button         │
   └─────────┬───────────────────────────┘
             │ appStore.setSelectedLocation(location)
             ↓
   ┌─────────────────────────────────────┐
   │ Clear OPFS files (new location)     │
   │ Start syncing                       │
   │ Render SlideshowView                │
   └─────────────────────────────────────┘

3. MEDIA SYNC
   ┌──────────────────────────────────────────┐
   │ appStore.syncLocationMedia(location)     │
   └────────┬─────────────────────────────────┘
            │
            ├─→ listDriveFolder() - Get Google Drive structure
            │
            ├─→ Find "Shared" folder + location folder
            │
            ├─→ Collect images & videos from both
            │
            ├─→ getLocalFiles() - Check OPFS cache
            │
            ├─→ compareFiles()
            │   ├─ New files → download
            │   ├─ Updated files → re-download
            │   ├─ Deleted from Drive → remove from OPFS
            │   └─ Unchanged → skip
            │
            └─→ executeSyncActions()
                └─ Stream downloads (no RAM overflow on RPi)

4. SLIDESHOW RENDERING
   ┌──────────────────────────────────────┐
   │ useMediaBlobUrls hook               │
   │ - OPFS paths → blob URLs            │
   │ - Memoized to prevent re-creation   │
   └─────────┬────────────────────────────┘
             ↓
   ┌──────────────────────────────────────┐
   │ useSlideshowMachine state machine    │
   │ - Manages IDLE→LOADING→READY→PLAYING │
   │ - Auto-advances based on media type  │
   └─────────┬────────────────────────────┘
             ↓
   ┌──────────────────────────────────────┐
   │ Slide components render              │
   │ - Images: 10s timer                 │
   │ - Videos: duration-based timer      │
   │ - Transitions: 0.4s CSS animation   │
   └──────────────────────────────────────┘

5. NAVIGATION
   Keyboard:
   - Right Arrow / Space → Next slide
   - Left Arrow → Previous slide
   - L key → Logout

   Touch:
   - Swipe left → Next slide
   - Swipe right → Previous slide

   Mouse:
   - Movement → Show cursor (3s timeout)

6. AUTO-SYNC SCHEDULER
   ┌──────────────────────────────────────┐
   │ User selects sync interval           │
   └────────┬─────────────────────────────┘
            │ setSchedulerConfig()
            ↓
   ┌──────────────────────────────────────┐
   │ startScheduler()                     │
   │ - setInterval with selected duration │
   │ - Calls syncLocationMedia() on tick  │
   │ - Updates lastSync timestamp         │
   └──────────────────────────────────────┘
```

---

## Development Guide

### Setup

```bash
# Clone repo
git clone <repo-url>
cd gf-board

# Install dependencies
npm install
```

### Local Development

```bash
# Start dev server (backend + frontend)
npm run dev

# Output:
# Backend: http://localhost:3001
# Frontend: http://localhost:5000

# Auto-reload on source changes
# HMR enabled for React components
```

**Dev Server Features:**
- Local KV storage emulation (`.local-kv.json`)
- Default PIN: `1234`
- Google Drive API key: Set in `dev-server/devServer.ts`
- Parallel processes (managed by `dev-server/dev.ts`)

### Build

```bash
# Compile TypeScript + bundle
npm run build

# Output:
# dist/ - Frontend bundles
# .wrangler/ - Worker output

# Creates optimized production build
```

### Testing Locally

**Authentication:**
```bash
# PIN: 1234 (in dev mode)
```

**Google Drive:**
- Configure folder structure in dev backend
- Or use mock data for testing

---

## Deployment Guide

### Prerequisites

1. Cloudflare account with Workers enabled
2. Wrangler CLI authenticated: `wrangler login`
3. Google Drive API key
4. KV namespace created (ID in wrangler.toml)
5. Environment variables configured

### Deployment Steps

```bash
# 1. Build project
npm run build

# 2. Set environment variables in Cloudflare dashboard
# - GOOGLE_DRIVE_API_KEY
# - kiosk_pin (in KV)
# - jwt_secret (in KV, auto-generated)

# 3. Deploy
npm run deploy

# Deployed to: gf-board.cloudflare.workers.dev
# (or custom domain if configured)
```

### Production Configuration

**Cloudflare KV Store (GF_KIOSK_KV):**
```json
{
  "kiosk_pin": "your-secure-pin",
  "jwt_secret": "auto-generated-on-first-run"
}
```

**Environment Variables:**
```bash
GOOGLE_DRIVE_API_KEY=your-api-key
```

### Monitoring

- Check Cloudflare dashboard for Worker metrics
- Monitor KV storage usage
- Review error logs in Workers dashboard

---

## Raspberry Pi Specific

### Key Optimizations

#### 1. Memory-Efficient Streaming

**Problem:** RPi has limited RAM (1-4GB). Large file downloads cause OOM.

**Solution (in worker/index.ts):**
```typescript
// Stream response instead of buffering
return new Response(resp.body, {
  status: resp.status,
  statusText: resp.statusText,
  headers: respHeaders
})
```
- Streams files directly from Google Drive
- No in-memory buffering
- Critical for video files (100MB+)

#### 2. Cursor Management for Touchscreens

**Problem:** Cursor is distracting on touchscreen kiosks.

**Solution (in useCursorManagement.ts):**
- Auto-hides cursor after 3 seconds
- Shows briefly on mouse/keyboard interaction
- **50ms debounce** for mouse events (RPi CPU optimization)
- Uses `document.documentElement` for full coverage

#### 3. Performance Optimizations

- **Code Splitting:** TanStack Router autoCodeSplitting
- **Small Dependencies:** Zustand (lightweight state)
- **SWC Transpilation:** Faster than Babel
- **Tailwind CSS v4:** Smaller output
- **No unused dependencies:** Minimal bundle

#### 4. Browser Compatibility

**Chromium on RPi requirements:**
- OPFS support (Chromium 94+)
- H.264 video codec (recommended)
- Touch event support
- Hardware acceleration for video

### Recommended RPi Setup

**Hardware:**
- Raspberry Pi 4B+ (4GB RAM recommended)
- 5V 3A power supply
- Passive cooling case

**Software:**
```bash
# Raspberry Pi OS (latest)
# Chromium browser (latest)
# Node.js 18+

# Deploy
npm install
npm run build
npm run deploy
```

**Network:**
- Stable WiFi or Ethernet
- Auto-sync handles disconnections
- Offline mode works after initial sync

**Display:**
- 1080p or 4K supported
- Full-screen kiosk mode
- Landscape orientation optimized

---

## Recent Fixes & Improvements

### 1. Scheduler Timing Optimization (Latest - November 2025)

**Files:**
- `src/stores/appStore.ts` - Daily sync time
- `index.html` - Auto-reload time

**Changes:**
- Changed daily sync from 4am to 1am
- Changed auto-reload from midnight to 3am

**Rationale:**
- 1am sync ensures fresh content before 3am reload
- 3am reload provides clean slate for daily operation
- 2-hour gap between sync and reload prevents conflicts
- Optimized for off-peak hours

**Impact:** Better reliability and content freshness for 24/7 kiosk operation

### 2. Cursor Management for RPi

**File:** `src/components/slideshow/hooks/useCursorManagement.ts`

**Changes:**
- Changed from `document.body` to `document.documentElement`
- Added 50ms debounce on mousemove events
- Improved cleanup to prevent memory leaks

**Why:** RPi CPU is limited; debouncing reduces event processing

### 2. Video Playback Race Condition Fix

**File:** `src/components/slideshow/hooks/useSlideshowMachine.ts`

**Problem:** Videos briefly showed last frame before playing from start

**Solution:**
- Only play when `readyState >= 2` (frame available)
- Use `canplay` event for reliability
- Set `currentTime = 0` before playback

**Impact:** Eliminated visual flicker during video transitions

### 3. Removed Unnecessary Timer Margin

**File:** `src/components/slideshow/hooks/useSlideshowMachine.ts`

**Before:**
```typescript
const duration = Math.ceil(actualDuration * 1000) + 500  // +500ms wasted
```

**After:**
```typescript
const duration = Math.ceil(actualDuration * 1000)  // Exact duration
```

**Impact:** Removed 500ms waste per video (10% faster slideshow)

### 4. Dynamic Video `src` Assignment

**File:** `src/components/Slide.tsx`

**Before:**
```typescript
src={slide.href}  // Always set, even for inactive slides
```

**After:**
```typescript
src={isActive ? slide.href : undefined}  // Only when active
```

**Impact:** Prevents browser from pre-loading inactive videos

### 5. Console Logging Cleanup

**Files:** `src/components/slideshow/hooks/useSlideshowMachine.ts`

**Change:** Commented out all console.log() statements

**Why:**
- Reduces CPU overhead on RPi
- Prevents memory leaks from accumulated logs
- Can be re-enabled for debugging

---

## Known Issues & Debugging

### Common Issues

#### 1. "One or more errors occurred while starting the app"

**Cause:** OPFS not available or corrupted

**Fix:**
```javascript
// Clear OPFS in browser console
if (window.navigator.storage?.getDirectory) {
  const root = await window.navigator.storage.getDirectory();
  for await (const [name, handle] of root) {
    await root.removeEntry(name, { recursive: true });
  }
}
```

#### 2. Videos don't play from start

**Cause:** Race condition between loading and playback

**Status:** FIXED (see recent fixes section)

**Debug:** Check console logs (uncomment in useSlideshowMachine.ts)

#### 3. Sync hangs on RPi

**Cause:** Large file downloads without streaming

**Status:** FIXED (worker uses Response streaming)

**Debug:** Check Cloudflare Worker logs

#### 4. Cursor not hiding on touchscreen

**Cause:** Touch events not mapped correctly

**Status:** Documented workaround available

**Debug:** Enable cursor logs and check event firing

### Re-Enabling Debug Logs

```typescript
// In useSlideshowMachine.ts, uncomment these lines:
// console.log(`🔄 [STATE] ${state}`)
// console.log(`📺 [PLAYING] Slide ${currentIndex}...`)
// console.log(`   ▶️ Playing`)
// etc.
```

### Performance Profiling on RPi

```bash
# SSH into RPi
ssh pi@<ip-address>

# Check memory usage
free -h

# Check CPU usage
top

# Monitor network
iftop

# Check browser performance (in Chromium console)
# Enable DevTools for remote debugging
```

---

## Environment Variables

### Development

```bash
# dev-server/devServer.ts
BACKEND_PORT=3001
FRONTEND_PORT=5000
GOOGLE_DRIVE_API_KEY=test-key
```

### Production (Cloudflare)

**Required:**
- `GOOGLE_DRIVE_API_KEY` - Google Drive API key

**KV Store (GF_KIOSK_KV):**
- `kiosk_pin` - Authentication PIN
- `jwt_secret` - JWT signing key (auto-generated)

---

## File Reference by Purpose

### Frontend Components
| File | Purpose | Size |
|------|---------|------|
| `src/components/LoginPage.tsx` | PIN authentication UI | 100 lines |
| `src/components/LocationSelectionView.tsx` | Location picker + scheduler UI | 140 lines |
| `src/components/SlideshowView.tsx` | Main slideshow orchestration | 123 lines |
| `src/components/Slide.tsx` | Individual slide rendering | 109 lines |

### Custom Hooks
| File | Purpose | Size |
|------|---------|------|
| `src/components/slideshow/hooks/useSlideshowMachine.ts` | Slideshow state machine | 202 lines |
| `src/components/slideshow/hooks/useMediaBlobUrls.ts` | OPFS to blob conversion | 83 lines |
| `src/components/slideshow/hooks/useCursorManagement.ts` | Cursor auto-hide | 52 lines |

### State Management
| File | Purpose | Size |
|------|---------|------|
| `src/stores/appStore.ts` | Core Zustand store | 607 lines |

### Backend
| File | Purpose | Size |
|------|---------|------|
| `worker/index.ts` | Hono API server | 237 lines |

### Development
| File | Purpose | Size |
|------|---------|------|
| `dev-server/dev.ts` | Process manager | ~40 lines |
| `dev-server/devServer.ts` | Hono dev server | 69 lines |
| `dev-server/localKV.ts` | KV emulation | 78 lines |

### Configuration
| File | Purpose |
|------|---------|
| `vite.config.ts` | Vite build config |
| `wrangler.toml` | Cloudflare Workers config |
| `tsconfig.base.json` | Base TypeScript config |
| `index.html` | Entry point + 3am reload |

---

## Quick Command Reference

```bash
# Development
npm run dev              # Start dev server

# Building
npm run build            # Build for production
npm run build:frontend   # Build only frontend
npm run build:worker     # Build only worker

# Deployment
npm run deploy           # Deploy to Cloudflare Workers

# Linting
npm run lint             # Run ESLint
npm run lint:fix         # Fix linting issues

# Type checking
npm run tsc              # Check types
```

---

## Notes for Future Development

### Architecture Decisions

1. **Zustand over Redux:** Lightweight, minimal boilerplate
2. **Cloudflare Workers:** Edge computing, no server maintenance
3. **OPFS for caching:** Native browser storage, no size limits
4. **Streaming downloads:** Prevents OOM on RPi
5. **State machine for slideshow:** Predictable, debuggable transitions

### Performance Considerations

- OPFS caching eliminates repeated downloads
- Streaming prevents memory spikes
- CSS transitions hardware-accelerated
- Debouncing reduces event processing
- Code splitting enables lazy loading

### Security

- JWT tokens (10-year validity for kiosk)
- httpOnly cookies
- CORS configured
- Google Drive API key in environment
- PIN stored in Cloudflare KV

### Future Enhancements

- [ ] Add video fade-in effects
- [ ] Multi-language support
- [ ] Advanced analytics
- [ ] Scheduled content updates
- [ ] Weather/information displays
- [ ] Rotation schedules by time of day
- [ ] Admin dashboard for content management

---

## Support & Debugging

### Browser Console Logs

Enable in `useSlideshowMachine.ts` by uncommenting console statements

### Cloudflare Dashboard

- Workers metrics & logs
- KV storage monitoring
- Error tracking

### Local Development

```bash
# SSH into RPi during deployment
ssh pi@<ip>

# Check app status
ps aux | grep chromium

# View Chromium logs (if available)
cat ~/.config/chromium/Default/console-log

# Monitor system resources
watch -n 1 'free -h && echo "---" && top -bn1 | head -12'
```

---

## Glossary

- **OPFS:** Origin Private File System - Browser storage API
- **Blob URL:** `blob:http://...` URL pointing to in-memory file
- **KV:** Key-Value store (Cloudflare)
- **JWT:** JSON Web Token for authentication
- **Wrangler:** Cloudflare CLI tool
- **RPi:** Raspberry Pi
- **SPA:** Single Page Application
- **HMR:** Hot Module Replacement (dev feature)

---

**End of Documentation**

Last Updated: November 20, 2025
Maintained by: Development Team
Contact: [Your contact info]
