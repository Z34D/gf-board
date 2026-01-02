import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAppStore } from "../stores/appStore";
import LocationSelectionView from "../components/LocationSelectionView";
import SlideshowView from "../components/SlideshowView";
import { setupGlobalErrorHandlers } from "../utils/errors";

export const Route = createFileRoute("/")({
  component: KioskPage,
  beforeLoad: async () => {
    // Check authentication
    let authResponse: Response | null = null;
    try {
      authResponse = await fetch("/api/auth/check");
    } catch {
      // Network error (fetch failed completely) - check if we have saved PIN (offline mode)
      const savedPin = localStorage.getItem("gf-kiosk-pin");
      if (savedPin) {
        console.log("🔌 Offline mode: using saved credentials");
        return;
      }
      // No saved PIN, must login
      throw redirect({ to: "/login" });
    }

    // Got a response - check if authenticated
    if (!authResponse.ok) {
      // 401/403 = not authenticated, redirect to login
      throw redirect({ to: "/login" });
    }
  },
});

function KioskPage() {
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
      loadLocalMedia();
      triggerSync();
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
