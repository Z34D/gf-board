/**
 * Application state management using Zustand
 *
 * Manages:
 * - Selected gym location
 * - Media files from OPFS
 * - Sync status and operations
 * - Background sync scheduler
 *
 * State is persisted to localStorage for kiosk resilience
 *
 * @module stores/appStore
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  syncLocation,
  getCurrentMediaFiles,
  isSyncInProgress,
  type MediaFile,
} from "../utils/sync";
import { initOPFS, clearDir, MEDIA_DIR } from "../utils/opfs";

/**
 * Converts scheduler interval to milliseconds
 * For daily1am, returns 1 hour (checks hourly if it's 1am)
 */
function getIntervalMs(interval: SchedulerConfig["interval"]): number {
  switch (interval) {
    case "5min":
      return 5 * 60 * 1000;
    case "4hours":
      return 4 * 60 * 60 * 1000;
    case "8hours":
      return 8 * 60 * 60 * 1000;
    case "daily1am":
      return 60 * 60 * 1000; // Check every hour for daily sync
    default:
      return 4 * 60 * 60 * 1000;
  }
}

/** Current sync operation status */
interface SyncStatus {
  /** Whether a sync is currently running */
  isSyncing: boolean;
  /** Timestamp of last successful sync */
  lastSync: Date | null;
  /** Error message if sync failed */
  error: string | null;
  /** Current sync progress message */
  message: string | null;
}

/** Background sync scheduler configuration */
interface SchedulerConfig {
  /** Whether scheduler is enabled */
  enabled: boolean;
  /** Sync interval setting */
  interval: "5min" | "4hours" | "daily1am" | "8hours";
  /** Calculated next sync time */
  nextSync: Date | null;
  /** Internal: setInterval ID for cleanup */
  intervalId?: ReturnType<typeof setInterval>;
}

/** Main application state interface */
interface AppState {
  // --- Location state ---
  /** Currently selected gym location */
  selectedLocation: string | null;
  /** All available gym locations */
  availableLocations: string[];

  // --- Media state ---
  /** Media files loaded from OPFS */
  mediaFiles: MediaFile[];

  // --- Sync state ---
  /** Current sync operation status */
  syncStatus: SyncStatus;

  // --- Scheduler state ---
  /** Background sync scheduler config */
  schedulerConfig: SchedulerConfig;

  // --- Location actions ---
  /** Select a location, load local media, start background sync */
  setSelectedLocation: (location: string) => Promise<void>;
  /** Clear selection and stop scheduler */
  clearSelectedLocation: () => void;

  // --- Sync actions ---
  /** Trigger background sync for current location */
  triggerSync: () => Promise<void>;
  /** Load media files from OPFS into state */
  loadLocalMedia: () => Promise<void>;

  // --- Scheduler actions ---
  /** Update scheduler configuration */
  setSchedulerConfig: (config: Partial<SchedulerConfig>) => void;
  /** Start the background sync scheduler */
  startScheduler: () => void;
  /** Stop the background sync scheduler */
  stopScheduler: () => void;
  /** Calculate next sync time based on interval */
  calculateNextSync: (interval: SchedulerConfig["interval"]) => Date;
}

export type { MediaFile };

/**
 * Main Zustand store for application state
 *
 * Persists to localStorage: selectedLocation, schedulerConfig
 * Does NOT persist: mediaFiles (loaded from OPFS), syncStatus, intervalId
 */
