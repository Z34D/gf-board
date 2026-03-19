import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import { useAppStore } from "./stores/appStore";
import { setupGlobalErrorHandlers } from "./utils/errors";
import SlideshowView from "./components/SlideshowView";
import LocationSelectionView from "./components/LocationSelectionView";
import "./index.css";

setupGlobalErrorHandlers();

const FILE_POLL_INTERVAL = 10_000;

function App() {
  const selectedLocation = useAppStore((s) => s.selectedLocation);
  const mediaFiles = useAppStore((s) => s.mediaFiles);

  // Load server state on mount
  useEffect(() => {
    const store = useAppStore.getState();
    store.fetchStatus().then(() => store.loadFiles());
  }, []);

  // Periodically check for new/changed files (covers sync finishing in background)
  useEffect(() => {
    if (!selectedLocation) return;
    const id = setInterval(() => useAppStore.getState().loadFiles(), FILE_POLL_INTERVAL);
    return () => clearInterval(id);
  }, [selectedLocation]);

  return selectedLocation ? <SlideshowView /> : <LocationSelectionView />;
}

createRoot(document.getElementById("root")!).render(<App />);
