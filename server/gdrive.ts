import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { log, formatSize, formatDuration } from "./logger";

const API_KEY = process.env.GOOGLE_DRIVE_API_KEY ?? "";
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? "";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2_000;

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  modifiedTime: string;
}

export interface SyncResult {
  success: boolean;
  downloaded: number;
  updated: number;
  deleted: number;
  unchanged: number;
  error?: string;
}

// --- Google Drive API ---

async function listFolder(folderId: string): Promise<DriveFile[]> {
  const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&key=${API_KEY}&fields=files(id,name,mimeType,size,modifiedTime)`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${res.statusText}`);
  const data = (await res.json()) as { files: DriveFile[] };
  return data.files ?? [];
}

/**
 * Fetches all media files for a location: shared/ first, then location-specific.
 * Location files take priority over shared files with the same filename.
 */
async function fetchLocationFiles(location: string): Promise<DriveFile[]> {
  const isMedia = (f: DriveFile) =>
    f.mimeType.startsWith("image/") || f.mimeType.startsWith("video/");

  const rootEntries = await listFolder(ROOT_FOLDER_ID);

  const sharedFolder = rootEntries.find(
    (f) => f.name.toLowerCase() === "shared" && f.mimeType === "application/vnd.google-apps.folder",
  );
  const locationFolder = rootEntries.find(
    (f) => f.name.toLowerCase() === location.toLowerCase() && f.mimeType === "application/vnd.google-apps.folder",
  );

  const fileMap = new Map<string, DriveFile>();

  if (sharedFolder) {
    for (const f of (await listFolder(sharedFolder.id)).filter(isMedia)) {
      fileMap.set(f.name, f);
    }
  }
  if (locationFolder) {
    for (const f of (await listFolder(locationFolder.id)).filter(isMedia)) {
      fileMap.set(f.name, f);
    }
  }

  return [...fileMap.values()];
}

/**
 * Downloads a single file and verifies size. Returns false on failure.
 */
async function downloadFile(fileId: string, targetPath: string, expectedSize: number): Promise<boolean> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${API_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) });

  if (!res.ok) {
    log("sync", `✗ Download HTTP ${res.status}: ${path.basename(targetPath)}`);
    return false;
  }

  await Bun.write(targetPath, res);

  const written = Bun.file(targetPath).size;
  if (written !== expectedSize) {
    log("sync", `✗ Größe falsch: ${path.basename(targetPath)} (${formatSize(written)} statt ${formatSize(expectedSize)})`);
    try { await Bun.file(targetPath).delete(); } catch {}
    return false;
  }

  return true;
}

/**
 * Downloads with retry + backoff (2s, 4s, 6s).
 * Uses tmp file + atomic rename.
 */
async function downloadWithRetry(file: DriveFile, locationDir: string): Promise<boolean> {
  const expectedSize = Number(file.size);
  const tmpPath = path.join(locationDir, `.${file.name}.tmp`);
  const finalPath = path.join(locationDir, file.name);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (await downloadFile(file.id, tmpPath, expectedSize)) {
        await rename(tmpPath, finalPath);
        return true;
      }
    } catch (err) {
      log("sync", `✗ ${file.name} Versuch ${attempt}/${MAX_RETRIES}: ${err instanceof Error ? err.message : err}`);
    }

    // Cleanup tmp after failed attempt
    try { await Bun.file(tmpPath).delete(); } catch {}

    if (attempt < MAX_RETRIES) {
      await Bun.sleep(RETRY_BASE_MS * attempt);
    }
  }

  return false;
}

// --- Local file listing ---

async function listLocalFiles(mediaDir: string, location: string): Promise<Map<string, number>> {
  const dir = path.join(mediaDir, location);
  const map = new Map<string, number>();
  const glob = new Bun.Glob("*");
  try {
    for await (const name of glob.scan({ cwd: dir, onlyFiles: true })) {
      if (name.endsWith(".tmp")) continue;
      map.set(name, Bun.file(path.join(dir, name)).lastModified);
    }
  } catch { /* directory doesn't exist yet */ }
  return map;
}

/**
 * Cleans up leftover .tmp files from interrupted downloads.
 */
