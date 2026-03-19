import { mkdir, rename } from "node:fs/promises";
import path from "node:path";

const WORKER_URL = process.env.WORKER_URL ?? "https://gf-kiosk.brandwork.tech";
const KIOSK_PIN = process.env.KIOSK_PIN ?? "1234";

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

// --- Session management ---

let sessionCookie: string | null = null;

async function ensureSession(): Promise<void> {
  if (sessionCookie) return;

  console.log("[sync] Logging in to Worker...");
  const res = await fetch(`${WORKER_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: KIOSK_PIN }),
    redirect: "manual",
  });

  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${res.statusText}`);
  }

  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const match = setCookie.match(/kiosk_session=([^;]+)/);
    if (match) {
      sessionCookie = match[1];
      console.log("[sync] Worker session established");
      return;
    }
  }

  throw new Error("Login succeeded but no session cookie received");
}

function clearSession(): void {
  sessionCookie = null;
}

function authHeaders(): Record<string, string> {
  return sessionCookie ? { Cookie: `kiosk_session=${sessionCookie}` } : {};
}

// --- API calls ---

async function fetchLocationFiles(location: string): Promise<DriveFile[]> {
  await ensureSession();

  const url = `${WORKER_URL}/api/locations/${encodeURIComponent(location)}/files`;
  const res = await fetch(url, { headers: authHeaders() });

  if (res.status === 401) {
    clearSession();
    await ensureSession();
    const retry = await fetch(url, { headers: authHeaders() });
    if (!retry.ok) {
      throw new Error(`Worker API error: ${retry.status} ${retry.statusText}`);
    }
    const data = (await retry.json()) as { files: DriveFile[] };
    return data.files ?? [];
  }

  if (!res.ok) {
    throw new Error(`Worker API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { files: DriveFile[] };
  return data.files ?? [];
}

async function downloadFile(fileId: string, targetPath: string): Promise<boolean> {
  await ensureSession();

  const url = `${WORKER_URL}/api/drive/files/${fileId}?alt=media`;

  try {
    const res = await fetch(url, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });

    if (res.status === 401) {
      clearSession();
      await ensureSession();
      const retry = await fetch(url, {
        headers: authHeaders(),
        signal: AbortSignal.timeout(10 * 60 * 1000),
      });
      if (!retry.ok) {
        console.error(`[ERR] Download failed (${retry.status}): ${targetPath}`);
        return false;
      }
      await Bun.write(targetPath, retry);
      return true;
    }

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

// --- Local file comparison ---

async function listLocalFiles(mediaDir: string, location: string): Promise<Map<string, number>> {
  const dir = path.join(mediaDir, location);
  const map = new Map<string, number>();

  const glob = new Bun.Glob("*");
  try {
    for await (const name of glob.scan({ cwd: dir, onlyFiles: true })) {
      if (name.startsWith(".") && name.endsWith(".tmp")) continue;
      const file = Bun.file(path.join(dir, name));
      map.set(name, file.lastModified);
    }
  } catch {
    // Directory doesn't exist yet
  }

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
        const driveModified = new Date(file.modifiedTime).getTime();
        if (driveModified > localModified) {
          toUpdate.push(file);
        } else {
          unchanged++;
        }
      }
    }

    for (const [name] of localFiles) {
      if (!driveMap.has(name)) {
        toDelete.push(name);
      }
    }

    console.log(
      `[sync] Plan: ${toDownload.length} new, ${toUpdate.length} updated, ${toDelete.length} deleted, ${unchanged} unchanged`,
    );

    if (toDownload.length === 0 && toUpdate.length === 0 && toDelete.length === 0) {
      console.log("[sync] Already up to date");
      return { success: true, downloaded: 0, updated: 0, deleted: 0, unchanged };
    }

    // Delete removed files using Bun.file().delete()
    for (const name of toDelete) {
      onProgress?.(`Deleting ${name}...`);
      await Bun.file(path.join(locationDir, name)).delete();
    }

    // Download new + updated files (to temp, then rename)
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

    console.log(
      `[sync] Complete: ${toDownload.length} downloaded, ${toUpdate.length} updated, ${toDelete.length} deleted`,
    );

    return {
      success: true,
      downloaded: toDownload.length,
      updated: toUpdate.length,
      deleted: toDelete.length,
      unchanged,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[ERR] Sync failed:", msg);
    return { success: false, downloaded: 0, updated: 0, deleted: 0, unchanged: 0, error: msg };
  }
}
