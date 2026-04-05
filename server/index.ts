import { type Subprocess } from "bun";
import path from "node:path";
import { syncLocation } from "./gdrive";
import { startScheduler, getNextSync } from "./scheduler";
import { log } from "./logger";
import homepage from "../frontend/index.html";

const DEV_MODE = process.env.DEV_MODE === "true";
const PORT = Number(process.env.PORT) || 3000;
const MEDIA_DIR = "./media";
const CONFIG_PATH = "./config.json";
const LOCATIONS = ["flieden", "neuhof", "gersfeld", "schlitz", "eichenzell"];

// --- Config persistence ---

interface Config {
  selectedLocation: string | null;
}

async function loadConfig(): Promise<Config> {
  try {
    const file = Bun.file(CONFIG_PATH);
    if (await file.exists()) {
      const cfg = await file.json() as Config;
      if (cfg.selectedLocation) cfg.selectedLocation = cfg.selectedLocation.toLowerCase();
      return cfg;
    }
  } catch { /* corrupt or missing */ }
  return { selectedLocation: null };
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
let chromiumKillReason: "manuell" | "sync" | "neustart" | null = null;

// --- Heartbeat watchdog ---

let lastHeartbeat = Date.now();
let consecutiveFailedChecks = 0;
const HEARTBEAT_CHECK_INTERVAL = 60_000;
const HEARTBEAT_TIMEOUT = 2 * 60_000;
const MAX_FAILED_RESTARTS = 3;

function spawnChromium(): void {
  if (DEV_MODE) return;

  chromiumKillReason = null;
  lastHeartbeat = Date.now(); // give fresh Chromium time to load

  const startUrl = config.selectedLocation
    ? `http://localhost:${PORT}/${config.selectedLocation}`
    : `http://localhost:${PORT}/`;

  const args = [
    "chromium",
    "--kiosk",
    `--user-data-dir=${process.env.HOME}/.chromium-kiosk`,
    "--ozone-platform=wayland",
    "--disable-dev-shm-usage",
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
    startUrl,
  ];

  log("chromium", `Starte Kiosk → ${startUrl}`);
  chromiumProc = Bun.spawn(args, {
    stdout: "ignore",
    stderr: "ignore",
    onExit(_proc, exitCode) {
      chromiumProc = null;
      if (chromiumKillReason) {
        log("chromium", `Beendet (${chromiumKillReason})`);
        return;
      }
      log("chromium", `Abgestürzt (code ${exitCode}), Neustart in 2s...`);
      setTimeout(spawnChromium, 2000);
    },
  });
}

function restartChromium(): void {
  if (!chromiumProc || DEV_MODE) return;
  log("chromium", "Neustart nach Sync...");
  chromiumKillReason = "sync";
  chromiumProc.kill();
  setTimeout(spawnChromium, 1000);
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
      files.push({
        name,
        type: isVideo ? "video" : "image",
        size: Bun.file(`${dir}/${name}`).size,
      });
    }
  } catch {
    // Directory doesn't exist yet
  }

  return files;
}

// --- Sync helper ---

