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
  const imageTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Hilfsfunktion: Setup für Video (ended event)
  const setupVideo = () => {
    const currentVideo = document.querySelector('video')
    if (!currentVideo) return
    
    console.log(`🎬 Setup video: currentTime = ${currentVideo.currentTime}`)
    
    // Nur auf 0 setzen wenn Video NICHT bereits am Anfang ist (< 0.5 Sekunden)
    // Das verhindert Stutter da slide_before_change das Video bereits auf 0 gesetzt hat
    if (currentVideo.currentTime > 0.5) {
      console.log(`🎬 Video not at start, resetting to 0`)
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
      const currentIdx = lightboxRef.current?.index || 0
      console.log(`🎬 Video ended at slide ${currentIdx + 1}/${slides.length}, calling goToNextSlide()`)
      setTimeout(() => goToNextSlide(), VIDEO_END_SLIDE_DELAY)
    }
    
    // Speichere Handler am Element für späteres Cleanup
    (currentVideo as any)._glightboxEndedHandler = endedHandler
    currentVideo.addEventListener('ended', endedHandler)
    
    // Video abspielen
    console.log(`🎬 Playing video from ${currentVideo.currentTime}`)
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
    console.log(`🔍 goToNextSlide called - lightboxRef exists: ${!!lightboxRef.current}, slides: ${slides.length}`)
    
    if (!lightboxRef.current || slides.length === 0) {
      console.log('❌ goToNextSlide: lightboxRef or slides missing')
      return
    }
    
    const currentIndex = lightboxRef.current.index || 0
    const nextIndex = (currentIndex + 1) % slides.length // Modulo für automatischen Loop
    
    console.log(`🔍 Current: ${currentIndex}, Next: ${nextIndex}, Total: ${slides.length}`)
    
    // goToSlide() triggert slide_changed Event, welches den Timer/Video-Setup übernimmt
    console.log(`➡️ Using goToSlide(${nextIndex})`)
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
      console.log(`⏱️ Starting image timer for slide ${currentIndex + 1}/${slides.length}`)
      imageTimerRef.current = setTimeout(() => {
        console.log(`⏱️ Image timer expired, calling goToNextSlide()`)
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

  // GLightbox initialisieren
  useEffect(() => {
    if (slides.length === 0 || lightboxRef.current) return

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

    // Event: Slide geladen
    lightboxRef.current.on('slide_after_load', () => {
      const currentIndex = lightboxRef.current.index || 0
      const currentSlide = slides[currentIndex]
      
      console.log(`🔔 slide_after_load fired: ${currentIndex + 1}/${slides.length}, type: ${currentSlide?.type}`)
      
      if (currentSlide?.type === 'video') {
        // Video-Handling: Zentrale setupVideo() Funktion verwenden
        setTimeout(() => {
          setupVideo()
          
          // Plyr-Controls verstecken
          setTimeout(() => {
            const plyrControls = document.querySelectorAll('.plyr__controls')
            plyrControls.forEach(control => {
              (control as HTMLElement).style.display = 'none'
            })
          }, CONTROLS_HIDE_DELAY)
        }, VIDEO_MUTE_DELAY)
      } else {
        // Bild-Handling: Timer starten
        setTimeout(() => startImageTimer(), TIMER_DELAY_AFTER_LOAD)
      }
    })

    // Event: Slide wechselt (vorher)
    lightboxRef.current.on('slide_before_change', (data: any) => {
      const { prev, current } = data
      console.log(`🔔 slide_before_change: ${prev.slideIndex + 1} → ${current.slideIndex + 1}`)
      
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
        console.log(`⏸️ Pausing prev video (not resetting yet - prevents flash)`)
      }
    })
    
    // Event: Slide gewechselt (nachher)
    lightboxRef.current.on('slide_changed', (data: any) => {
      const { prev, current } = data
      console.log(`🔔 slide_changed: ${prev.slideIndex + 1} → ${current.slideIndex + 1}`)
      
      // Jetzt ist PREV Slide nicht mehr sichtbar → Video zurücksetzen
      // Das passiert NACH der Slide-Transition, daher kein "first frame flash"
      const prevVideo = prev.slideNode?.querySelector('video')
      if (prevVideo) {
        prevVideo.currentTime = 0
        console.log(`🔄 Reset prev video to 0 (now hidden, no flash)`)
      }
      
      const currentIndex = current.slideIndex
      const currentSlide = slides[currentIndex]
      
      console.log(`📍 Slide changed to ${currentIndex + 1}/${slides.length}, type: ${currentSlide?.type}`)
      
      // Timer nur für Bilder starten
      if (currentSlide?.type === 'image') {
        setTimeout(() => startImageTimer(), TIMER_DELAY_AFTER_CHANGE)
      }
      // Videos starten automatisch durch 'ended' Event
    })
    
    // Slideshow starten
    lightboxRef.current.open()
    
    // Initialer Timer-Start für erstes Slide (falls es ein Bild ist)
    setTimeout(() => {
      const currentIndex = lightboxRef.current?.index || 0
      const currentSlide = slides[currentIndex]
      
      if (currentSlide?.type === 'image') {
        startImageTimer()
      }
      // Videos starten automatisch durch 'ended' Event
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
      {/* GLightbox übernimmt die komplette Anzeige */}
    </div>
  )
}

export default SlideshowView
