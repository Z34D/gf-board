import { useEffect } from "react";
import { useAppStore } from "./stores/appStore";
import LocationSelectionView from "./components/LocationSelectionView";
import SlideshowView from "./components/SlideshowView";
import { setupGlobalErrorHandlers } from "./utils/errors";

function App() {
  const {
    selectedLocation,
    loadLocalMedia,
    triggerSync,
    startScheduler,
    schedulerConfig,
  } = useAppStore();

  // Setup global error handlers once
  useEffect(() => {
    setupGlobalErrorHandlers();
  }, []);

  // Initialize: load local media immediately, then sync in background
  useEffect(() => {
    if (selectedLocation) {
      // Load existing local files first (instant)
      loadLocalMedia();

      // Then trigger background sync
      triggerSync();

      // Start scheduler if enabled
      if (schedulerConfig.enabled) {
        startScheduler();
      }
    }
  }, [
    selectedLocation,
    loadLocalMedia,
    triggerSync,
    startScheduler,
    schedulerConfig.enabled,
  ]);

  // Show slideshow if location is selected, otherwise show location selection
  if (selectedLocation) {
    return <SlideshowView />;
  }

  return <LocationSelectionView />;
}

export default App;
