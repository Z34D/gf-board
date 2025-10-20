import React, { useEffect, useState, useRef } from 'react'
import { useAppStore } from '../stores/appStore'
import GLightbox from 'glightbox'
import { opfsGLightboxAdapter, type GLightboxSlide } from '../utils/glightboxAdapter'

// GLightbox CSS importieren
import 'glightbox/dist/css/glightbox.css'

// Konstanten
const IMAGE_DISPLAY_DURATION = 10000 // 10 Sekunden
const VIDEO_END_SLIDE_DELAY = 500 // 0.5 Sekunden

const SlideshowView: React.FC = () => {
  const { 
    clearSelectedLocation, 
    mediaFiles,
    syncStatus
  } = useAppStore()
  
  const lightboxRef = useRef<any>(null)
  const [slides, setSlides] = useState<GLightboxSlide[]>([])
  const imageTimerRef = useRef<NodeJS.Timeout | null>(null)
  const loadedSlidesRef = useRef<Set<number>>(new Set())

  // Hilfsfunktion: Setup für Video (ended event)
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
    
    // Entferne alte Event Listener
    const oldListener = (currentVideo as any)._glightboxEndedHandler
    if (oldListener) {
      currentVideo.removeEventListener('ended', oldListener)
    }
    
    // Neuer Event Listener für Video-Ende
    const endedHandler = () => {
      console.log(`🎬 Video ended → next slide`)
      setTimeout(() => goToNextSlide(), VIDEO_END_SLIDE_DELAY)
    }
    
    // Speichere Handler am Element für späteres Cleanup
    (currentVideo as any)._glightboxEndedHandler = endedHandler
    currentVideo.addEventListener('ended', endedHandler)
    
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

  // Timer-Logik für Bilder (nur für Bilder!)
  const startImageTimer = () => {
    // Stoppe vorherigen Timer
    if (imageTimerRef.current) {
      clearTimeout(imageTimerRef.current)
    }

    if (!lightboxRef.current) return

    const currentIndex = lightboxRef.current.index || 0
    const currentSlide = slides[currentIndex]
    
    if (!currentSlide) return
    
    // Timer nur für Bilder setzen
    if (currentSlide.type === 'image') {
      console.log(`⏱️ Image timer started (${IMAGE_DISPLAY_DURATION / 1000}s)`)
      imageTimerRef.current = setTimeout(() => {
        console.log(`⏱️ Image timer expired → next slide`)
        goToNextSlide()
      }, IMAGE_DISPLAY_DURATION)
    }
    // Videos haben keinen Timer - sie nutzen das 'ended' Event
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
    if (slides.length === 0 || lightboxRef.current || syncStatus.isSyncing) return

    lightboxRef.current = GLightbox({
      elements: slides as any,
      autoplayVideos: true,
      loop: false, // Wir machen manuelles Looping mit openAt(0)
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
      
      // Stoppe Image-Timer
      if (imageTimerRef.current) {
        clearTimeout(imageTimerRef.current)
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
      
      // Timer für Bilder starten (ohne setTimeout um Duplikate zu vermeiden)
      if (currentSlide?.type === 'image') {
        startImageTimer()
      }
    })
    
    // Slideshow starten
    // Events (slide_after_load + slide_changed) übernehmen Timer/Video-Setup
    console.log(`✅ Slideshow ready, opening GLightbox`)
    lightboxRef.current.open()
  }, [slides, syncStatus.isSyncing])

  // Keyboard Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!lightboxRef.current) return
      
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
      if (imageTimerRef.current) {
        clearTimeout(imageTimerRef.current)
      }
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
