import React, { useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { useCursorManagement } from './slideshow/hooks/useCursorManagement'
import { useSlideshowMachine } from './slideshow/hooks/useSlideshowMachine'
import { useMediaBlobUrls } from './slideshow/hooks/useMediaBlobUrls'
import { Slide } from './Slide'

const SlideshowView: React.FC = () => {
  const { clearSelectedLocation, mediaFiles, syncStatus } = useAppStore()
  const { hideCursor, showCursor } = useCursorManagement()

  // Load OPFS files as blob URLs
  const mediaUrls = useMediaBlobUrls(mediaFiles)

  // Convert mediaFiles to slide format with blob URLs
  // WICHTIG: Wait until mediaUrls are ready before creating slides
  const slides = React.useMemo(() => {
    return mediaFiles.map((file) => {
      const blobUrl = mediaUrls[file.localPath || '']
      if (!blobUrl) {
        console.warn(`⚠️ No blob URL for ${file.name}, using fallback`)
      }
      return {
        href: blobUrl || file.localPath || '',
        type: file.type,
        videoDuration: file.videoDuration,
        title: file.name
      }
    })
  }, [mediaFiles, mediaUrls])

  // Slideshow State Machine Hook
  const { currentIndex, direction, isTransitioning, videoRef, goToNext, goToPrev } =
    useSlideshowMachine(slides)

  // Hide cursor when slideshow starts
  useEffect(() => {
    if (!syncStatus.isSyncing && slides.length > 0) {
      hideCursor()
    }
  }, [syncStatus.isSyncing, slides.length, hideCursor])

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (syncStatus.isSyncing || slides.length === 0) return

      switch (e.key) {
        case 'ArrowRight':
        case ' ':
          e.preventDefault()
          goToNext()
          break
        case 'ArrowLeft':
          e.preventDefault()
          goToPrev()
          break
        // Escape is disabled for kiosk mode - prevent users from exiting
        default:
          break
      }
      showCursor()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [slides.length, goToNext, goToPrev, clearSelectedLocation, showCursor, syncStatus.isSyncing])

  // Touch Navigation
  const touchStartX = React.useRef(0)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX
    const diff = touchStartX.current - touchEndX
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        goToNext()
      } else {
        goToPrev()
      }
    }
    showCursor()
  }

  return (
    <div className="w-full h-screen bg-black overflow-hidden" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {syncStatus.isSyncing ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-6xl font-bold tracking-tight italic">
            <span className="text-white">GET</span>
            <span className="text-red-600">FIT</span>
          </div>
        </div>
      ) : slides.length > 0 ? (
        <div className="relative w-full h-full">
          {/* Render all slides - only visible ones show */}
          {slides.map((slide, index) => (
            <Slide
              key={index}
              slide={slide}
              index={index}
              currentIndex={currentIndex}
              isActive={index === currentIndex}
              direction={direction}
              isTransitioning={isTransitioning}
              videoRef={videoRef}
              totalSlides={slides.length}
            />
          ))}

          {/* Kiosk Mode - No UI elements */}
        </div>
      ) : null}
    </div>
  )
}

export default SlideshowView

