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
const LOCATIONS = ["Flieden", "Neuhof", "Gersfeld", "Schlitz", "Eichenzell"];

function findLocation(slug: string): string | undefined {
  return LOCATIONS.find((l) => l.toLowerCase() === slug.toLowerCase());
}

// --- Config persistence ---

interface Config {
  selectedLocation: string | null;
}

async function loadConfig(): Promise<Config> {
  try {
    const file = Bun.file(CONFIG_PATH);
    if (await file.exists()) {
      return await file.json();
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
let chromiumKilled = false;

function spawnChromium(): void {
  if (DEV_MODE) return;

  chromiumKilled = false;

  const startUrl = config.selectedLocation
    ? `http://localhost:${PORT}/${config.selectedLocation.toLowerCase()}`
    : `http://localhost:${PORT}/`;

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
    startUrl,
  ];

  log("chromium", `Starte Kiosk → ${startUrl}`);
  chromiumProc = Bun.spawn(args, {
    stdout: "ignore",
    stderr: "ignore",
    onExit(_proc, exitCode) {
      chromiumProc = null;
      if (chromiumKilled) {
        log("chromium", "Beendet (manuell)");
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
  chromiumKilled = true;
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
      const loc = findLocation(req.params.location);
      if (!loc) {
        return Response.json({ error: "Unknown location" }, { status: 404 });
      }
      const files = await listMediaFiles(loc);
      return Response.json({ files, location: loc });
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
      });
    },

    "/api/set-location": {
      POST: async (req) => {
        const body = await req.json();
        const raw = body.location as string | null;
        const loc = raw ? findLocation(raw) ?? null : null;

        config.selectedLocation = loc;
        await saveConfig(config);

        if (loc) triggerSync(loc);
        return Response.json({ ok: true, location: loc });
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

    "/api/kill-kiosk": {
      POST: () => {
        if (chromiumProc) {
          chromiumKilled = true;
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
        chromiumKilled = true;
        chromiumProc.kill();
      }
      process.exit(0);
    }
  },
);

spawnChromium();

if (config.selectedLocation) {
  log("server", `Location: ${config.selectedLocation}`);
  log("server", `GF-Kiosk gestartet → http://localhost:${PORT}/${config.selectedLocation.toLowerCase()}`);
  triggerSync(config.selectedLocation);
} else {
  log("server", `GF-Kiosk gestartet → http://localhost:${PORT} (keine Location)`);
}
