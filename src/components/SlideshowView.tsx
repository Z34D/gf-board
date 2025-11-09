import React, { useEffect, useState, useRef } from 'react'
import { useAppStore } from '../stores/appStore'
import GLightbox from 'glightbox'
import { opfsGLightboxAdapter, type GLightboxSlide } from '../utils/glightboxAdapter'

// GLightbox CSS importieren
import 'glightbox/dist/css/glightbox.css'

// Konstanten
const IMAGE_DISPLAY_DURATION = 10000 // 10 Sekunden

const SlideshowView: React.FC = () => {
  const {
    clearSelectedLocation,
    mediaFiles,
    syncStatus
  } = useAppStore()

  const lightboxRef = useRef<any>(null)
  const [slides, setSlides] = useState<GLightboxSlide[]>([])
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null)
  const loadedSlidesRef = useRef<Set<number>>(new Set())
  const cursorTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Cursor management functions
  const hideCursor = () => {
    document.body.style.cursor = 'none'
  }

  const showCursor = () => {
    document.body.style.cursor = 'default'
    
    // Clear existing timeout
    if (cursorTimeoutRef.current) {
      clearTimeout(cursorTimeoutRef.current)
    }
    
    // Auto-hide cursor after 3 seconds
    cursorTimeoutRef.current = setTimeout(() => {
      hideCursor()
    }, 3000)
  }

  // Hilfsfunktion: Setup für Video (ohne ended event - nutzen Timer stattdessen)
  const setupVideo = () => {
    const currentVideo = document.querySelector('video')
    if (!currentVideo) return

    console.log(`🎬 Video setup: currentTime=${currentVideo.currentTime.toFixed(2)}s`)

    // Nur auf 0 setzen wenn Video NICHT bereits am Anfang ist (< 0.5 Sekunden)
    // Das verhindert Stutter da slide_before_change das Video bereits auf 0 gesetzt hat
    if (currentVideo.currentTime > 0.5) {
      console.log(`🎬 Video reset to start`)
      currentVideo.pause()
      currentVideo.currentTime = 0
    }

    currentVideo.loop = false
    currentVideo.muted = true
    currentVideo.volume = 0

    // Video abspielen
    console.log(`🎬 Video playing`)
    if (currentVideo.paused) {
      currentVideo.play().catch(() => {
        const playButton = document.querySelector('.plyr__control--overlaid, .plyr__play')
        if (playButton) {
          (playButton as HTMLElement).click()
        }
      })
    }
    // NOTE: Auto-advance wird durch Timer in slide_changed event gehandlet, nicht durch 'ended' event
  }

  // Hilfsfunktion: Zum nächsten Slide mit manuellem Loop
  const goToNextSlide = () => {
    if (!lightboxRef.current || slides.length === 0) {
      console.log('❌ Navigation blocked: no slides')
      return
    }
    
    const currentIndex = lightboxRef.current.index || 0
    const nextIndex = (currentIndex + 1) % slides.length // Modulo für automatischen Loop
    
    console.log(`➡️ Navigate: ${currentIndex + 1} → ${nextIndex + 1} (of ${slides.length})`)
    
    // goToSlide() triggert slide_changed Event, welches den Timer/Video-Setup übernimmt
    lightboxRef.current.goToSlide(nextIndex)
  }

  // Hilfsfunktion: Zum vorherigen Slide mit manuellem Loop
  const goToPrevSlide = () => {
    if (!lightboxRef.current || slides.length === 0) return
    
    const currentIndex = lightboxRef.current.index || 0
    const prevIndex = currentIndex === 0 ? slides.length - 1 : currentIndex - 1
    
    // goToSlide() ist die richtige Methode für Navigation
    lightboxRef.current.goToSlide(prevIndex)
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

  // GLightbox initialisieren (nur wenn Sync abgeschlossen)
  useEffect(() => {
    if (slides.length === 0 || syncStatus.isSyncing) return

    // Destroy existing GLightbox instance if it exists
    if (lightboxRef.current) {
      console.log(`🔄 Re-initializing GLightbox with ${slides.length} slides`)
      lightboxRef.current.destroy()
      lightboxRef.current = null
      // Reset loaded slides tracking for new instance
      loadedSlidesRef.current.clear()
    }

    lightboxRef.current = GLightbox({
      elements: slides as any,
      autoplayVideos: true,
      loop: false, // Wir machen manuelles Looping mit openAt(0)
      touchNavigation: true,
      keyboardNavigation: true,
      closeOnOutsideClick: false,
      closeButton: false,
      width: '100vw',
      height: '100vh',
      videosWidth: '100vw',
      descPosition: 'bottom',
      openEffect: 'none',
      closeEffect: 'none',
      slideEffect: 'slide',
      zoomable: false,
      draggable: false,
      plyr: {
        config: {
          autoplay: true,
          muted: true,
          volume: 0,
          loop: { active: false },
          controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
          clickToPlay: false,
          keyboard: { focused: false, global: false }
        } as any
      }
    } as any)

    // Event: Slide geladen (nur einmal pro Slide)
    lightboxRef.current.on('slide_after_load', () => {
      const currentIndex = lightboxRef.current.index || 0
      const currentSlide = slides[currentIndex]
      
      // Verhindere duplicate slide_after_load Events
      if (loadedSlidesRef.current.has(currentIndex)) {
        return
      }
      loadedSlidesRef.current.add(currentIndex)
      
      if (currentSlide?.type === 'video') {
        // Video-Handling: Zentrale setupVideo() Funktion verwenden
        setupVideo()
      }
      // Timer wird durch slide_changed Event gestartet
    })

    // Event: Slide wechselt (vorher)
    lightboxRef.current.on('slide_before_change', (data: any) => {
      const { prev } = data

      // Stoppe Auto-Play Timer (wird neu gesetzt in slide_changed event)
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current)
        autoPlayTimerRef.current = null
      }

      // Pausiere PREV Video (falls vorhanden), aber setze es NICHT zurück
      // Das verhindert den "first frame flash" in Chromium während der Slide-Transition
      const prevVideo = prev.slideNode?.querySelector('video')
      if (prevVideo) {
        prevVideo.pause()
        prevVideo.muted = true
        prevVideo.volume = 0
        console.log(`⏸️ Video paused`)
      }
    })
    
    // Event: Slide gewechselt (nachher)
    lightboxRef.current.on('slide_changed', (data: any) => {
      const { prev, current } = data

      // Jetzt ist PREV Slide nicht mehr sichtbar → Video zurücksetzen
      // Das passiert NACH der Slide-Transition, daher kein "first frame flash"
      const prevVideo = prev.slideNode?.querySelector('video')
      if (prevVideo) {
        prevVideo.currentTime = 0
        console.log(`🔄 Video reset`)
      }

      const currentIndex = current.slideIndex
      const currentSlide = slides[currentIndex]

      // NEUER TIMER LOGIC: Clearer alter Timer und setze neuen basierend auf Slide-Typ
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current)
        autoPlayTimerRef.current = null
      }

      if (!currentSlide) return

      // Für beide Images UND Videos: Timer basierend auf duration
      let slideDuration = IMAGE_DISPLAY_DURATION
      if (currentSlide.type === 'video' && (currentSlide as any).videoDuration) {
        slideDuration = Math.ceil((currentSlide as any).videoDuration * 1000)
        console.log(`⏱️ Video duration: ${(slideDuration / 1000).toFixed(1)}s`)
      } else if (currentSlide.type === 'image') {
        console.log(`⏱️ Image duration: ${(slideDuration / 1000).toFixed(1)}s`)
      }

      autoPlayTimerRef.current = setTimeout(() => {
        console.log(`➡️ Auto-advance from slide ${currentIndex}`)
        goToNextSlide()
      }, slideDuration)
    })
    
    // Slideshow starten
    // Events (slide_after_load + slide_changed) übernehmen Timer/Video-Setup
    console.log(`✅ Slideshow ready, opening GLightbox`)
    lightboxRef.current.open()
    
    // Hide cursor when slideshow starts
    hideCursor()
  }, [slides, syncStatus.isSyncing])

  // Mouse movement handler for cursor management
  useEffect(() => {
    const handleMouseMove = () => {
      showCursor()
    }

    document.addEventListener('mousemove', handleMouseMove)
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
    }
  }, [])

  // Keyboard Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!lightboxRef.current) return
      
      // Show cursor when keyboard is used
      showCursor()
      
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          e.stopPropagation()
          goToPrevSlide()
          break
        case 'ArrowRight':
          e.preventDefault()
          e.stopPropagation()
          goToNextSlide()
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
  }, [clearSelectedLocation, slides])

  // Cleanup
  useEffect(() => {
    return () => {
      opfsGLightboxAdapter.cleanup()
      if (lightboxRef.current) {
        lightboxRef.current.destroy()
      }
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current)
      }
      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current)
      }
      // Restore cursor when component unmounts
      document.body.style.cursor = 'default'
    }
  }, [])

  return (
    <div className="w-full h-screen bg-black">
      {syncStatus.isSyncing && (
        <div className="flex items-center justify-center h-full">
          <div className="text-6xl font-bold tracking-tight italic">
            <span className="text-white">GET</span>
            <span className="text-red-600">FIT</span>
          </div>
        </div>
      )}
      {/* GLightbox übernimmt die komplette Anzeige nach Sync */}
    </div>
  )
}

export default SlideshowView
