import React, { useEffect, useState, useRef } from 'react'
import { useAppStore } from '../stores/appStore'
import GLightbox from 'glightbox'
import { opfsGLightboxAdapter, type GLightboxSlide } from '../utils/glightboxAdapter'

// GLightbox CSS importieren
import 'glightbox/dist/css/glightbox.css'

// Konstanten
const IMAGE_DISPLAY_DURATION = 10000 // 10 Sekunden
const TIMER_DELAY_AFTER_LOAD = 1000 // 1 Sekunde
const TIMER_DELAY_AFTER_CHANGE = 500 // 0.5 Sekunden
const VIDEO_MUTE_DELAY = 200 // 0.2 Sekunden
const CONTROLS_HIDE_DELAY = 500 // 0.5 Sekunden
const VIDEO_END_SLIDE_DELAY = 500 // 0.5 Sekunden

const SlideshowView: React.FC = () => {
  const { 
    clearSelectedLocation, 
    mediaFiles
  } = useAppStore()
  
  const lightboxRef = useRef<any>(null)
  const [slides, setSlides] = useState<GLightboxSlide[]>([])
  const autoplayIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Timer-Logik für nächsten Slide
  const startNextSlideTimer = () => {
    // Stoppe vorherigen Timer
    if (autoplayIntervalRef.current) {
      clearTimeout(autoplayIntervalRef.current)
    }

    if (!lightboxRef.current) return

    const currentIndex = lightboxRef.current.index || 0
    const currentSlide = slides[currentIndex]
    
    if (!currentSlide) return
    
    if (currentSlide.type === 'video') {
      // Video-Slide: Finde sichtbares Video-Element
      const allVideos = document.querySelectorAll('video')
      let videoElement: HTMLVideoElement | null = null
      
      for (const video of allVideos) {
        const rect = video.getBoundingClientRect()
        const isVisible = rect.width > 0 && rect.height > 0 && !video.hidden
        
        if (isVisible && video.duration > 0) {
          videoElement = video
          break
        }
      }
      
      if (videoElement) {
        const duration = videoElement.duration * 1000
        autoplayIntervalRef.current = setTimeout(() => {
          lightboxRef.current?.nextSlide()
        }, duration)
      } else {
        // Fallback: 10 Sekunden
        autoplayIntervalRef.current = setTimeout(() => {
          lightboxRef.current?.nextSlide()
        }, IMAGE_DISPLAY_DURATION)
      }
    } else {
      // Bild-Slide: 10 Sekunden
      autoplayIntervalRef.current = setTimeout(() => {
        lightboxRef.current?.nextSlide()
      }, IMAGE_DISPLAY_DURATION)
    }
  }

  // Media Files zu GLightbox Slides konvertieren
  useEffect(() => {
    const convertMediaToSlides = async () => {
      if (mediaFiles.length === 0) {
        setSlides([])
        return
      }

      try {
        const convertedSlides = await opfsGLightboxAdapter.convertToSlides(mediaFiles)
        setSlides(convertedSlides)
      } catch (error) {
        console.error(`❌ [SLIDESHOW] Failed to convert media files:`, error)
        setSlides([])
      }
    }

    convertMediaToSlides()
  }, [mediaFiles])

  // GLightbox initialisieren
  useEffect(() => {
    if (slides.length === 0 || lightboxRef.current) return

    lightboxRef.current = GLightbox({
      elements: slides as any,
      autoplayVideos: true,
      loop: true,
      touchNavigation: true,
      keyboardNavigation: true,
      closeOnOutsideClick: false,
      closeButton: false,
      width: '90vw',
      height: 'auto',
      videosWidth: '90vw',
      descPosition: 'bottom',
      openEffect: 'none',
      closeEffect: 'none',
      slideEffect: 'slide',
      zoomable: false,
      draggable: false,
      plyr: {
        config: {
          ratio: '16:9',
          autoplay: true,
          loop: { active: false },
          controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
          clickToPlay: false,
          keyboard: { focused: false, global: false }
        } as any
      }
    } as any)

    // Event: Slide geladen
    lightboxRef.current.on('slide_after_load', () => {
      setTimeout(() => {
        // Alle Videos stumm schalten
        const allVideos = document.querySelectorAll('video')
        allVideos.forEach(video => {
          video.muted = true
          video.volume = 0
        })
        
        // Versuche Video-Autoplay
        const currentVideo = document.querySelector('video')
        if (currentVideo && currentVideo.paused) {
          currentVideo.play().catch(() => {
            const playButton = document.querySelector('.plyr__control--overlaid, .plyr__play')
            if (playButton) {
              (playButton as HTMLElement).click()
            }
          })
          
          // Loop deaktivieren
          currentVideo.loop = false
          
          // Video-Ende Event
          currentVideo.addEventListener('ended', () => {
            setTimeout(() => {
              lightboxRef.current?.nextSlide()
            }, VIDEO_END_SLIDE_DELAY)
          }, { once: true })
          
          // Timer starten
          setTimeout(() => startNextSlideTimer(), TIMER_DELAY_AFTER_LOAD)
        }
        
        // Plyr-Controls verstecken
        setTimeout(() => {
          const plyrControls = document.querySelectorAll('.plyr__controls')
          plyrControls.forEach(control => {
            (control as HTMLElement).style.display = 'none'
          })
        }, CONTROLS_HIDE_DELAY)
      }, VIDEO_MUTE_DELAY)
    })

    // Event: Slide wechselt (vorher)
    lightboxRef.current.on('slide_before_change', () => {
      // Stoppe alle laufenden Videos
      const allVideos = document.querySelectorAll('video')
      allVideos.forEach(video => {
        if (!video.paused) {
          video.pause()
          video.currentTime = 0
        }
        video.muted = true
        video.volume = 0
      })
    })
    
    // Event: Slide gewechselt (nachher)
    lightboxRef.current.on('slide_after_change', () => {
      setTimeout(() => startNextSlideTimer(), TIMER_DELAY_AFTER_CHANGE)
    })
    
    // Slideshow starten
    lightboxRef.current.open()
    
    // Autoplay starten
    setTimeout(() => {
      startNextSlideTimer()
    }, TIMER_DELAY_AFTER_LOAD)
  }, [slides])

  // Keyboard Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!lightboxRef.current) return
      
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          e.stopPropagation()
          lightboxRef.current.prevSlide()
          break
        case 'ArrowRight':
          e.preventDefault()
          e.stopPropagation()
          lightboxRef.current.nextSlide()
          break
        case 'l':
        case 'L':
          e.preventDefault()
          clearSelectedLocation()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [clearSelectedLocation])

  // Cleanup
  useEffect(() => {
    return () => {
      opfsGLightboxAdapter.cleanup()
      if (lightboxRef.current) {
        lightboxRef.current.destroy()
      }
      if (autoplayIntervalRef.current) {
        clearTimeout(autoplayIntervalRef.current)
      }
    }
  }, [])

  return (
    <div className="w-full h-screen bg-black">
      {/* GLightbox übernimmt die komplette Anzeige */}
    </div>
  )
}

export default SlideshowView
