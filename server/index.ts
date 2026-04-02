import { type Subprocess } from "bun";
import path from "node:path";
import { syncLocation } from "./sync";
import { startScheduler, setSchedule, getNextSync, type Interval } from "./scheduler";
import homepage from "../frontend/index.html";

const DEV_MODE = process.env.DEV_MODE === "true";
const PORT = Number(process.env.PORT) || 3000;
const MEDIA_DIR = "./media";
const CONFIG_PATH = "./config.json";

// --- Config persistence ---

interface Config {
  selectedLocation: string | null;
  schedulerInterval: Interval;
}

async function loadConfig(): Promise<Config> {
  try {
    const file = Bun.file(CONFIG_PATH);
    if (await file.exists()) {
      return await file.json();
    }
  } catch { /* corrupt or missing */ }
  return { selectedLocation: null, schedulerInterval: "daily1am" };
}

async function saveConfig(cfg: Config): Promise<void> {
  await Bun.write(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

let config = await loadConfig();

// --- Sync state ---

interface SyncStatus {
  isSyncing: boolean;
  lastSync: string | null;
  error: string | null;
  message: string | null;
}

let syncStatus: SyncStatus = {
  isSyncing: false,
  lastSync: null,
  error: null,
  message: null,
};

// --- Chromium process management ---

let chromiumProc: Subprocess | null = null;
let chromiumKilled = false;

function spawnChromium(): void {
  if (DEV_MODE) return;

  chromiumKilled = false;

  const args = [
    "chromium",
    "--kiosk",
    `--user-data-dir=${process.env.HOME}/.chromium-kiosk`,
    "--ozone-platform=wayland",
    "--disable-dev-shm-usage",
    "--memory-pressure-off",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--disable-component-update",
    "--disable-sync",
    "--disable-domain-reliability",
    "--noerrdialogs",
    "--disable-infobars",
    "--disable-hang-monitor",
    "--disable-prompt-on-repost",
    "--disable-session-crashed-bubble",
    "--disable-restore-session-state",
    "--no-first-run",
    "--disable-client-side-phishing-detection",
    "--disable-default-apps",
    "--password-store=basic",
    "--use-mock-keychain",
    "--enable-features=OverlayScrollbar",
    "--disable-features=Translate,TranslateUI",
    `http://localhost:${PORT}/`,
  ];

  console.log("[chromium] Launching kiosk...");
  chromiumProc = Bun.spawn(args, {
    stdout: "ignore",
    stderr: "ignore",
    onExit(_proc, exitCode) {
      chromiumProc = null;
      if (chromiumKilled) {
        console.log("[chromium] Stopped (Alt+Q)");
        return;
      }
      console.log(`[chromium] Crashed (code ${exitCode}), restarting in 2s...`);
      setTimeout(spawnChromium, 2000);
    },
  });
}

// --- Helper: list media files for a location ---

interface MediaFile {
  name: string;
  type: "image" | "video";
  size: number;
}

async function listMediaFiles(location: string): Promise<MediaFile[]> {
  const dir = `${MEDIA_DIR}/${location}`;
  const files: MediaFile[] = [];

  try {
    const glob = new Bun.Glob("*");
    for await (const name of glob.scan({ cwd: dir })) {
      const isVideo = /\.(mp4|webm|mov|avi)$/i.test(name);
      const stat = Bun.file(`${dir}/${name}`);
      files.push({
        name,
        type: isVideo ? "video" : "image",
        size: stat.size,
      });
    }
  } catch {
    // Directory doesn't exist yet — return empty
  }

  return files;
}

// --- Sync helper ---

function runSync(location: string): void {
  if (syncStatus.isSyncing) return;

  syncStatus = { isSyncing: true, lastSync: syncStatus.lastSync, error: null, message: "Starting sync..." };

  syncLocation(location, MEDIA_DIR, (msg) => {
    syncStatus.message = msg;
  })
    .then((result) => {
      syncStatus = {
        isSyncing: false,
        lastSync: result.success ? new Date().toISOString() : syncStatus.lastSync,
        error: result.error ?? null,
        message: null,
      };
    })
    .catch((err) => {
      syncStatus = {
        isSyncing: false,
        lastSync: syncStatus.lastSync,
        error: err instanceof Error ? err.message : "Unknown error",
        message: null,
      };
    });
}

// --- HTTP Server ---

Bun.serve({
  port: PORT,
  routes: {
    "/": homepage,

    "/api/files": async () => {
      if (!config.selectedLocation) {
        return Response.json({ files: [], location: null });
      }
      const files = await listMediaFiles(config.selectedLocation);
      return Response.json({ files, location: config.selectedLocation });
    },

    "/api/status": () => {
      const mem = process.memoryUsage();
      return Response.json({
        selectedLocation: config.selectedLocation,
        schedulerConfig: {
          enabled: true,
          interval: config.schedulerInterval,
          nextSync: getNextSync(),
        },
        syncStatus,
        memory: {
          rss: Math.round(mem.rss / 1024 / 1024),
          heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        },
      });
    },

    "/api/sync": {
      POST: () => {
        if (!config.selectedLocation) {
          return Response.json({ error: "No location selected" }, { status: 400 });
        }
        if (syncStatus.isSyncing) {
          return Response.json({ error: "Sync already in progress" }, { status: 409 });
        }

        runSync(config.selectedLocation);
        return Response.json({ ok: true, message: "Sync started" });
      },
    },

    "/api/set-location": {
      POST: async (req) => {
        const body = await req.json();
        const location = body.location as string | null;

        config.selectedLocation = location;
        await saveConfig(config);

        if (!location) {
          return Response.json({ ok: true, location: null });
        }

        runSync(location);
        return Response.json({ ok: true, location });
      },
    },

    "/api/set-scheduler": {
      POST: async (req) => {
        const body = await req.json();
        const interval = body.interval as Interval;
        if (!interval) {
          return Response.json({ error: "Missing interval" }, { status: 400 });
        }

        config.schedulerInterval = interval;
        await saveConfig(config);
        setSchedule(interval, () => doScheduledSync());

        return Response.json({
          ok: true,
          interval,
          nextSync: getNextSync(),
        });
      },
    },

    "/api/kill-kiosk": {
      POST: () => {
        if (chromiumProc) {
          chromiumKilled = true;
          chromiumProc.kill();
          return Response.json({ ok: true, message: "Chromium killed" });
        }
        return Response.json({ ok: false, message: "No Chromium process" });
      },
    },
  },

  fetch(req) {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/media/")) {
      const resolvedMedia = path.resolve(MEDIA_DIR);
      const filePath = path.resolve(MEDIA_DIR, decodeURIComponent(url.pathname.slice("/media/".length)));
      if (!filePath.startsWith(resolvedMedia + path.sep)) {
        return new Response("Forbidden", { status: 403 });
      }
      return new Response(Bun.file(filePath));
    }

    return new Response(Bun.file("./frontend/index.html"), {
      headers: { "Content-Type": "text/html" },
    });
  },

  development: DEV_MODE,
});

// --- Scheduled sync ---

async function doScheduledSync() {
  if (!config.selectedLocation || syncStatus.isSyncing) return;

  console.log(`[scheduler] Sync for ${config.selectedLocation}`);
  syncStatus = { isSyncing: true, lastSync: syncStatus.lastSync, error: null, message: "Scheduled sync..." };

  try {
    const result = await syncLocation(config.selectedLocation, MEDIA_DIR, (msg) => {
      syncStatus.message = msg;
    });
    syncStatus = {
      isSyncing: false,
      lastSync: result.success ? new Date().toISOString() : syncStatus.lastSync,
      error: result.error ?? null,
      message: null,
    };
  } catch (err) {
    syncStatus = {
      isSyncing: false,
      lastSync: syncStatus.lastSync,
      error: err instanceof Error ? err.message : "Unknown error",
      message: null,
    };
  }
}

// --- Startup ---

startScheduler(config.schedulerInterval, () => doScheduledSync(), () => {
  if (!DEV_MODE) {
    console.log("[scheduler] 3 AM restart: exiting for full restart...");
    if (chromiumProc) {
      chromiumKilled = true;
      chromiumProc.kill();
    }
    process.exit(0);
  }
});

spawnChromium();

console.log(`[server] GF-Kiosk running on http://localhost:${PORT}`);
console.log(`[server] Mode: ${DEV_MODE ? "DEVELOPMENT" : "PRODUCTION"}`);
console.log(`[server] Location: ${config.selectedLocation ?? "(none)"}`);
console.log(`[server] Sync interval: ${config.schedulerInterval}`);

if (config.selectedLocation) {
  doScheduledSync();
}
