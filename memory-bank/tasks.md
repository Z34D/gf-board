# Tasks

## Current Task: Optimize scheduler timings
Status: Completed

### Subtasks
- [X] Change daily sync time from 4am to 1am in appStore.ts
- [X] Change auto-reload from midnight to 3am in index.html
- [X] Update CLAUDE.md documentation with new timings
- [X] Update memory bank with changes
- [X] Add implementation details to activeContext.md

## Previous Task: Hide mouse cursor automatically in slideshow
Status: Completed

### Subtasks
- [X] Add cursor management functions (hideCursor, showCursor)
- [X] Implement mouse movement detection to show cursor temporarily
- [X] Add auto-hide timer for cursor after inactivity (3 seconds)
- [X] Show cursor when keyboard navigation is used
- [X] Hide cursor when slideshow starts
- [X] Clean up cursor timeout on component unmount

## Previous Task: Console log cleanup
Status: Completed

### Subtasks
- [X] Clean up and standardize all console.log messages
- [X] Make logs more concise and consistent
- [X] Keep technical context but reduce verbosity

## Previous Task: Fix Chromium video first-frame flash
Status: Completed

### Subtasks
- [X] Refactor slide_before_change to only pause video
- [X] Add video reset logic to slide_changed event
- [X] Use GLightbox event data (prev.slideNode) instead of querySelectorAll
- [X] Remove duplicate manual setup from goToNextSlide
- [X] Test fix in Chromium

## Previous Task: Fix video sound playing initially
Status: Completed

### Subtasks
- [X] Add muted: true to Plyr config
- [X] Add volume: 0 to Plyr config

## Completed Tasks
- [X] Optimize scheduler timings (1am sync, 3am reload) - Completed on 2025-11-20
- [X] Hide mouse cursor automatically in slideshow - Completed on 2025-01-20
- [X] Wait for sync completion before showing slideshow - Completed on 2025-10-20
- [X] Console log cleanup for better readability - Completed on 2025-10-20
- [X] Fixed Chromium video first-frame flash during transitions - Completed on 2025-10-20
- [X] Fixed video sound playing initially - Completed on 2025-10-20
- [X] Project analysis and setup - Completed on 2025-01-19
- [X] Memory Bank structure creation - Completed on 2025-01-19
- [X] Fixed duplicate initialization issue - Completed on 2025-10-19
- [X] Massively reduced logging across appStore and worker - Completed on 2025-10-19
- [X] Fixed autoSlide bug in SlideshowView - Completed on 2025-10-19
- [X] Moved dev-server out of src directory to prevent build inclusion - Completed on 2025-10-19

## Notes
- Using Tailwind v4 (not v3) as specified
- OPFS-tools for file operations
- Zustand for state management
- Two main views: location selection and slideshow
