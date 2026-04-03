import React, { useState } from "react";

interface SlideData {
  href: string;
  type: "image" | "video";
  title?: string;
}

interface SlideProps {
  slide: SlideData;
  index: number;
  currentIndex: number;
  isActive: boolean;
  direction: "next" | "prev";
  isTransitioning: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  totalSlides: number;
}

export const Slide: React.FC<SlideProps> = ({
  slide,
  index,
  currentIndex,
  isActive,
  direction,
  isTransitioning,
  videoRef,
  totalSlides,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);

  const isIncoming =
    isTransitioning &&
    !isActive &&
    ((direction === "next" && index === (currentIndex + 1) % totalSlides) ||
      (direction === "prev" &&
        index === (currentIndex - 1 + totalSlides) % totalSlides));

  let translateX = "100%";

  if (isActive && !isTransitioning) {
    translateX = "0%";
  } else if (isActive && isTransitioning) {
    translateX = direction === "next" ? "-100%" : "100%";
  } else if (isIncoming && isTransitioning) {
    translateX = "100%";
  }

  let zIndex = 0;
  if (!isTransitioning && isActive) {
    zIndex = 10;
  } else if (isTransitioning && isIncoming) {
    zIndex = 10;
  }

  let opacity = 0;
  if (isActive && !isTransitioning) {
    opacity = 1;
  } else if (isActive && isTransitioning) {
    opacity = 0;
  } else if (isIncoming && isTransitioning) {
    opacity = 1;
  }

  const slideStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    transform: `translateX(${translateX})`,
    transition: isTransitioning
      ? "transform 0.4s ease-in-out, opacity 0.4s ease-in-out"
      : "none",
    opacity,
    zIndex,
  };

  return (
    <div style={slideStyle}>
      {slide.type === "video" ? (
        <video
          ref={isActive ? videoRef : undefined}
          src={isActive ? slide.href : undefined}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            backgroundColor: "#000",
          }}
          muted
          controls={false}
          playsInline
        />
      ) : (
        <img
          src={slide.href}
          alt={slide.title || `Slide ${index}`}
          onLoad={() => setImageLoaded(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            backgroundColor: "#000",
            opacity: imageLoaded ? 1 : 0.5,
          }}
        />
      )}
    </div>
  );
};
