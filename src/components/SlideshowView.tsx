/**
 * Main slideshow view component
 *
 * Features:
 * - Displays media files from OPFS as a slideshow
 * - Keyboard navigation (arrows, space, L key)
 * - Touch swipe navigation
 * - Shows GetFit logo when no slides available
 * - Subtle sync indicator during background sync
 *
 * @module components/SlideshowView
 */

import React, { useEffect } from "react";
import { useAppStore } from "../stores/appStore";
import { useSlideshowMachine } from "./slideshow/hooks/useSlideshowMachine";
import { useMediaBlobUrls } from "./slideshow/hooks/useMediaBlobUrls";
import { Slide } from "./Slide";

/**
 * Slideshow component for displaying gym promotional content
 * Handles media loading, navigation, and transitions
 */
const SlideshowView: React.FC = () => {
  const { clearSelectedLocation, mediaFiles, syncStatus } = useAppStore();

  // Load OPFS files as blob URLs
  const mediaUrls = useMediaBlobUrls(mediaFiles);

  // Convert mediaFiles to slide format with blob URLs
  const slides = React.useMemo(() => {
    return mediaFiles
      .filter((file) => {
        const blobUrl = mediaUrls[file.name];
        return !!blobUrl;
      })
      .map((file) => {
        const blobUrl = mediaUrls[file.name];
        return {
          href: blobUrl,
          type: file.type,
          title: file.name,
        };
      });
  }, [mediaFiles, mediaUrls]);

  // Slideshow State Machine Hook
  const {
    currentIndex,
    direction,
    isTransitioning,
    videoRef,
    goToNext,
    goToPrev,
  } = useSlideshowMachine(slides);

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow returning to location selection (L key) always
      if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        clearSelectedLocation();
        return;
      }

      // Block navigation if no slides
      if (slides.length === 0) return;

      switch (e.key) {
        case "ArrowRight":
        case " ":
          e.preventDefault();
          goToNext();
          break;
        case "ArrowLeft":
          e.preventDefault();
          goToPrev();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [slides.length, goToNext, goToPrev, clearSelectedLocation]);

  // Touch Navigation
  const touchStartX = React.useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        goToNext();
      } else {
        goToPrev();
      }
    }
  };

  // No slides yet - show GetFit logo (non-blocking, syncing in background)
  if (slides.length === 0) {
    return (
      <div className="hide-cursor w-full h-screen bg-black overflow-hidden flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl font-bold tracking-tight italic">
            <span className="text-white">GET</span>
            <span className="text-red-600">FIT</span>
          </div>
          {syncStatus.isSyncing && syncStatus.message && (
            <div className="mt-4 text-gray-400 text-sm">
              {syncStatus.message}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="hide-cursor w-full h-screen bg-black overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="relative w-full h-full">
        {/* Render all slides */}
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
      </div>
    </div>
  );
};

export default SlideshowView;
