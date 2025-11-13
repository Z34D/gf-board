import React, { useState } from 'react'

interface SlideProps {
  slide: any
  index: number
  currentIndex: number
  isActive: boolean
  direction: 'next' | 'prev'
  isTransitioning: boolean
  videoRef: React.RefObject<HTMLVideoElement | null>
  totalSlides: number
}

export const Slide: React.FC<SlideProps> = ({
  slide,
  index,
  currentIndex,
  isActive,
  direction,
  isTransitioning,
  videoRef,
  totalSlides
}) => {
  const [imageLoaded, setImageLoaded] = useState(false)

  // Determine if this is the "incoming" slide during transition
  const isIncoming = isTransitioning && !isActive && (
    (direction === 'next' && index === (currentIndex + 1) % totalSlides) ||
    (direction === 'prev' && index === (currentIndex - 1 + totalSlides) % totalSlides)
  )

  // Animation direction depends on navigation direction
  let translateX = '100%' // Default: off-screen right

  if (isActive && !isTransitioning) {
    // Current slide is visible
    translateX = '0%'
  } else if (isActive && isTransitioning) {
    // Current slide is leaving - always to left
    translateX = '-100%'
  } else if (isIncoming && isTransitioning) {
    // Incoming slide is entering - always from right
    translateX = '100%'
  }

  // zIndex: incoming slide on top during transition, otherwise active slide on top
  let zIndex = 0
  if (!isTransitioning && isActive) {
    zIndex = 10
  } else if (isTransitioning && isIncoming) {
    zIndex = 10
  }

  // Opacity: fade out active, fade in incoming
  let opacity = 0 // Default: hidden
  if (isActive && !isTransitioning) {
    opacity = 1 // Active and not transitioning: fully visible
  } else if (isActive && isTransitioning) {
    opacity = 0 // Active and transitioning: fade out to 0
  } else if (isIncoming && isTransitioning) {
    opacity = 1 // Incoming during transition: fade in to 1
  }

  const slideStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    transform: `translateX(${translateX})`,
    transition: isTransitioning ? 'transform 0.4s ease-in-out, opacity 0.4s ease-in-out' : 'none',
    opacity,
    zIndex
  }

  return (
    <div style={slideStyle}>
      {slide.type === 'video' ? (
        <video
          ref={isActive ? videoRef : undefined}
          src={isActive ? slide.href : undefined}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            backgroundColor: '#000'
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
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            backgroundColor: '#000',
            opacity: imageLoaded ? 1 : 0.5
          }}
        />
      )}
    </div>
  )
}
