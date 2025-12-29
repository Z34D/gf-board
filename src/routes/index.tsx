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
    try {
      const response = await fetch("/api/auth/check");
      if (!response.ok) {
        throw redirect({ to: "/login" });
      }
    } catch (error) {
      // If redirect was thrown, rethrow it
      if (error && typeof error === "object" && "href" in error) {
        throw error;
      }
      // Network error - check if we have saved PIN (offline mode)
      const savedPin = localStorage.getItem("gf-kiosk-pin");
      if (savedPin) {
        // We have a saved PIN, allow offline access
        console.log("🔌 Offline mode: using saved credentials");
        return;
      }
      // No saved PIN, must login
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
