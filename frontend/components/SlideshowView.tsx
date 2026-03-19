import React, { useEffect } from "react";
import { useAppStore } from "../stores/appStore";
import { useSlideshowMachine } from "./slideshow/hooks/useSlideshowMachine";
import { Slide } from "./Slide";

const SlideshowView: React.FC = () => {
  const clearSelectedLocation = useAppStore((s) => s.clearSelectedLocation);
  const mediaFiles = useAppStore((s) => s.mediaFiles);
  const selectedLocation = useAppStore((s) => s.selectedLocation);

  // Build slides from server-served media URLs (no OPFS, no blobs)
  const slides = React.useMemo(() => {
    if (!selectedLocation) return [];
    return mediaFiles.map((file) => ({
      href: `/media/${selectedLocation}/${file.name}`,
      type: file.type,
      title: file.name,
    }));
  }, [mediaFiles, selectedLocation]);

  const {
    currentIndex,
    direction,
    isTransitioning,
    videoRef,
    goToNext,
    goToPrev,
  } = useSlideshowMachine(slides);

  // Keyboard navigation + Ctrl+Alt+Q to kill kiosk
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Alt+Q → kill Chromium via API
      if (e.altKey && (e.key === "q" || e.key === "Q")) {
        e.preventDefault();
        fetch("/api/kill-kiosk", { method: "POST" }).catch(() => {});
        return;
      }

      if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        clearSelectedLocation();
        return;
      }

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
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [slides.length, goToNext, goToPrev, clearSelectedLocation]);

  // Touch navigation
  const touchStartX = React.useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goToNext();
      else goToPrev();
    }
  };

  // No slides — show logo
  if (slides.length === 0) {
    return (
      <div className="hide-cursor w-full h-screen bg-black overflow-hidden flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl font-bold tracking-tight italic">
            <span className="text-white">GET</span>
            <span className="text-red-600">FIT</span>
          </div>
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
        {slides.map((slide, index) => (
          <Slide
            key={slide.title}
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
