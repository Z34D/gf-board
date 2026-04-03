import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import { useAppStore } from "./stores/appStore";
import { setupGlobalErrorHandlers } from "./utils/errors";
import SlideshowView from "./components/SlideshowView";
import LocationSelectionView from "./components/LocationSelectionView";
import "./index.css";

setupGlobalErrorHandlers();

function App() {
  const selectedLocation = useAppStore((s) => s.selectedLocation);
  const initializing = useAppStore((s) => s.initializing);
  const mediaFiles = useAppStore((s) => s.mediaFiles);

  // Load server state once on mount
  useEffect(() => {
    const store = useAppStore.getState();
    store.fetchStatus().then(() => store.loadFiles());
  }, []);

  if (initializing) return null;

  return selectedLocation ? <SlideshowView /> : <LocationSelectionView />;
}

createRoot(document.getElementById("root")!).render(<App />);
