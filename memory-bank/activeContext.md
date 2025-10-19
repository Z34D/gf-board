# Active Context

## Current Focus
Optimizing the GF Board kiosk application initialization and performance.

## Recent Changes
- Fixed duplicate initialization issue by removing StrictMode
- Optimized initializeApp() to prevent race conditions
- Set isInitialized flag immediately after guard check
- Eliminated duplicate Google Drive API calls

## Bug Fix Details
- **Issue**: Application initialized twice due to React StrictMode + async race condition
- **Solution 1**: Removed StrictMode from main.tsx (not needed for kiosk app)
- **Solution 2**: Moved isInitialized flag to start of async function (line 546)
- **Result**: Single initialization, reduced API calls, cleaner logs

## Implementation Details
- Using React 19.1.1 with TypeScript (without StrictMode)
- Vite 7.1.2 for build tooling
- Cloudflare Workers for backend
- Two main views: location selection and slideshow
- OPFS for offline media storage
- Zustand state management with optimized initialization
