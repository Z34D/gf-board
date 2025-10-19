import React, { useEffect, useState, useRef } from 'react'
import { useAppStore } from '../stores/appStore'
import GLightbox from 'glightbox'
import { opfsGLightboxAdapter, type GLightboxSlide } from '../utils/glightboxAdapter'

// GLightbox CSS importieren
import 'glightbox/dist/css/glightbox.css'

const SlideshowView: React.FC = () => {
  const { 
    selectedLocation, 
    clearSelectedLocation, 
    syncStatus, 
    mediaFiles, 
    schedulerConfig
  } = useAppStore()
  
  const lightboxRef = useRef<any>(null)
  const [slides, setSlides] = useState<GLightboxSlide[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const autoplayIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Funktion um den nächsten Slide-Timer zu starten
  const startNextSlideTimer = () => {
    // Stoppe vorherigen Timer
    if (autoplayIntervalRef.current) {
      clearTimeout(autoplayIntervalRef.current)
    }

    // Prüfe den aktuellen Slide-Typ basierend auf dem aktuellen Slide-Index
    if (lightboxRef.current) {
      const currentIndex = lightboxRef.current.index || 0
      const currentSlide = slides[currentIndex]
      
      console.log(`🎬 [TIMER] Current slide:`, { 
        index: currentIndex, 
        type: currentSlide?.type,
        href: currentSlide?.href?.split('/').pop()
      })
      
      if (currentSlide && currentSlide.type === 'video') {
        // Video-Slide - finde das aktive Video-Element (das sichtbare)
        const allVideos = document.querySelectorAll('video')
        let videoElement = null
        
        console.log(`🎬 [TIMER] Looking for video element, found ${allVideos.length} videos`)
        
        for (const video of allVideos) {
          const rect = video.getBoundingClientRect()
          const isVisible = rect.width > 0 && rect.height > 0 && !video.hidden
          console.log(`🎬 [TIMER] Video check:`, {
            src: video.src.substring(0, 50) + '...',
            visible: isVisible,
            width: rect.width,
            height: rect.height,
            duration: video.duration
          })
          
          if (isVisible && video.duration > 0) {
            videoElement = video
            break
          }
        }
        
        if (videoElement) {
          const duration = videoElement.duration || 0
          console.log(`🎬 [TIMER] Video slide detected, setting timer for ${duration.toFixed(1)}s`)
          console.log(`🎬 [TIMER] Video element details:`, {
            duration: videoElement.duration,
            currentTime: videoElement.currentTime,
            paused: videoElement.paused,
            loop: videoElement.loop
          })
          
          autoplayIntervalRef.current = setTimeout(() => {
            console.log(`🎬 [TIMER] Video timer expired, sliding to next`)
            if (lightboxRef.current) {
              lightboxRef.current.nextSlide()
            }
          }, duration * 1000)
        } else {
          console.log(`🎬 [TIMER] Video slide but no visible video element found, using 10s fallback`)
          autoplayIntervalRef.current = setTimeout(() => {
            console.log(`🎬 [TIMER] Fallback timer expired, sliding to next`)
            if (lightboxRef.current) {
              lightboxRef.current.nextSlide()
            }
          }, 10000)
        }
      } else {
        // Bild-Slide - Timer für 10 Sekunden
        console.log(`🎬 [TIMER] Image slide detected, setting timer for 10s`)
        
        autoplayIntervalRef.current = setTimeout(() => {
          console.log(`🎬 [TIMER] Image timer expired, sliding to next`)
          if (lightboxRef.current) {
            lightboxRef.current.nextSlide()
          }
        }, 10000)
      }
    }
  }

  // Media Files zu GLightbox Slides konvertieren
  useEffect(() => {
    const convertMediaToSlides = async () => {
      if (mediaFiles.length === 0) {
        setSlides([])
        return
      }

      setIsLoading(true)
      console.log(`🎬 [SLIDESHOW] Converting ${mediaFiles.length} media files to GLightbox slides`)

      try {
        const convertedSlides = await opfsGLightboxAdapter.convertToSlides(mediaFiles)
        setSlides(convertedSlides)
        console.log(`✅ [SLIDESHOW] Successfully converted ${convertedSlides.length} slides`)
      } catch (error) {
        console.error(`❌ [SLIDESHOW] Failed to convert media files:`, error)
        setSlides([])
      } finally {
        setIsLoading(false)
      }
    }

    convertMediaToSlides()
  }, [mediaFiles])

  // GLightbox initialisieren wenn Slides bereit sind
  useEffect(() => {
    if (slides.length > 0 && !lightboxRef.current) {
      console.log(`🎬 [SLIDESHOW] Initializing GLightbox with ${slides.length} slides`)
      
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
            loop: { active: false }, // Loop deaktiviert!
            controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
            clickToPlay: false, // Verhindert Klick-zu-Play
            keyboard: { focused: false, global: false } // Deaktiviere Plyr Keyboard-Navigation
          } as any
        }
      } as any)

      // Event-Handler für GLightbox
      lightboxRef.current.on('slide_after_load', () => {
        console.log(`🎬 [SLIDESHOW] Slide loaded, setting up video autoplay`)
        
        // Stelle sicher dass alle Videos stumm sind und simuliere Benutzerinteraktion
        setTimeout(() => {
          // Alle Videos stumm schalten
          const allVideos = document.querySelectorAll('video')
          allVideos.forEach(video => {
            video.muted = true
            video.volume = 0
            console.log(`🎬 [SLIDESHOW] Video muted:`, video.src)
          })
          
          // Versuche Video-Autoplay
          const currentVideo = document.querySelector('video')
          if (currentVideo && currentVideo.paused) {
            console.log(`🎬 [SLIDESHOW] Auto-playing video after slide load`)
            
            // Auto-Slide läuft weiter - Videos werden trotzdem abgespielt
            
            currentVideo.play().catch(() => {
              console.log(`🎬 [SLIDESHOW] Video autoplay failed, trying click simulation`)
              const playButton = document.querySelector('.plyr__control--overlaid, .plyr__play')
              if (playButton) {
                ;(playButton as HTMLElement).click()
              }
            })
            
            // Stelle sicher dass Video nicht loopt
            currentVideo.loop = false
            console.log(`🎬 [VIDEO] Video loop disabled:`, currentVideo.loop)
            
            // Video-Ende Event als Backup für Timer
            currentVideo.addEventListener('ended', () => {
              console.log(`🎬 [VIDEO] Video ended, forcing slide`)
              setTimeout(() => {
                if (lightboxRef.current) {
                  lightboxRef.current.nextSlide()
                }
              }, 500)
            }, { once: true })
            
            // Starte Timer für Video-Slide
            console.log(`🎬 [VIDEO] Starting timer for video slide`)
            setTimeout(() => startNextSlideTimer(), 1000)
          } else {
            // Kein Video: Auto-Slide läuft weiter
            console.log(`🎬 [SLIDESHOW] Image slide, auto-slide continues`)
          }
          
          // Verstecke Plyr-Controls nach dem Laden
          setTimeout(() => {
            const plyrControls = document.querySelectorAll('.plyr__controls')
            plyrControls.forEach(control => {
              (control as HTMLElement).style.display = 'none'
            })
          }, 500)
        }, 200)
      })

      // Event-Handler für Slide-Wechsel (für Videos) - verwende slide_before_change um Endlosschleife zu vermeiden
      lightboxRef.current.on('slide_before_change', () => {
        console.log(`🎬 [SLIDESHOW] Slide changing, stopping all videos`)
        
        // Stoppe alle laufenden Videos und stelle sicher dass sie stumm sind
        const allVideos = document.querySelectorAll('video')
        allVideos.forEach(video => {
          if (!video.paused) {
            console.log(`🎬 [SLIDESHOW] Stopping video:`, video.src)
            video.pause()
            video.currentTime = 0 // Zurück zum Anfang
          }
          // Stelle sicher dass Video stumm ist
          video.muted = true
          video.volume = 0
        })
      })
      
      // Event-Handler für Slide-Nach-Wechsel - starte neuen Timer
      lightboxRef.current.on('slide_after_change', () => {
        console.log(`🎬 [SLIDESHOW] Slide changed, starting new timer`)
        setTimeout(() => startNextSlideTimer(), 500)
      })
      
      // Zusätzlich: slide_after_load Event als Backup
      lightboxRef.current.on('slide_after_load', () => {
        console.log(`🎬 [SLIDESHOW] Slide loaded, starting timer as backup`)
        setTimeout(() => startNextSlideTimer(), 1000)
      })
      
      // Automatisch die Slideshow starten
      console.log(`🎬 [SLIDESHOW] Opening GLightbox...`)
      lightboxRef.current.open()
      
      // Starte Autoplay nach kurzer Verzögerung
      setTimeout(() => {
        console.log(`🎬 [AUTOPLAY] Starting autoplay system`)
        startNextSlideTimer()
      }, 1000)
    }
  }, [slides])

  // Keyboard Handler für Navigation und L-Taste
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

    // Event Listener mit hoher Priorität
    document.addEventListener('keydown', handleKeyDown, true)
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [clearSelectedLocation])

  // Kiosk-Modus: MDN Autoplay Guide Implementation
  useEffect(() => {
    const handleAutoplay = async () => {
      console.log(`🎬 [KIOSK] Implementing MDN autoplay guide`)
      
      // 1. Check autoplay policy using Navigator.getAutoplayPolicy()
      if ('getAutoplayPolicy' in navigator) {
        const policy = (navigator as any).getAutoplayPolicy('mediaelement')
        console.log(`🎬 [KIOSK] Autoplay policy:`, policy)
        
        if (policy === 'allowed') {
          console.log(`🎬 [KIOSK] Autoplay with audio is allowed`)
        } else if (policy === 'allowed-muted') {
          console.log(`🎬 [KIOSK] Only muted autoplay is allowed`)
          // Videos sind bereits muted in der Plyr-Konfiguration
        } else if (policy === 'disallowed') {
          console.log(`🎬 [KIOSK] Autoplay is disallowed, will retry after user interaction`)
        }
      }
      
      // 2. Try to play videos and handle failures gracefully
      const videos = document.querySelectorAll('video')
      for (const video of videos) {
        try {
          const playPromise = video.play()
          if (playPromise !== undefined) {
            await playPromise
            console.log(`🎬 [KIOSK] Video autoplay successful`)
          }
        } catch (error: any) {
          if (error.name === 'NotAllowedError') {
            console.log(`🎬 [KIOSK] Autoplay blocked, will retry after user interaction`)
            // Set up retry mechanism
            setupAutoplayRetry(video)
          } else {
            console.log(`🎬 [KIOSK] Video play error:`, error)
          }
        }
      }
    }

    // Setup retry mechanism for blocked autoplay
    const setupAutoplayRetry = (video: HTMLVideoElement) => {
      const retryInterval = setInterval(() => {
        video.play()
          .then(() => {
            console.log(`🎬 [KIOSK] Video autoplay successful after retry`)
            clearInterval(retryInterval)
          })
          .catch(() => {
            console.log(`🎬 [KIOSK] Autoplay retry failed, user interaction needed`)
          })
      }, 3000) // Retry every 3 seconds
      
      // Clear interval after 30 seconds to avoid infinite retries
      setTimeout(() => {
        clearInterval(retryInterval)
      }, 30000)
    }

    // Handle first play event to detect autoplay success
    const handleFirstPlay = (event: Event) => {
      const video = event.target as HTMLVideoElement
      console.log(`🎬 [KIOSK] First play event detected for video`)
      
      // Remove listener after first play
      video.removeEventListener('play', handleFirstPlay)
    }

    // Add play event listeners to all videos
    const videos = document.querySelectorAll('video')
    videos.forEach(video => {
      video.addEventListener('play', handleFirstPlay)
    })

    // Try autoplay immediately
    handleAutoplay()
    
    // Also try on any user interaction
    const handleUserInteraction = () => {
      console.log(`🎬 [KIOSK] User interaction detected, retrying autoplay`)
      handleAutoplay()
    }

    document.addEventListener('click', handleUserInteraction, { once: true })
    document.addEventListener('keydown', handleUserInteraction, { once: true })
    document.addEventListener('touchstart', handleUserInteraction, { once: true })
    
    return () => {
      document.removeEventListener('click', handleUserInteraction)
      document.removeEventListener('keydown', handleUserInteraction)
      document.removeEventListener('touchstart', handleUserInteraction)
    }
  }, [])

  // Cleanup beim Unmount
  useEffect(() => {
    return () => {
      console.log(`🧹 [SLIDESHOW] Cleaning up GLightbox`)
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
    <div className="w-full h-screen bg-black text-white flex flex-col items-center justify-center">
      {/* Header */}
      <div className="absolute top-8 left-8 text-left">
        <h1 className="text-3xl font-bold text-blue-400 mb-2">
          GF Board Slideshow
        </h1>
        <p className="text-lg text-gray-300">
          Standort: <span className="text-green-400 font-semibold">{selectedLocation}</span>
        </p>
        {mediaFiles.length > 0 && (
          <p className="text-sm text-gray-400">
            {mediaFiles.length} Medien verfügbar • Slideshow läuft automatisch
          </p>
        )}
      </div>

      {/* Sync Status */}
      <div className="absolute top-8 right-8 text-right">
        {syncStatus.isSyncing && (
          <div className="bg-blue-900 p-4 rounded-lg">
            <div className="text-blue-300 text-sm mb-2">🔄 Synchronisiere...</div>
            <div className="w-32 bg-gray-700 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${syncStatus.progress}%` }}
              />
            </div>
          </div>
        )}
        
        {syncStatus.error && (
          <div className="bg-red-900 p-4 rounded-lg">
            <div className="text-red-300 text-sm">❌ Fehler: {syncStatus.error}</div>
          </div>
        )}
        
        {syncStatus.lastSync && !syncStatus.isSyncing && (
          <div className="bg-green-900 p-4 rounded-lg">
            <div className="text-green-300 text-sm">
              ✅ Letzte Sync: {syncStatus.lastSync.toLocaleTimeString()}
            </div>
            <div className="text-green-400 text-xs">
              {mediaFiles.length} Medien verfügbar
            </div>
            {schedulerConfig.enabled && schedulerConfig.nextSync && (
              <div className="text-blue-300 text-xs mt-1">
                ⏰ Nächste Sync: {new Date(schedulerConfig.nextSync).toLocaleTimeString()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex items-center justify-center w-full">
        {mediaFiles.length > 0 ? (
          <div className="w-full h-full">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-6xl mb-8">⏳</div>
                  <h2 className="text-2xl font-bold text-gray-300 mb-4">
                    Bereite Slideshow vor...
                  </h2>
                  <p className="text-lg text-gray-500">
                    Konvertiere {mediaFiles.length} Medien für GLightbox
                  </p>
                </div>
              </div>
            ) : slides.length > 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-6xl mb-8">🎬</div>
                  <h2 className="text-2xl font-bold text-gray-300 mb-4">
                    GLightbox Slideshow läuft
                  </h2>
                          <p className="text-lg text-gray-500">
                            {slides.length} Medien im Karussell-Modus
                          </p>
                          <p className="text-sm text-gray-400 mt-2">
                            Bilder: 10 Sekunden • Videos: bis zum Ende • Intelligenter Autoplay
                          </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-6xl mb-8">❌</div>
                  <h2 className="text-2xl font-bold text-gray-300 mb-4">
                    Fehler beim Laden der Slideshow
                  </h2>
                  <p className="text-lg text-gray-500">
                    Medien konnten nicht konvertiert werden
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-6xl mb-8">📺</div>
              <h2 className="text-4xl font-bold text-gray-300 mb-4">
                {syncStatus.isSyncing ? 'Synchronisiere...' : 'Slideshow wird hier angezeigt'}
              </h2>
              <p className="text-xl text-gray-500">
                {syncStatus.isSyncing ? 'Lade Medien von Google Drive...' : 'Medien werden später hier geladen'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="absolute bottom-8 left-8 text-left">
        <p className="text-sm text-gray-500">
          <span className="bg-gray-800 px-2 py-1 rounded text-yellow-400 font-mono">← →</span> Navigation • 
          <span className="bg-gray-800 px-2 py-1 rounded text-yellow-400 font-mono ml-2">L</span> Zurück zur Übersicht
        </p>
                <p className="text-sm text-gray-500 mt-1">
                  Bilder: 10 Sekunden • Videos: bis zum Ende • Intelligenter Autoplay • Karussell-Modus
                </p>
      </div>
    </div>
  )
}

export default SlideshowView