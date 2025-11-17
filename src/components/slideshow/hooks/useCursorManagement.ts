import { useRef, useEffect } from 'react'

export const useCursorManagement = () => {
  const cursorTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const hideCursor = () => {
    document.documentElement.style.cursor = 'none'
  }

  const showCursor = () => {
    document.documentElement.style.cursor = 'default'

    // Clear existing timeout
    if (cursorTimeoutRef.current) {
      clearTimeout(cursorTimeoutRef.current)
    }

    // Auto-hide cursor after 3 seconds
    cursorTimeoutRef.current = setTimeout(() => {
      hideCursor()
    }, 3000)
  }

  // Initial cursor hide on mount
  useEffect(() => {
    hideCursor()
  }, [])

  // Mouse movement handler with debounce for better performance on RPi
  useEffect(() => {
    const handleMouseMove = () => {
      showCursor()
    }

    const debouncedHandler = () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
      debounceTimeoutRef.current = setTimeout(handleMouseMove, 50)
    }

    document.addEventListener('mousemove', debouncedHandler)

    return () => {
      document.removeEventListener('mousemove', debouncedHandler)
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
    }
  }, [])

  // Handle window focus - hide cursor when kiosk regains focus after reload
  useEffect(() => {
    const handleFocus = () => {
      hideCursor()
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  // Cleanup
  useEffect(() => {
    return () => {
      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current)
      }
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
      // Restore cursor when component unmounts
      document.documentElement.style.cursor = 'default'
    }
  }, [])

  return {
    hideCursor,
    showCursor
  }
}
