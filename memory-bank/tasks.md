# Tasks

## Current Task: Fix Chromium video first-frame flash
Status: Completed

### Subtasks
- [X] Refactor slide_before_change to only pause video
- [X] Add video reset logic to slide_changed event
- [X] Use GLightbox event data (prev.slideNode) instead of querySelectorAll
- [X] Test fix in Chromium

## Previous Task: Fix video sound playing initially
Status: Completed

### Subtasks
- [X] Add muted: true to Plyr config
- [X] Add volume: 0 to Plyr config

## Completed Tasks
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
