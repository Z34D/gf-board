import React, { useState, useRef, useEffect, useCallback } from "react";

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

const IMAGE_DURATION = 10_000;
const VIDEO_TIMEOUT = 5 * 60_000;
const HEARTBEAT_INTERVAL = 60_000;
const RELOAD_AFTER = 100;

const Slideshow: React.FC<{ location: string }> = ({ location }) => {
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const preloadRef = useRef<HTMLVideoElement>(null);
  const touchStartX = useRef(0);
  const slideCountRef = useRef(0);

  // Fetch slides on mount
  useEffect(() => {
    fetch(`/api/files/${location}`)
      .then((r) => r.json() as Promise<{ files: MediaFile[] }>)
      .then((data) => {
        setSlides(
          (data.files ?? []).map((f) => ({
            href: `/media/${location}/${f.name}`,
            type: f.type,
            name: f.name,
          })),
        );
      })
      .catch(() => {});
  }, [location]);

  // Navigation
  const goToNext = useCallback(() => {
    if (slides.length <= 1) return;
    slideCountRef.current++;
    if (slideCountRef.current >= RELOAD_AFTER) {
      window.location.reload();
      return;
    }
    setCurrentIndex((i) => (i + 1) % slides.length);
  }, [slides.length]);

  const goToPrev = useCallback(() => {
    if (slides.length <= 1) return;
    setCurrentIndex((i) => (i === 0 ? slides.length - 1 : i - 1));
  }, [slides.length]);

  // Heartbeat
  useEffect(() => {
    const ping = () => fetch("/api/heartbeat", { method: "POST" }).catch(() => {});
    ping();
    const id = setInterval(ping, HEARTBEAT_INTERVAL);
    return () => clearInterval(id);
  }, []);

  // Image auto-advance
  useEffect(() => {
    if (slides.length <= 1) return;
    const slide = slides[currentIndex];
    if (!slide || slide.type !== "image") return;

    const timer = setTimeout(goToNext, IMAGE_DURATION);
    return () => clearTimeout(timer);
  }, [currentIndex, slides, goToNext]);

  // Video setup + cleanup
  useEffect(() => {
    const slide = slides[currentIndex];
    if (!slide || slide.type !== "video") return;

    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.playsInline = true;
    if (slides.length === 1) video.loop = true;

    const onEnded = () => goToNext();
    const onError = () => goToNext();

    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);
    video.play().catch(() => goToNext());

    // Safety timeout: skip stuck videos (not for single-video loop)
    let safety: ReturnType<typeof setTimeout> | null = null;
    if (slides.length > 1) {
      safety = setTimeout(goToNext, VIDEO_TIMEOUT);
    }

    return () => {
      if (safety) clearTimeout(safety);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [currentIndex, slides, goToNext]);

  // Cleanup preload element when it's no longer needed
  useEffect(() => {
    return () => {
      const preload = preloadRef.current;
      if (preload) {
        preload.pause();
        preload.removeAttribute("src");
        preload.load();
      }
    };
  }, [currentIndex]);

  // Keyboard navigation
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
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goToNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToPrev();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [slides.length, goToNext, goToPrev]);

  // No slides — show logo
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

  const currentSlide = slides[currentIndex];
  const nextIndex = (currentIndex + 1) % slides.length;
  const nextSlide = slides.length > 1 ? slides[nextIndex] : null;

  return (
    <div
      className="hide-cursor w-full h-screen bg-black overflow-hidden"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        const diff = touchStartX.current - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) {
          diff > 0 ? goToNext() : goToPrev();
        }
      }}
    >
      {/* Images: all in DOM, toggle visibility via opacity transition */}
      {slides.map((slide, index) =>
        slide.type === "image" ? (
          <div
            key={slide.name}
            style={{
              position: "absolute",
              inset: 0,
              opacity: index === currentIndex ? 1 : 0,
              transition: "opacity 0.5s ease-in-out",
              zIndex: index === currentIndex ? 1 : 0,
            }}
          >
            <img
              src={slide.href}
              alt={slide.name}
              style={{ width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#000" }}
            />
          </div>
        ) : null,
      )}

      {/* Video: only current, mounted/unmounted via key */}
      {currentSlide.type === "video" && (
        <div key={`video-${currentIndex}`} style={{ position: "absolute", inset: 0, zIndex: 2 }}>
          <video
            ref={videoRef}
            src={currentSlide.href}
            muted
            playsInline
            style={{ width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#000" }}
          />
        </div>
      )}

      {/* Preload next video (hidden, just buffering) */}
      {nextSlide?.type === "video" && nextIndex !== currentIndex && (
        <video
          ref={preloadRef}
          key={`preload-${nextIndex}`}
          src={nextSlide.href}
          preload="auto"
          muted
          style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
        />
      )}
    </div>
  );
};

export default Slideshow;
