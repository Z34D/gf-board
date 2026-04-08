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

// Video element wrapper with proper cleanup
function VideoSlide({ slide, isActive, isNext, onEnded, onError, videoRef }: {
  slide: SlideData;
  isActive: boolean;
  isNext: boolean;
  onEnded: () => void;
  onError: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  const ref = isActive ? videoRef : localRef;

  // Active video: play + event listeners
  useEffect(() => {
    const video = ref.current;
    if (!video || !isActive) return;

    video.muted = true;
    video.play().catch(() => onError());

    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);

    return () => {
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
    };
  }, [isActive, onEnded, onError, ref]);

  // Cleanup: when not active and not preloading next
  useEffect(() => {
    if (isActive || isNext) return;
    const video = ref.current;
    if (!video) return;

    video.pause();
    video.removeAttribute("src");
    video.load();
  }, [isActive, isNext, ref]);

  // Preload next: set src but don't play
  useEffect(() => {
    if (!isNext || isActive) return;
    const video = ref.current;
    if (!video) return;
    // Ensure src is set for preloading
    if (!video.src || !video.src.includes(slide.href)) {
      video.src = slide.href;
      video.load();
    }
  }, [isNext, isActive, slide.href, ref]);

  return (
    <video
      ref={ref}
      src={isActive || isNext ? slide.href : undefined}
      preload={isNext ? "auto" : undefined}
      muted
      playsInline
      style={{ width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#000" }}
    />
  );
}

const Slideshow: React.FC<{ location: string }> = ({ location }) => {
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartX = useRef(0);
  const slideCountRef = useRef(0);
  const transitioningRef = useRef(false);

  // Fetch slides on mount
  useEffect(() => {
    fetch(`/api/files/${location}`)
      .then((r) => r.json() as Promise<{ files: MediaFile[] }>)
      .then((data) => {
        let mapped = (data.files ?? []).map((f) => ({
          href: `/media/${location}/${f.name}`,
          type: f.type,
          name: f.name,
        }));
        // Single video: duplicate so crossfade/counter/preload all work
        if (mapped.length === 1 && mapped[0].type === "video") {
          mapped = [mapped[0], { ...mapped[0], name: mapped[0].name + "_dup" }];
        }
        setSlides(mapped);
      })
      .catch(() => {});
  }, [location]);

  const transitionTo = useCallback((nextIndex: number) => {
    if (transitioningRef.current) return;
    transitioningRef.current = true;
    setCurrentIndex(nextIndex);
    setTimeout(() => { transitioningRef.current = false; }, FADE_DURATION);
  }, []);

  const goToNext = useCallback(() => {
    if (slides.length <= 1) return;
    slideCountRef.current++;
    if (slideCountRef.current >= RELOAD_AFTER) {
      window.location.reload();
      return;
    }
    transitionTo((currentIndex + 1) % slides.length);
  }, [slides.length, currentIndex, transitionTo]);

  const goToPrev = useCallback(() => {
    if (slides.length <= 1) return;
    transitionTo(currentIndex === 0 ? slides.length - 1 : currentIndex - 1);
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

  // Video safety timeout
  useEffect(() => {
    if (slides.length <= 1) return;
    const slide = slides[currentIndex];
    if (!slide || slide.type !== "video") return;

    const safety = setTimeout(goToNext, VIDEO_TIMEOUT);
    return () => clearTimeout(safety);
  }, [currentIndex, slides, goToNext]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

  const nextIndex = (currentIndex + 1) % slides.length;

  return (
    <div
      className="hide-cursor w-full h-screen bg-black overflow-hidden"
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const diff = touchStartX.current - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) { diff > 0 ? goToNext() : goToPrev(); }
      }}
    >
      {/* All slides in DOM, opacity crossfade */}
      {slides.map((slide, index) => {
        const isActive = index === currentIndex;
        const isNext = slides.length > 1 && index === nextIndex;

        return (
          <div
            key={slide.name}
            style={{
              position: "absolute",
              inset: 0,
              opacity: isActive ? 1 : 0,
              transition: `opacity ${FADE_DURATION}ms ease-in-out`,
              zIndex: isActive ? 2 : isNext ? 1 : 0,
            }}
          >
            {slide.type === "video" ? (
              <VideoSlide
                slide={slide}
                isActive={isActive}
                isNext={isNext}
                onEnded={goToNext}
                onError={goToNext}
                videoRef={videoRef}
              />
            ) : (
              <img
                src={slide.href}
                alt={slide.name}
                style={{ width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#000" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default Slideshow;