export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      selectedLocation: null,
      availableLocations: [
        "Flieden",
        "Neuhof",
        "Gersfeld",
        "Schlitz",
        "Eichenzell",
      ],
      mediaFiles: [],
      syncStatus: {
        isSyncing: false,
        lastSync: null,
        error: null,
        message: null,
      },
      schedulerConfig: {
        enabled: true,
        interval: "daily1am",
        nextSync: null,
      },

      // Set location - loads local media immediately, syncs in background
      setSelectedLocation: async (location) => {
        const { selectedLocation, schedulerConfig } = get();

        // If changing location, clear OPFS
        if (selectedLocation && selectedLocation !== location) {
          await clearDir(MEDIA_DIR);
        }

        set({ selectedLocation: location });

        // Load existing local media immediately (non-blocking)
        await get().loadLocalMedia();

        // Start background sync
        get().triggerSync();

        // Start scheduler if enabled
        if (schedulerConfig.enabled) {
          get().startScheduler();
        }
      },

      clearSelectedLocation: () => {
        get().stopScheduler();
        set({ selectedLocation: null, mediaFiles: [] });
      },

      // Load media files from OPFS (fast, local)
      loadLocalMedia: async () => {
        try {
          await initOPFS();
          const files = await getCurrentMediaFiles();
          set({ mediaFiles: files });
        } catch (error) {
          console.error("❌ Failed to load local media:", error);
        }
      },

      // Trigger background sync
      triggerSync: async () => {
        const { selectedLocation } = get();
        if (!selectedLocation) return;

        if (isSyncInProgress()) {
          console.log("⏳ Sync already in progress");
          return;
        }

        set((state) => ({
          syncStatus: {
            ...state.syncStatus,
            isSyncing: true,
            error: null,
            message: "Starting sync...",
          },
        }));

        try {
          const result = await syncLocation(selectedLocation, (message) => {
            set((state) => ({
              syncStatus: { ...state.syncStatus, message },
            }));
          });

          if (result.success) {
            // Reload media files after successful sync
            await get().loadLocalMedia();

            set((state) => ({
              syncStatus: {
                ...state.syncStatus,
                isSyncing: false,
                lastSync: new Date(),
                error: null,
                message: null,
              },
            }));
          } else {
            set((state) => ({
              syncStatus: {
                ...state.syncStatus,
                isSyncing: false,
                error: result.error || "Sync failed",
                message: null,
              },
            }));
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          set((state) => ({
            syncStatus: {
              ...state.syncStatus,
              isSyncing: false,
              error: errorMessage,
              message: null,
            },
          }));
        }
      },

      // Scheduler actions
      setSchedulerConfig: (config) => {
        const currentConfig = get().schedulerConfig;
        const newConfig = { ...currentConfig, ...config };

        if (config.interval && config.interval !== currentConfig.interval) {
          newConfig.nextSync = get().calculateNextSync(config.interval);
        }

        set({ schedulerConfig: newConfig });

        if (newConfig.enabled) {
          get().startScheduler();
        } else {
          get().stopScheduler();
        }
      },

      startScheduler: () => {
        const { schedulerConfig, selectedLocation } = get();

        if (!schedulerConfig.enabled || !selectedLocation) return;

        // Don't create duplicate
        if (schedulerConfig.intervalId) return;

        const intervalMs = getIntervalMs(schedulerConfig.interval);
        const nextSync = get().calculateNextSync(schedulerConfig.interval);
        console.log(
          `⏰ Scheduler active: ${schedulerConfig.interval}, next sync: ${nextSync.toLocaleString("de-DE")}`,
        );

        const intervalId = setInterval(async () => {
          const { schedulerConfig: config, selectedLocation: location } = get();

          if (!config.enabled || !location) {
            get().stopScheduler();
            return;
          }

          // For daily sync, check if it's 1am
          if (config.interval === "daily1am") {
            const now = new Date();
            if (now.getHours() !== 1) return;
          }

          await get().triggerSync();

          set((state) => ({
            schedulerConfig: {
              ...state.schedulerConfig,
              nextSync: get().calculateNextSync(config.interval),
            },
          }));
        }, intervalMs);

        set((state) => ({
          schedulerConfig: {
            ...state.schedulerConfig,
            intervalId,
          },
        }));
      },

      stopScheduler: () => {
        const { schedulerConfig } = get();

        if (schedulerConfig.intervalId) {
          clearInterval(schedulerConfig.intervalId);
          set((state) => ({
            schedulerConfig: {
              ...state.schedulerConfig,
              intervalId: undefined,
            },
          }));
        }
      },

      calculateNextSync: (interval) => {
        const now = new Date();

        switch (interval) {
          case "5min":
            return new Date(now.getTime() + 5 * 60 * 1000);
          case "4hours":
            return new Date(now.getTime() + 4 * 60 * 60 * 1000);
          case "8hours":
            return new Date(now.getTime() + 8 * 60 * 60 * 1000);
          case "daily1am":
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(1, 0, 0, 0);
            return tomorrow;
          default:
            return new Date(now.getTime() + 4 * 60 * 60 * 1000);
        }
      },
    }),
    {
      name: "gf-kiosk-storage",
      partialize: (state) => ({
        selectedLocation: state.selectedLocation,
        schedulerConfig: {
          enabled: state.schedulerConfig.enabled,
          interval: state.schedulerConfig.interval,
          nextSync: state.schedulerConfig.nextSync,
        },
      }),
    },
  ),
);
