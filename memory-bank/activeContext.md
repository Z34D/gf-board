# Active Context

## Current Focus
Optimizing the GF Board kiosk application initialization and performance.

## Recent Changes
- Fixed autoSlide bug in SlideshowView
- Separated timer logic: images use timer, videos use 'ended' event
- Massively reduced logging in appStore and worker
- Fixed duplicate initialization issue by removing StrictMode
- Optimized initializeApp() to prevent race conditions

## Bug Fix Details

### AutoSlide Fix (Latest)
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
