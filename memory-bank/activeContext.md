# Active Context

## Current Focus
Added automatic cursor hiding for cleaner kiosk experience - cursor hides during slideshow and shows temporarily on mouse movement or keyboard use.

## Recent Changes
- Added automatic cursor hiding for cleaner kiosk experience
- Fixed slideshow not updating after sync - now properly re-initializes GLightbox with new content
- Slideshow now waits for sync completion before starting
- Cleaned up and standardized console logs for better clarity
- Fixed Chromium video first-frame flash during slide transitions
- Fixed video sound playing initially by adding muted config to Plyr
- Moved dev-server directory from src/ to root level to prevent build inclusion
- Fixed autoSlide bug in SlideshowView
- Separated timer logic: images use timer, videos use 'ended' event
- Massively reduced logging in appStore and worker
- Fixed duplicate initialization issue by removing StrictMode
- Optimized initializeApp() to prevent race conditions

## Recent Implementation Details

### Automatic Cursor Hiding (Latest)
- **Issue**: Mouse cursor visible during slideshow creates distraction in kiosk environment
- **Solution**: Implement intelligent cursor hiding with temporary show on interaction
- **Changes Made**:
  - Added `cursorTimeoutRef` for managing auto-hide timer
  - Created `hideCursor()` and `showCursor()` functions
  - Added mouse movement detection to temporarily show cursor
  - Added keyboard event detection to show cursor during navigation
  - Implemented 3-second auto-hide timer after cursor becomes visible
  - Hide cursor when slideshow starts
  - Restore cursor to default when component unmounts
- **Result**: Clean kiosk experience with cursor hidden by default, showing temporarily on user interaction

### Slideshow Update Bug Fix
- **Issue**: Slideshow showed old content after sync despite console showing new files were synced
- **Root Cause**: GLightbox instance was created once and never re-initialized when slides changed
- **Solution**: Destroy existing GLightbox instance and re-initialize when slides change
- **Changes Made**:
  - Removed `lightboxRef.current` check that prevented re-initialization
  - Added GLightbox destroy logic before creating new instance
  - Reset `loadedSlidesRef.current.clear()` to prevent duplicate events
  - Added console log for re-initialization tracking
- **Result**: Slideshow now properly updates with new content immediately after sync

### Sync-Aware Slideshow Initialization
- **Issue**: Slideshow started before sync was complete, showing partial/old content
- **Solution**: Check `syncStatus.isSyncing` before initializing GLightbox
- **Changes Made**:
  - Added `syncStatus` from appStore to SlideshowView
  - Added `syncStatus.isSyncing` check in GLightbox useEffect
  - Added loading display during sync
  - Added `syncStatus.isSyncing` to useEffect dependencies
- **Result**: Slideshow only starts after sync is complete, ensuring fresh content

### Event-Driven Architecture Optimization
- **Issue**: 
  - Chromium videos showed first frame during slide-away transition
  - Duplicate/triple timer starts due to multiple event handlers
- **Root Cause**: 
  - `video.currentTime = 0` was set in `slide_before_change` while video still visible
  - Three sources starting timers: `slide_after_load`, `slide_changed`, manual init
  - Different setTimeout delays causing multiple timer starts
- **Solution**: 
  - Split pause and reset logic:
    - `slide_before_change`: Only pause video (using `prev.slideNode.querySelector`)
    - `slide_changed`: Reset `currentTime = 0` after transition completes
  - Clean event separation:
    - `slide_after_load`: Video setup only
    - `slide_changed`: Timer starts (direct call, no setTimeout)
- **Changes Made**:
  - Refactored `slide_before_change` to use GLightbox event data (`prev.slideNode`)
  - Moved video reset logic to `slide_changed` event
  - Removed `querySelectorAll('video')` in favor of event-specific video reference
  - Removed duplicate manual setup from `goToNextSlide()` and initial effect
  - Removed setTimeout wrappers to prevent duplicate timer starts
- **Result**: No more first-frame flash in Chromium, no duplicate timers, fully event-driven architecture

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
