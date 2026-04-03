import { create } from "zustand";

export interface MediaFile {
  name: string;
  type: "image" | "video";
  size: number;
}

interface SchedulerConfig {
  enabled: boolean;
  interval: "5min" | "4hours" | "daily1am" | "8hours";
  nextSync: string | null;
}

interface StatusResponse {
  selectedLocation: string | null;
  schedulerConfig: SchedulerConfig;
  syncStatus?: unknown;
}

interface FilesResponse {
  files: MediaFile[];
}

interface SetSchedulerResponse {
  nextSync?: string;
}

interface AppState {
  selectedLocation: string | null;
  availableLocations: string[];
  mediaFiles: MediaFile[];
  schedulerConfig: SchedulerConfig;
  initializing: boolean;

  fetchStatus: () => Promise<void>;
  loadFiles: () => Promise<void>;
  setSelectedLocation: (location: string) => Promise<void>;
  clearSelectedLocation: () => Promise<void>;
  setSchedulerConfig: (config: Partial<SchedulerConfig>) => void;
}

export const useAppStore = create<AppState>()((set, get) => ({
  selectedLocation: null,
  availableLocations: ["Flieden", "Neuhof", "Gersfeld", "Schlitz", "Eichenzell"],
  mediaFiles: [],
  schedulerConfig: { enabled: true, interval: "daily1am", nextSync: null },
  initializing: true,

  fetchStatus: async () => {
    try {
      const res = await fetch("/api/status");
      if (!res.ok) return;
      const data: StatusResponse = await res.json();
      set({
        selectedLocation: data.selectedLocation,
        schedulerConfig: data.schedulerConfig ?? get().schedulerConfig,
      });
    } catch { /* offline */ }
    finally { set({ initializing: false }); }
  },

  loadFiles: async () => {
    try {
      const res = await fetch("/api/files");
      if (!res.ok) return;
      const data: FilesResponse = await res.json();
      const next = data.files ?? [];
      const curr = get().mediaFiles;
      const changed = next.length !== curr.length ||
        next.some((f, i) => f.name !== curr[i]?.name || f.size !== curr[i]?.size);
      if (changed) set({ mediaFiles: next });
    } catch { /* offline */ }
  },

  setSelectedLocation: async (location) => {
    set({ selectedLocation: location, mediaFiles: [] });
    try {
      await fetch("/api/set-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location }),
      });
    } catch { /* best effort */ }
  },

  clearSelectedLocation: async () => {
    set({ selectedLocation: null, mediaFiles: [] });
    try {
      await fetch("/api/set-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: null }),
      });
    } catch { /* best effort */ }
  },

  setSchedulerConfig: (partial) => {
    set((s) => ({ schedulerConfig: { ...s.schedulerConfig, ...partial } }));
    if (partial.interval) {
      fetch("/api/set-scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: partial.interval }),
      })
        .then((r) => r.json() as Promise<SetSchedulerResponse>)
        .then((data) => {
          if (data.nextSync) {
            set((s) => ({ schedulerConfig: { ...s.schedulerConfig, nextSync: data.nextSync ?? null } }));
          }
        })
        .catch(() => {});
    }
  },
}));
