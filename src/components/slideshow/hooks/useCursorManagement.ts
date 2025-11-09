import { useRef, useEffect } from 'react'

export const useCursorManagement = () => {
  const cursorTimeoutRef = useRef<NodeJS.Timeout | null>(null)

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

  // Mouse movement handler
  useEffect(() => {
    const handleMouseMove = () => {
      showCursor()
    }

    document.addEventListener('mousemove', handleMouseMove)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
    }
  }, [])

  // Cleanup
  useEffect(() => {
    return () => {
      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current)
      }
      // Restore cursor when component unmounts
      document.body.style.cursor = 'default'
    }
  }, [])

  return {
    hideCursor,
    showCursor
  }
}