function triggerSync(location: string): void {
  if (syncStatus.isSyncing) return;

  syncStatus = { isSyncing: true, lastSync: syncStatus.lastSync, error: null, message: "Sync gestartet..." };

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
      if (result.success && (result.downloaded > 0 || result.updated > 0 || result.deleted > 0)) {
        restartChromium();
      }
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
    "/flieden": homepage,
    "/neuhof": homepage,
    "/gersfeld": homepage,
    "/schlitz": homepage,
    "/eichenzell": homepage,

    "/api/files/:location": async (req) => {
      const location = req.params.location.toLowerCase();
      if (!LOCATIONS.includes(location)) {
        return Response.json({ error: "Unknown location" }, { status: 404 });
      }
      const files = await listMediaFiles(location);
      return Response.json({ files, location });
    },

    "/api/status": () => {
      const mem = process.memoryUsage();
      return Response.json({
        selectedLocation: config.selectedLocation,
        syncStatus,
        nextSync: getNextSync(),
        memory: {
          rss: Math.round(mem.rss / 1024 / 1024),
          heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        },
        watchdog: {
          lastHeartbeat: new Date(lastHeartbeat).toISOString(),
          secondsSinceHeartbeat: Math.round((Date.now() - lastHeartbeat) / 1000),
          consecutiveFailedChecks,
        },
      });
    },

    "/api/set-location": {
      POST: async (req) => {
        const body = await req.json();
        const location = body.location ? String(body.location).toLowerCase() : null;

        config.selectedLocation = location;
        await saveConfig(config);

        if (location) triggerSync(location);
        return Response.json({ ok: true, location });
      },
    },

    "/api/sync": {
      POST: () => {
        if (!config.selectedLocation) {
          return Response.json({ error: "No location selected" }, { status: 400 });
        }
        if (syncStatus.isSyncing) {
          return Response.json({ error: "Sync already in progress" }, { status: 409 });
        }
        triggerSync(config.selectedLocation);
        return Response.json({ ok: true });
      },
    },

    "/api/heartbeat": {
      POST: () => {
        lastHeartbeat = Date.now();
        consecutiveFailedChecks = 0;
        return Response.json({ ok: true });
      },
    },

    "/api/kill-kiosk": {
      POST: () => {
        if (chromiumProc) {
          chromiumKillReason = "manuell";
          chromiumProc.kill();
          return Response.json({ ok: true });
        }
        return Response.json({ ok: false, message: "No Chromium process" });
      },
    },
  },

  fetch(req) {
    const url = new URL(req.url);

    // Media files: /media/{location}/{file}
    if (url.pathname.startsWith("/media/")) {
      const resolvedMedia = path.resolve(MEDIA_DIR);
      const filePath = path.resolve(MEDIA_DIR, decodeURIComponent(url.pathname.slice("/media/".length)));
      if (!filePath.startsWith(resolvedMedia + path.sep)) {
        return new Response("Forbidden", { status: 403 });
      }
      return new Response(Bun.file(filePath));
    }

    return new Response("Not Found", { status: 404 });
  },

  error(error) {
    log("server", `✗ Unhandled: ${error.message}`);
    return new Response("Internal Error", { status: 500 });
  },

  development: DEV_MODE,
});

// --- Startup ---

startScheduler(
  () => {
    if (config.selectedLocation && !syncStatus.isSyncing) {
      log("scheduler", `Sync für ${config.selectedLocation}`);
      triggerSync(config.selectedLocation);
    }
  },
  () => {
    if (!DEV_MODE) {
      log("server", "3 AM Restart");
      if (chromiumProc) {
        chromiumKillReason = "neustart";
        chromiumProc.kill();
      }
      process.exit(0);
    }
  },
);

spawnChromium();

// --- Resource monitoring (every 5 min) ---

setInterval(async () => {
  const mem = process.memoryUsage();
  const bunRss = Math.round(mem.rss / 1024 / 1024);
  const bunHeap = Math.round(mem.heapUsed / 1024 / 1024);

  let chromeMb = 0;
  if (chromiumProc?.pid) {
    try {
      const result = Bun.spawnSync(["bash", "-c", `ps -o rss= --ppid ${chromiumProc.pid} 2>/dev/null; ps -o rss= -p ${chromiumProc.pid} 2>/dev/null`]);
      const output = result.stdout.toString().trim();
      if (output) {
        chromeMb = Math.round(output.split("\n").reduce((sum, line) => sum + (parseInt(line.trim()) || 0), 0) / 1024);
      }
    } catch {}
  }

  log("monitor", `Bun: ${bunRss}MB RSS, ${bunHeap}MB Heap | Chrome: ${chromeMb}MB`);
}, 5 * 60_000);

// --- Heartbeat watchdog (every 60s) ---

setInterval(() => {
  if (DEV_MODE || !chromiumProc || !config.selectedLocation) return;

  const elapsed = Date.now() - lastHeartbeat;
  if (elapsed < HEARTBEAT_TIMEOUT) return;

  consecutiveFailedChecks++;
  log("monitor", `Kein Heartbeat seit ${Math.round(elapsed / 1000)}s (${consecutiveFailedChecks}/${MAX_FAILED_RESTARTS})`);

  if (consecutiveFailedChecks >= MAX_FAILED_RESTARTS) {
    log("monitor", `${MAX_FAILED_RESTARTS}x kein Heartbeat — process.exit(1)`);
    if (chromiumProc) {
      chromiumKillReason = "neustart";
      chromiumProc.kill();
    }
    process.exit(1);
  }

  log("monitor", "Chromium-Neustart wegen fehlendem Heartbeat...");
  chromiumKillReason = "neustart";
  chromiumProc.kill();
  setTimeout(spawnChromium, 2000);
}, HEARTBEAT_CHECK_INTERVAL);

if (config.selectedLocation) {
  log("server", `Location: ${config.selectedLocation}`);
  log("server", `GF-Kiosk gestartet → http://localhost:${PORT}/${config.selectedLocation}`);
  triggerSync(config.selectedLocation);
} else {
  log("server", `GF-Kiosk gestartet → http://localhost:${PORT} (keine Location)`);
}
