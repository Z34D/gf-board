# GF Board Kiosk Application

## Project Brief
A kiosk application for gym displays that shows media content from Google Drive folders.

## Core Requirements
- Display media (images/videos) on gym screens
- Location-based content selection
- Offline-first with OPFS storage
- Simple slideshow interface
- Google Drive integration for content management

## Success Criteria
- Two main views: location selection and slideshow
- Media sync from Google Drive (shared + location folders)
- OPFS caching for offline operation
- Responsive design for kiosk displays
- State management for location and media

## Technical Constraints
- React + TypeScript + Cloudflare Workers
- Tailwind CSS v4 for styling
- Zustand for state management
- OPFS-tools for file operations
