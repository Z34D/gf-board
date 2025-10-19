import React, { useEffect } from 'react'
import { useAppStore } from './stores/appStore'
import LocationSelectionView from './components/LocationSelectionView'
import SlideshowView from './components/SlideshowView'

function App() {
  const { selectedLocation, initializeApp } = useAppStore()

  // Initialize app on mount
  useEffect(() => {
    console.log(`🚀 [APP] Component mounted, initializing...`)
    initializeApp()
  }, [initializeApp])

  // Show slideshow if location is selected, otherwise show location selection
  if (selectedLocation) {
    return <SlideshowView />
  }

  return <LocationSelectionView />
}

export default App