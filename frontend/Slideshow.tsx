import React, { useState, useRef, useEffect } from "react";
import { useSlideshowMachine } from "./useSlideshowMachine";

// --- Types ---

interface MediaFile {
  name: string;
  type: "image" | "video";
  size: number;
}

interface SlideData {
  href: string;
  type: "image" | "video";
  name: string;
}

// --- Slide ---

function Slide({ slide, index, currentIndex, isActive, direction, isTransitioning, videoRef, totalSlides }: {
  slide: SlideData;
  index: number;
  currentIndex: number;
  isActive: boolean;
  direction: "next" | "prev";
  isTransitioning: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  totalSlides: number;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);

  const isIncoming = isTransitioning && !isActive &&
    ((direction === "next" && index === (currentIndex + 1) % totalSlides) ||
     (direction === "prev" && index === (currentIndex - 1 + totalSlides) % totalSlides));

  let translateX = "100%";
  if (isActive && !isTransitioning) translateX = "0%";
  else if (isActive && isTransitioning) translateX = direction === "next" ? "-100%" : "100%";

  const zIndex = (!isTransitioning && isActive) || (isTransitioning && isIncoming) ? 10 : 0;
  const opacity = (isActive && !isTransitioning) ? 1 : (isIncoming && isTransitioning) ? 1 : (isActive && isTransitioning) ? 0 : 0;

  return (
    <div style={{
      position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
      transform: `translateX(${translateX})`,
      transition: isTransitioning ? "transform 0.4s ease-in-out, opacity 0.4s ease-in-out" : "none",
      opacity, zIndex,
    }}>
      {slide.type === "video" ? (
        <video
          ref={isActive ? videoRef : undefined}
          src={isActive ? slide.href : undefined}
          style={{ width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#000" }}
          muted controls={false} playsInline
        />
      ) : (
        <img
          src={slide.href}
          alt={slide.name}
          onLoad={() => setImageLoaded(true)}
          style={{ width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#000", opacity: imageLoaded ? 1 : 0.5 }}
        />
      )}
    </div>
  );
}

// --- Slideshow ---

const Slideshow: React.FC<{ location: string }> = ({ location }) => {
  const [slides, setSlides] = useState<SlideData[]>([]);

  useEffect(() => {
    fetch(`/api/files/${location}`)
      .then((r) => r.json() as Promise<{ files: MediaFile[] }>)
      .then((data) => {
        setSlides((data.files ?? []).map((f) => ({
          href: `/media/${location}/${f.name}`,
          type: f.type,
          name: f.name,
        })));
      })
      .catch(() => {});
  }, [location]);

  const { currentIndex, direction, isTransitioning, videoRef, goToNext, goToPrev } = useSlideshowMachine(slides);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "q" || e.key === "Q")) {
        e.preventDefault();
        fetch("/api/kill-kiosk", { method: "POST" }).catch(() => {});
        return;
      }
      if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        window.location.href = "/";
        return;
      }
      if (slides.length === 0) return;
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goToNext(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goToPrev(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [slides.length, goToNext, goToPrev]);

  const touchStartX = useRef(0);

  if (slides.length === 0) {
    return (
      <div className="hide-cursor w-full h-screen bg-black overflow-hidden flex items-center justify-center">
        <div className="text-6xl font-bold tracking-tight italic">
          <span className="text-white">GET</span>
          <span className="text-red-600">FIT</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="hide-cursor w-full h-screen bg-black overflow-hidden"
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const diff = touchStartX.current - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) { diff > 0 ? goToNext() : goToPrev(); }
      }}
    >
      <div className="relative w-full h-full">
        {slides.map((slide, index) => (
          <Slide
            key={slide.name}
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

export default Slideshow;
