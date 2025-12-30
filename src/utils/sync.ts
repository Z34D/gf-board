/**
 * Background sync utilities for Google Drive media synchronization
 *
 * Implements a non-blocking sync pattern:
 * 1. Compare local files with Drive files
 * 2. Download only new/updated files to /update/
 * 3. Move successful downloads to /media/
 * 4. Clean up /update/ directory
 *
 * @module utils/sync
 */

import {
  initOPFS,
  getMediaFilesInfo,
  clearDir,
  UPDATE_DIR,
  MEDIA_DIR,
  listFiles,
  deleteFile,
  saveFile,
  loadFile,
} from "./opfs";
import { downloadFile, calculateRetryDelay, wait } from "./download";

/** File metadata from Google Drive API */
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  modifiedTime: string;
}

/** Normalized media file for internal use */
export interface MediaFile {
  id: string;
  name: string;
  type: "image" | "video";
  size: number;
  lastModified?: string;
}

/** Result of a sync operation */
export interface SyncResult {
  success: boolean;
  downloaded: number;
  updated: number;
  deleted: number;
  unchanged: number;
  error?: string;
}

// Global sync state (prevents concurrent syncs)
let isSyncing = false;
let currentSyncAbortController: AbortController | null = null;

/**
 * Checks if a sync operation is currently running
 * @returns True if sync is in progress
 */
export function isSyncInProgress(): boolean {
  return isSyncing;
}

/**
 * Aborts the current sync operation if running
 */
export function abortSync(): void {
  if (currentSyncAbortController) {
    currentSyncAbortController.abort();
    currentSyncAbortController = null;
  }
  isSyncing = false;
}

/**
 * Fetches file list for a location from the API
 * Aborts immediately on network errors (offline), retries only on server errors
 *
 * @param location - Gym location name (e.g., "Gersfeld")
 * @returns Array of files from Google Drive
 * @throws Error on network failure or after retries exhausted
 */
