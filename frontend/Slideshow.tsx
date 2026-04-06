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
const FADE_DURATION = 500;

const Slideshow: React.FC<{ location: string }> = ({ location }) => {
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fadingOut, setFadingOut] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartX = useRef(0);
  const slideCountRef = useRef(0);
  const pendingIndexRef = useRef<number | null>(null);

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

  // Transition: fade out current, then switch index
  const transitionTo = useCallback((nextIndex: number) => {
    if (fadingOut) return;
    pendingIndexRef.current = nextIndex;
    setFadingOut(true);
    setTimeout(() => {
      setCurrentIndex(nextIndex);
      setFadingOut(false);
      pendingIndexRef.current = null;
    }, FADE_DURATION);
  }, [fadingOut]);

  // Navigation
  const goToNext = useCallback(() => {
    if (slides.length <= 1) return;
    slideCountRef.current++;
    if (slideCountRef.current >= RELOAD_AFTER) {
      window.location.reload();
      return;
    }
    const next = (currentIndex + 1) % slides.length;
    transitionTo(next);
  }, [slides.length, currentIndex, transitionTo]);

  const goToPrev = useCallback(() => {
    if (slides.length <= 1) return;
    const prev = currentIndex === 0 ? slides.length - 1 : currentIndex - 1;
    transitionTo(prev);
  }, [slides.length, currentIndex, transitionTo]);

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
  const nextIndex = pendingIndexRef.current ?? (currentIndex + 1) % slides.length;
  const nextSlide = slides.length > 1 ? slides[nextIndex] : null;

  return (
    <div
      className="hide-cursor w-full h-screen bg-black overflow-hidden"
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const diff = touchStartX.current - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) { diff > 0 ? goToNext() : goToPrev(); }
      }}
    >
      {/* Images: all in DOM, crossfade via opacity */}
      {slides.map((slide, index) =>
        slide.type === "image" ? (
          <div
            key={slide.name}
            style={{
              position: "absolute",
              inset: 0,
              opacity: index === currentIndex && !fadingOut ? 1 : 0,
              transition: `opacity ${FADE_DURATION}ms ease-in-out`,
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

      {/* Next video: preloading underneath (zIndex 2) */}
      {nextSlide?.type === "video" && nextIndex !== currentIndex && (
        <div key={`next-video-${nextIndex}`} style={{ position: "absolute", inset: 0, zIndex: 2 }}>
          <video
            src={nextSlide.href}
            preload="auto"
            muted
            playsInline
            style={{ width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#000" }}
          />
        </div>
      )}

      {/* Current video: on top (zIndex 3), fades out on transition */}
      {currentSlide.type === "video" && (
        <div
          key={`video-${currentIndex}`}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 3,
            opacity: fadingOut ? 0 : 1,
            transition: `opacity ${FADE_DURATION}ms ease-in-out`,
          }}
        >
          <video
            ref={videoRef}
            src={currentSlide.href}
            muted
            playsInline
            style={{ width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#000" }}
          />
        </div>
      )}
    </div>
  );
};

export default Slideshow;