async function cleanupTmpFiles(dir: string): Promise<void> {
  const glob = new Bun.Glob("*.tmp");
  try {
    for await (const name of glob.scan({ cwd: dir, onlyFiles: true })) {
      try { await Bun.file(path.join(dir, name)).delete(); } catch {}
    }
  } catch {}
}

// --- Main sync ---

export async function syncLocation(
  location: string,
  mediaDir: string,
  onProgress?: (message: string) => void,
): Promise<SyncResult> {
  const start = Date.now();

  try {
    log("sync", `Gestartet: ${location}`);
    onProgress?.("Prüfe Internet...");

    try {
      await fetch("https://1.1.1.1", { method: "HEAD", signal: AbortSignal.timeout(5_000) });
    } catch {
      log("sync", "Kein Internet — übersprungen");
      return { success: false, downloaded: 0, updated: 0, deleted: 0, unchanged: 0, error: "Kein Internet" };
    }

    onProgress?.("Lade Dateiliste...");
    const driveFiles = await fetchLocationFiles(location);

    if (driveFiles.length === 0) {
      log("sync", "Keine Dateien auf Drive");
      return { success: true, downloaded: 0, updated: 0, deleted: 0, unchanged: 0 };
    }

    const locationDir = path.join(mediaDir, location);
    await mkdir(locationDir, { recursive: true });
    await cleanupTmpFiles(locationDir);

    const localFiles = await listLocalFiles(mediaDir, location);
    const driveMap = new Map(driveFiles.map((f) => [f.name, f]));

    const toDownload: DriveFile[] = [];
    const toUpdate: DriveFile[] = [];
    const toDelete: string[] = [];
    let unchanged = 0;

    for (const file of driveFiles) {
      const localModified = localFiles.get(file.name);
      if (localModified === undefined) {
        toDownload.push(file);
      } else if (new Date(file.modifiedTime).getTime() > localModified) {
        toUpdate.push(file);
      } else {
        unchanged++;
      }
    }

    for (const [name] of localFiles) {
      if (!driveMap.has(name)) toDelete.push(name);
    }

    if (toDownload.length === 0 && toUpdate.length === 0 && toDelete.length === 0) {
      log("sync", `Alles aktuell (${unchanged} Dateien)`);
      return { success: true, downloaded: 0, updated: 0, deleted: 0, unchanged };
    }

    log("sync", `+${toDownload.length} neu, ~${toUpdate.length} geändert, -${toDelete.length} gelöscht, =${unchanged} aktuell`);

    // Delete removed files
    for (const name of toDelete) {
      onProgress?.(`Lösche ${name}...`);
      try {
        await Bun.file(path.join(locationDir, name)).delete();
      } catch {
        log("sync", `✗ Löschen fehlgeschlagen: ${name}`);
      }
    }

    // Download new + updated
    const allToFetch = [...toDownload, ...toUpdate];
    const failed: string[] = [];

    for (let i = 0; i < allToFetch.length; i++) {
      const file = allToFetch[i];
      onProgress?.(`${file.name} (${i + 1}/${allToFetch.length})...`);
      log("sync", `↓ ${file.name} (${i + 1}/${allToFetch.length}, ${formatSize(Number(file.size))})`);

      if (!await downloadWithRetry(file, locationDir)) {
        failed.push(file.name);
      }
    }

    const duration = formatDuration(Date.now() - start);

    if (failed.length > 0) {
      log("sync", `✗ Teilweise fehlgeschlagen (${duration}): ${failed.join(", ")}`);
      return {
        success: false,
        downloaded: toDownload.length - failed.filter(n => toDownload.some(f => f.name === n)).length,
        updated: toUpdate.length - failed.filter(n => toUpdate.some(f => f.name === n)).length,
        deleted: toDelete.length,
        unchanged,
        error: `Fehlgeschlagen: ${failed.join(", ")}`,
      };
    }

    log("sync", `Fertig (${duration}): +${toDownload.length} neu, ~${toUpdate.length} geändert, -${toDelete.length} gelöscht`);
    return { success: true, downloaded: toDownload.length, updated: toUpdate.length, deleted: toDelete.length, unchanged };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log("sync", `✗ Sync fehlgeschlagen: ${msg}`);
    return { success: false, downloaded: 0, updated: 0, deleted: 0, unchanged: 0, error: msg };
  }
}