export async function fetchLocationFiles(
  location: string,
): Promise<DriveFile[]> {
  try {
    const response = await fetch(`/api/locations/${location}/files`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.files || [];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    // Network errors - abort immediately, don't retry
    if (message.includes("fetch") || message.includes("network")) {
      throw new Error(`Network offline - sync aborted`);
    }
    throw error;
  }
}

/**
 * Converts a DriveFile to internal MediaFile format
 */
function toMediaFile(driveFile: DriveFile): MediaFile {
  return {
    id: driveFile.id,
    name: driveFile.name,
    type: driveFile.mimeType.startsWith("image/") ? "image" : "video",
    size: parseInt(driveFile.size) || 0,
    lastModified: driveFile.modifiedTime,
  };
}

/**
 * Compares drive files with local OPFS files to determine sync actions
 *
 * @param driveFiles - Files from Google Drive
 * @returns Object with arrays: toDownload, toUpdate, toDelete, unchanged
 */
async function compareFiles(driveFiles: MediaFile[]): Promise<{
  toDownload: MediaFile[];
  toUpdate: MediaFile[];
  toDelete: string[];
  unchanged: MediaFile[];
}> {
  const localFiles = await getMediaFilesInfo();
  const localMap = new Map(localFiles.map((f) => [f.name, f]));
  const driveMap = new Map(driveFiles.map((f) => [f.name, f]));

  const toDownload: MediaFile[] = [];
  const toUpdate: MediaFile[] = [];
  const unchanged: MediaFile[] = [];
  const toDelete: string[] = [];

  // Check each drive file against local files
  for (const driveFile of driveFiles) {
    const localFile = localMap.get(driveFile.name);

    if (!localFile) {
      // New file - needs download
      toDownload.push(driveFile);
    } else {
      const driveModified = new Date(driveFile.lastModified || 0);
      const localModified = localFile.lastModified;

      if (driveModified > localModified) {
        // Updated on drive - needs re-download
        toUpdate.push(driveFile);
      } else {
        // No changes
        unchanged.push(driveFile);
      }
    }
  }

  // Check for files deleted from drive
  for (const localFile of localFiles) {
    if (!driveMap.has(localFile.name)) {
      toDelete.push(localFile.name);
    }
  }

  return { toDownload, toUpdate, toDelete, unchanged };
}

/**
 * Performs a background sync for a gym location
 *
 * This is NON-BLOCKING - the slideshow continues with existing files
 * while sync runs in the background.
 *
 * Flow:
 * 1. Fetch file list from API (with retry)
 * 2. Compare with local OPFS files
 * 3. Delete removed files from /media/
 * 4. Download new/updated files to /update/
 * 5. Move successful downloads to /media/
 * 6. Clear /update/ directory
 *
 * @param location - Gym location name
 * @param onProgress - Optional callback for progress updates
 * @returns SyncResult with counts and success status
 */
export async function syncLocation(
  location: string,
  onProgress?: (message: string) => void,
): Promise<SyncResult> {
  if (isSyncing) {
    console.log("⏳ Sync already in progress, skipping");
    return {
      success: false,
      downloaded: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      error: "Sync already in progress",
    };
  }

  isSyncing = true;
  currentSyncAbortController = new AbortController();

  try {
    console.log(`🔄 Starting background sync: ${location}`);
    onProgress?.("Initializing...");

    // 1. Initialize OPFS directories
    await initOPFS();

    // Clear any leftover files from previous interrupted sync
    await clearDir(UPDATE_DIR);

    // 2. Fetch file list from API
    onProgress?.("Fetching file list...");
    const driveFiles = await fetchLocationFiles(location);
    const mediaFiles = driveFiles.map(toMediaFile);

    if (mediaFiles.length === 0) {
      console.log("ℹ️ No files found for location");
      isSyncing = false;
      return {
        success: true,
        downloaded: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
      };
    }

    // 3. Compare with local files
    const { toDownload, toUpdate, toDelete, unchanged } =
      await compareFiles(mediaFiles);

    const totalToSync = toDownload.length + toUpdate.length;
    console.log(
      `📊 Sync plan: ⬇️${toDownload.length} new, 🔄${toUpdate.length} updated, 🗑️${toDelete.length} deleted, ✓${unchanged.length} unchanged`,
    );

    // 4. If nothing to sync, we're done
    if (totalToSync === 0 && toDelete.length === 0) {
      console.log("✅ Already up to date");
      isSyncing = false;
      return {
        success: true,
        downloaded: 0,
        updated: 0,
        deleted: toDelete.length,
        unchanged: unchanged.length,
      };
    }

    // 5. Delete files that are no longer on Drive
    for (const fileName of toDelete) {
      await deleteFile(`${MEDIA_DIR}/${fileName}`);
    }

    // 6. Download new/updated files to update directory first
    const filesToSync = [...toDownload, ...toUpdate];
    let retryQueue: MediaFile[] = [];

    for (const file of filesToSync) {
      if (currentSyncAbortController?.signal.aborted) {
        throw new Error("Sync aborted");
      }

      onProgress?.(`Downloading ${file.name}...`);
      const success = await downloadFile(file.id, file.name);

      if (!success) {
        retryQueue.push(file);
      }
    }

    // 7. Retry failed downloads with exponential backoff
    let retryCount = 0;
    while (retryQueue.length > 0 && retryCount < 5) {
      const delay = calculateRetryDelay(retryCount);
      console.log(
        `⏳ Retrying ${retryQueue.length} failed downloads in ${delay / 1000}s...`,
      );

      await wait(delay);

      const stillFailed: MediaFile[] = [];
      for (const file of retryQueue) {
        if (currentSyncAbortController?.signal.aborted) {
          throw new Error("Sync aborted");
        }

        onProgress?.(`Retrying ${file.name}...`);
        const success = await downloadFile(file.id, file.name);

        if (!success) {
          stillFailed.push(file);
        }
      }

      retryQueue = stillFailed;
      retryCount++;
    }

    // 8. Check if all downloads succeeded
    if (retryQueue.length > 0) {
      console.error(
        `❌ ${retryQueue.length} files failed after retries:`,
        retryQueue.map((f) => f.name),
      );
      // Clear update directory - don't leave partial downloads
      await clearDir(UPDATE_DIR);
      isSyncing = false;
      return {
        success: false,
        downloaded: 0,
        updated: 0,
        deleted: 0,
        unchanged: unchanged.length,
        error: `Failed to download: ${retryQueue.map((f) => f.name).join(", ")}`,
      };
    }

    // 9. Move downloaded files from /update/ to /media/
    const downloadedFiles = await listFiles(UPDATE_DIR);
    for (const fileName of downloadedFiles) {
      const file = await loadFile(`${UPDATE_DIR}/${fileName}`);
      if (file) {
        await saveFile(`${MEDIA_DIR}/${fileName}`, file);
      }
    }

    // 10. Clear update directory
    await clearDir(UPDATE_DIR);

    console.log(
      `✅ Sync complete: ${toDownload.length} downloaded, ${toUpdate.length} updated, ${toDelete.length} deleted`,
    );

    isSyncing = false;
    return {
      success: true,
      downloaded: toDownload.length,
      updated: toUpdate.length,
      deleted: toDelete.length,
      unchanged: unchanged.length,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Sync failed:", errorMessage);
    // Clear update directory on error
    await clearDir(UPDATE_DIR);
    isSyncing = false;
    return {
      success: false,
      downloaded: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      error: errorMessage,
    };
  }
}

/**
 * Gets current media files from OPFS for slideshow playback
 * @returns Array of MediaFile objects from /media/ directory
 */
export async function getCurrentMediaFiles(): Promise<MediaFile[]> {
  await initOPFS();
  const files = await listFiles(MEDIA_DIR);

  return files.map((name) => {
    const isVideo = /\.(mp4|webm|mov|avi)$/i.test(name);
    return {
      id: name,
      name,
      type: isVideo ? ("video" as const) : ("image" as const),
      size: 0,
    };
  });
}
