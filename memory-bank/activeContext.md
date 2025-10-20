# Active Context

## Current Focus
Optimizing the GF Board kiosk application initialization and performance.

## Recent Changes
- Fixed Chromium video first-frame flash during slide transitions
- Fixed video sound playing initially by adding muted config to Plyr
- Moved dev-server directory from src/ to root level to prevent build inclusion
- Fixed autoSlide bug in SlideshowView
- Separated timer logic: images use timer, videos use 'ended' event
- Massively reduced logging in appStore and worker
- Fixed duplicate initialization issue by removing StrictMode
- Optimized initializeApp() to prevent race conditions

## Recent Implementation Details

### Chromium Video Flash Fix + Event Cleanup (Latest)
- **Issue**: In Chromium, videos showed first frame during slide-away transition + duplicate timer starts
- **Root Cause**: 
  - `video.currentTime = 0` was set in `slide_before_change` while video still visible during transition
  - Manual setup in `goToNextSlide()` + `slide_changed` event both started timers (duplicate)
- **Solution**: 
  - Split pause and reset logic:
    - `slide_before_change`: Only pause video (using `prev.slideNode.querySelector`)
    - `slide_changed`: Reset `currentTime = 0` after transition completes
  - Remove manual setup from `goToNextSlide()`, rely on events
- **Changes Made**:
  - Refactored `slide_before_change` to use GLightbox event data (`prev.slideNode`)
  - Moved video reset logic to `slide_changed` event
  - Removed `querySelectorAll('video')` in favor of event-specific video reference
  - Removed duplicate manual setup setTimeout from `goToNextSlide()`
- **Result**: No more first-frame flash in Chromium, no duplicate timers, cleaner event-driven architecture

### Dev-Server Directory Move
- **Issue**: dev-server directory was inside src/ and would be included in build
- **Solution**: Moved dev-server/ from src/ to root level
- **Changes Made**:
  - Updated import path in dev.ts: `src/dev-server/devServer.ts` → `dev-server/devServer.ts`
  - Updated import path in devServer.ts: `../../worker/index` → `../worker/index`
  - Updated storage file path in localKV.ts: `src/dev-server/.local-kv.json` → `dev-server/.local-kv.json`
- **Result**: Dev server files no longer included in build output, cleaner project structure

## Bug Fix Details

### Video Sound Fix (Latest)
- **Issue**: Videos played with sound initially before mute settings were applied
- **Root Cause**: Plyr autoplay started before setupVideo() setTimeout could mute the video
- **Solution**: Added `muted: true` and `volume: 0` to Plyr config in GLightbox initialization
- **Result**: Videos are now muted from the very start, no initial sound playback

### AutoSlide Fix
- **Issue**: Images didn't advance after 10s, videos had unreliable timing
- **Root Cause**: Double logic for videos (timer + ended event), unreliable video.duration
- **Solution**: Clean separation - images get 10s timer, videos only use 'ended' event
- **Result**: Reliable slideshow, images advance after 10s, videos after completion

### Initialization Fix
- **Issue**: Application initialized twice due to React StrictMode + async race condition
- **Solution 1**: Removed StrictMode from main.tsx (not needed for kiosk app)
- **Solution 2**: Moved isInitialized flag to start of async function
- **Result**: Single initialization, reduced API calls, cleaner logs

## Implementation Details
- Using React 19.1.1 with TypeScript (without StrictMode)
- Vite 7.1.2 for build tooling
- Cloudflare Workers for backend
- Two main views: location selection and slideshow
- OPFS for offline media storage
- Zustand state management with optimized initialization
