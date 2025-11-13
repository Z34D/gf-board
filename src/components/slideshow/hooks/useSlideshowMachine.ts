import { useState, useCallback, useRef, useEffect, useReducer } from 'react'

type SlideShowState = 'IDLE' | 'LOADING' | 'READY' | 'PLAYING' | 'TRANSITIONING'

interface SlideShowAction {
  type: 'START_LOADING' | 'MEDIA_READY' | 'PLAY' | 'TRANSITION_START' | 'TRANSITION_END' | 'PAUSE'
  payload?: any
}

const reducer = (state: SlideShowState, action: SlideShowAction): SlideShowState => {
  switch (action.type) {
    case 'START_LOADING':
      return 'LOADING'
    case 'MEDIA_READY':
      return 'READY'
    case 'PLAY':
      return 'PLAYING'
    case 'TRANSITION_START':
      return 'TRANSITIONING'
    case 'TRANSITION_END':
      return 'PLAYING'
    case 'PAUSE':
      return 'READY'
    default:
      return state
  }
}

export const useSlideshowMachine = (slides: any[]) => {
  const [state, dispatch] = useReducer(reducer, 'IDLE')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [direction, setDirection] = useState<'next' | 'prev'>('next')

  const videoRef = useRef<HTMLVideoElement>(null)
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null)
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const goToNextRef = useRef<() => void>(() => {})

  // State transition tracking
  useEffect(() => {
    // console.log(`🔄 [STATE] ${state}`)
  }, [state])

  // 📥 Start loading when slides are available
  useEffect(() => {
    if (slides.length > 0 && state === 'IDLE') {
      dispatch({ type: 'START_LOADING' })
    }
  }, [slides.length, state])

  // ✅ Slides are ready to play (only when blob URLs are available)
  useEffect(() => {
    if (state === 'LOADING') {
      const allHaveBlobs = slides.length > 0 && slides.every(s => s.href.startsWith('blob:'))
      if (allHaveBlobs) {
        // console.log(`✅ All blob URLs ready, transitioning to READY state`)
        dispatch({ type: 'MEDIA_READY' })
      }
    }
  }, [state, slides])

  // ▶️ Play when ready
  useEffect(() => {
    if (state === 'READY' && slides.length > 0) {
      dispatch({ type: 'PLAY' })
    }
  }, [state, slides.length])

  // 🎬 Setup video/image when playing
  useEffect(() => {
    if (state !== 'PLAYING' || slides.length === 0) return

    const currentSlide = slides[currentIndex]
    if (!currentSlide) return

    // console.log(`\n📺 [PLAYING] Slide ${currentIndex} (${currentSlide.type})`)

    // Clear old timer
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current)
      autoPlayTimerRef.current = null
    }

    if (currentSlide.type === 'video' && videoRef.current) {
      const video = videoRef.current

      // Setup video
      video.currentTime = 0
      video.muted = true
      video.volume = 0

      // Function to play video when ready
      const playVideo = () => {
        video.play().then(() => {
          // console.log(`   ▶️ Playing`)
        }).catch((err) => {
          // console.warn(`   ⚠️ Play failed:`, err.message)
        })

        // Set timer based on actual duration
        const actualDuration = video.duration || currentSlide.videoDuration || 10
        // console.log(`   🎥 Video: ${actualDuration}s`)
        const duration = Math.ceil(actualDuration * 1000)
        // console.log(`   ⏱️ Auto-advance in: ${duration}ms`)

        autoPlayTimerRef.current = setTimeout(() => {
          goToNextRef.current()
        }, duration)
      }

      // Wait for video to be ready (readyState >= 2 means current frame is available)
      if (video.readyState >= 2) {
        // Video is already ready to play
        // console.log(`   ✅ Video ready (readyState: ${video.readyState})`)
        playVideo()
      } else {
        // Wait for canplay event - more reliable than readyState checking
        // console.log(`   ⏳ Waiting for video to be ready...`)
        const handleCanPlay = () => {
          // console.log(`   ✅ Video ready (canplay event)`)
          playVideo()
          video.removeEventListener('canplay', handleCanPlay)
        }
        video.addEventListener('canplay', handleCanPlay)
      }
    } else if (currentSlide.type === 'image') {
      // console.log(`   🖼️ Image`)

      // Image auto-advance
      const IMAGE_DURATION = 10000
      // console.log(`   ⏱️ Timer: ${IMAGE_DURATION}ms`)

      autoPlayTimerRef.current = setTimeout(() => {
        goToNextRef.current()
      }, IMAGE_DURATION)
    }
  }, [state, currentIndex, slides])

  // Navigate to next slide
  const goToNext = useCallback(() => {
    const nextIndex = (currentIndex + 1) % slides.length
    goToSlide(nextIndex, 'next')
  }, [currentIndex, slides.length])

  // Keep ref updated with latest goToNext function
  useEffect(() => {
    goToNextRef.current = goToNext
  }, [goToNext])

  // Navigate to previous slide
  const goToPrev = useCallback(() => {
    const prevIndex = currentIndex === 0 ? slides.length - 1 : currentIndex - 1
    goToSlide(prevIndex, 'prev')
  }, [currentIndex, slides.length])

  // Generic slide navigation
  const goToSlide = useCallback(
    (index: number, dir: 'next' | 'prev') => {
      if (index === currentIndex || index < 0 || index >= slides.length || state === 'TRANSITIONING') {
        return
      }

      // console.log(`\n➡️ Navigate: ${currentIndex} → ${index} (${dir})`)

      // Pause current video
      if (videoRef.current && videoRef.current.paused === false) {
        videoRef.current.pause()
        videoRef.current.currentTime = 0
      }

      // Start transition
      setDirection(dir)
      dispatch({ type: 'TRANSITION_START' })

      // After transition animation, update index and resume playing
      transitionTimeoutRef.current = setTimeout(() => {
        setCurrentIndex(index)
        dispatch({ type: 'PLAY' })
      }, 400) // Match CSS transition duration
    },
    [currentIndex, slides.length, state]
  )

  // Cleanup
  useEffect(() => {
    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current)
      if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current)
    }
  }, [])

  return {
    state,
    currentIndex,
    direction,
    isTransitioning: state === 'TRANSITIONING',
    videoRef,
    goToNext,
    goToPrev,
    goToSlide
  }
}
