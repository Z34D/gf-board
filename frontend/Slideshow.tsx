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

const Slideshow: React.FC<{ location: string }> = ({ location }) => {
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartX = useRef(0);

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
  const slideCountRef = useRef(0);

  const goToNext = useCallback(() => {
    if (slides.length <= 1) return;
    slideCountRef.current++;
    if (slideCountRef.current >= 100) {
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
      video.load(); // forces Chromium to release video buffers
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

  const slide = slides[currentIndex];

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
      <div key={currentIndex} className="w-full h-full fade-in">
        {slide.type === "video" ? (
          <video
            ref={videoRef}
            src={slide.href}
            muted
            playsInline
            style={{ width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#000" }}
          />
        ) : (
          <img
            src={slide.href}
            alt={slide.name}
            style={{ width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#000" }}
          />
        )}
      </div>
    </div>
  );
};

export default Slideshow;
