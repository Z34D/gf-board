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

  // Smooth left-to-right slide animation
  let translateX = '100%' // Default: off-screen right

  if (isActive && !isTransitioning) {
    // Current slide is visible
    translateX = '0%'
  } else if (isActive && isTransitioning) {
    // Current slide is leaving
    if (direction === 'next') {
      translateX = '-100%' // Exit to left
    } else {
      translateX = '100%' // Exit to right
    }
  } else if (isIncoming && isTransitioning) {
    // Next slide is entering
    if (direction === 'next') {
      translateX = '100%' // Enter from right
    } else {
      translateX = '-100%' // Enter from left
    }
  }

  const slideStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    transform: `translateX(${translateX})`,
    transition: isTransitioning ? 'transform 0.4s ease-in-out' : 'none',
    zIndex: isActive ? 10 : 0
  }

  return (
    <div style={slideStyle}>
      {slide.type === 'video' ? (
        <video
          ref={isActive ? videoRef : undefined}
          src={slide.href}
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
