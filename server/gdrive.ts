import { mkdir, rename } from "node:fs/promises";
import path from "node:path";

const API_KEY = process.env.GOOGLE_DRIVE_API_KEY ?? "";
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? "";

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
  if (!res.ok) throw new Error(`Drive API error: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { files: DriveFile[] };
  return data.files ?? [];
}

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

  const files: DriveFile[] = [];
  if (sharedFolder) files.push(...(await listFolder(sharedFolder.id)).filter(isMedia));
  if (locationFolder) files.push(...(await listFolder(locationFolder.id)).filter(isMedia));
  return files;
}

async function downloadFile(fileId: string, targetPath: string): Promise<boolean> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${API_KEY}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10 * 60 * 1000) });
    if (!res.ok) {
      console.error(`[ERR] Download failed (${res.status}): ${targetPath}`);
      return false;
    }
    await Bun.write(targetPath, res);
    return true;
  } catch (err) {
    console.error(`[ERR] Download error for ${targetPath}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

// --- Local file listing ---

async function listLocalFiles(mediaDir: string, location: string): Promise<Map<string, number>> {
  const dir = path.join(mediaDir, location);
  const map = new Map<string, number>();
  const glob = new Bun.Glob("*");
  try {
    for await (const name of glob.scan({ cwd: dir, onlyFiles: true })) {
      if (name.startsWith(".") && name.endsWith(".tmp")) continue;
      map.set(name, Bun.file(path.join(dir, name)).lastModified);
    }
  } catch { /* directory doesn't exist yet */ }
  return map;
}

// --- Main sync ---

export async function syncLocation(
  location: string,
  mediaDir: string,
  onProgress?: (message: string) => void,
): Promise<SyncResult> {
  try {
    console.log(`[sync] Starting: ${location}`);
    onProgress?.("Checking internet...");

    try {
      await fetch("https://1.1.1.1", { method: "HEAD", signal: AbortSignal.timeout(5_000) });
    } catch {
      console.log("[sync] Kein Internet -- Sync übersprungen");
      return { success: false, downloaded: 0, updated: 0, deleted: 0, unchanged: 0, error: "Kein Internet" };
    }
    console.log("[sync] Internet OK");

    onProgress?.("Fetching file list...");
    const driveFiles = await fetchLocationFiles(location);

    if (driveFiles.length === 0) {
      console.log("[sync] No files found for location");
      return { success: true, downloaded: 0, updated: 0, deleted: 0, unchanged: 0 };
    }

    const locationDir = path.join(mediaDir, location);
    await mkdir(locationDir, { recursive: true });

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
      } else {
        if (new Date(file.modifiedTime).getTime() > localModified) {
          toUpdate.push(file);
        } else {
          unchanged++;
        }
      }
    }

    for (const [name] of localFiles) {
      if (!driveMap.has(name)) toDelete.push(name);
    }

    console.log(`[sync] Plan: ${toDownload.length} new, ${toUpdate.length} updated, ${toDelete.length} deleted, ${unchanged} unchanged`);

    if (toDownload.length === 0 && toUpdate.length === 0 && toDelete.length === 0) {
      console.log("[sync] Already up to date");
      return { success: true, downloaded: 0, updated: 0, deleted: 0, unchanged };
    }

    for (const name of toDelete) {
      onProgress?.(`Deleting ${name}...`);
      await Bun.file(path.join(locationDir, name)).delete();
    }

    const allToFetch = [...toDownload, ...toUpdate];
    const failed: string[] = [];

    for (let i = 0; i < allToFetch.length; i++) {
      const file = allToFetch[i];
      onProgress?.(`Downloading ${file.name} (${i + 1}/${allToFetch.length})...`);
      const tmpPath = path.join(locationDir, `.${file.name}.tmp`);
      const finalPath = path.join(locationDir, file.name);

      const ok = await downloadFile(file.id, tmpPath);
      if (ok) {
        await rename(tmpPath, finalPath);
      } else {
        onProgress?.(`Retrying ${file.name}...`);
        const retry = await downloadFile(file.id, tmpPath);
        if (retry) {
          await rename(tmpPath, finalPath);
        } else {
          failed.push(file.name);
          try { await Bun.file(tmpPath).delete(); } catch { /* ignore */ }
        }
      }
    }

    if (failed.length > 0) {
      console.error(`[ERR] ${failed.length} files failed: ${failed.join(", ")}`);
      return {
        success: false,
        downloaded: toDownload.length - failed.length,
        updated: toUpdate.length,
        deleted: toDelete.length,
        unchanged,
        error: `Failed: ${failed.join(", ")}`,
      };
    }

    console.log(`[sync] Complete: ${toDownload.length} downloaded, ${toUpdate.length} updated, ${toDelete.length} deleted`);
    return { success: true, downloaded: toDownload.length, updated: toUpdate.length, deleted: toDelete.length, unchanged };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[ERR] Sync failed:", msg);
    return { success: false, downloaded: 0, updated: 0, deleted: 0, unchanged: 0, error: msg };
  }
}
