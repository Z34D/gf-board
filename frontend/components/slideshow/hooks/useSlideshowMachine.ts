import { useState, useCallback, useRef, useEffect, useReducer } from "react";

type SlideShowState =
  | "IDLE"
  | "LOADING"
  | "READY"
  | "PLAYING"
  | "TRANSITIONING";

interface SlideShowAction {
  type:
    | "START_LOADING"
    | "MEDIA_READY"
    | "PLAY"
    | "TRANSITION_START"
    | "PAUSE";
}

const reducer = (
  state: SlideShowState,
  action: SlideShowAction,
): SlideShowState => {
  switch (action.type) {
    case "START_LOADING":
      return "LOADING";
    case "MEDIA_READY":
      return "READY";
    case "PLAY":
      return "PLAYING";
    case "TRANSITION_START":
      return "TRANSITIONING";
    case "PAUSE":
      return "READY";
    default:
      return state;
  }
};

interface Slide {
  href: string;
  type: "image" | "video";
  videoDuration?: number;
}

export const useSlideshowMachine = (slides: Slide[]) => {
  const [state, dispatch] = useReducer(reducer, "IDLE");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState<"next" | "prev">("next");

  const videoRef = useRef<HTMLVideoElement>(null);
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goToNextRef = useRef<() => void>(() => {});

  // Start loading when slides are available
  useEffect(() => {
    if (slides.length > 0 && state === "IDLE") {
      dispatch({ type: "START_LOADING" });
    }
  }, [slides.length, state]);

  // Slides ready to play — check that all have a valid href (no blob: check needed)
  useEffect(() => {
    if (state === "LOADING") {
      const allReady = slides.length > 0 && slides.every((s) => !!s.href);
      if (allReady) {
        dispatch({ type: "MEDIA_READY" });
      }
    }
  }, [state, slides]);

  // Play when ready
  useEffect(() => {
    if (state === "READY" && slides.length > 0) {
      dispatch({ type: "PLAY" });
    }
  }, [state, slides.length]);

  // Setup video/image when playing
  useEffect(() => {
    if (state !== "PLAYING" || slides.length === 0) return;

    const currentSlide = slides[currentIndex];
    if (!currentSlide) return;

    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }

    if (currentSlide.type === "video" && videoRef.current) {
      const video = videoRef.current;

      video.currentTime = 0;
      video.muted = true;
      video.volume = 0;
      video.loop = slides.length === 1;

      const playVideo = () => {
        video.play().catch(() => {});

        if (slides.length > 1) {
          const actualDuration =
            (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null)
            ?? currentSlide.videoDuration
            ?? 10;
          const duration = Math.ceil(actualDuration * 1000);

          autoPlayTimerRef.current = setTimeout(() => {
            goToNextRef.current();
          }, duration);
        }
      };

      if (video.readyState >= 2) {
        playVideo();
      } else {
        const handleCanPlay = () => {
          playVideo();
          video.removeEventListener("canplay", handleCanPlay);
        };
        video.addEventListener("canplay", handleCanPlay);
      }
    } else if (currentSlide.type === "image") {
      const IMAGE_DURATION = 10000;

      autoPlayTimerRef.current = setTimeout(() => {
        goToNextRef.current();
      }, IMAGE_DURATION);
    }
  }, [state, currentIndex, slides]);

  const goToNext = useCallback(() => {
    const nextIndex = (currentIndex + 1) % slides.length;
    goToSlide(nextIndex, "next");
  }, [currentIndex, slides.length]);

  useEffect(() => {
    goToNextRef.current = goToNext;
  }, [goToNext]);

  const goToPrev = useCallback(() => {
    const prevIndex = currentIndex === 0 ? slides.length - 1 : currentIndex - 1;
    goToSlide(prevIndex, "prev");
  }, [currentIndex, slides.length]);

  const goToSlide = useCallback(
    (index: number, dir: "next" | "prev") => {
      if (
        index === currentIndex ||
        index < 0 ||
        index >= slides.length ||
        state === "TRANSITIONING"
      ) {
        return;
      }

      if (videoRef.current && videoRef.current.paused === false) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }

      setDirection(dir);
      dispatch({ type: "TRANSITION_START" });

      transitionTimeoutRef.current = setTimeout(() => {
        setCurrentIndex(index);
        dispatch({ type: "PLAY" });
      }, 400);
    },
    [currentIndex, slides.length, state],
  );

  useEffect(() => {
    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
      if (transitionTimeoutRef.current)
        clearTimeout(transitionTimeoutRef.current);
    };
  }, []);

  return {
    state,
    currentIndex,
    direction,
    isTransitioning: state === "TRANSITIONING",
    videoRef,
    goToNext,
    goToPrev,
    goToSlide,
  };
};
