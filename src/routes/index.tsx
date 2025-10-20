import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import LocationSelectionView from '../components/LocationSelectionView'
import SlideshowView from '../components/SlideshowView'

export const Route = createFileRoute('/')({
  component: BoardPage,
  beforeLoad: async () => {
    // Check authentication
    try {
      const response = await fetch('/api/auth/check')
      if (!response.ok) {
        throw redirect({ to: '/login' })
      }
    } catch (error) {
      // If redirect was thrown, rethrow it
      if (error && typeof error === 'object' && 'href' in error) {
        throw error
      }
      // Network error or other issue - redirect to login
      throw redirect({ to: '/login' })
    }
  },
})

function BoardPage() {
  const { selectedLocation, initializeApp } = useAppStore()

  // Initialize app on mount
  useEffect(() => {
    initializeApp()
  }, [initializeApp])

  // Show slideshow if location is selected, otherwise show location selection
  if (selectedLocation) {
    return <SlideshowView />
  }

  return <LocationSelectionView />
}

