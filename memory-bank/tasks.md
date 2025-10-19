# Tasks

## Current Task: Move dev-server out of src directory
Status: Completed

### Subtasks
- [X] Move dev-server directory from src/ to root level
- [X] Update import paths in dev.ts
- [X] Update import paths in devServer.ts  
- [X] Update storage file path in localKV.ts
- [X] Verify dev-server still works after move

## Completed Tasks
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
