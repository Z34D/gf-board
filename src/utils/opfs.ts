/**
 * OPFS (Origin Private File System) utilities
 * Handles all file operations for offline media storage
 * @module utils/opfs
 */

import { file, dir, write } from "opfs-tools";

/** Directory for active media files (slideshow reads from here) */
export const MEDIA_DIR = "/media";

/** Temporary directory for downloads (cleared after sync) */
export const UPDATE_DIR = "/update";

/**
 * Ensures a directory exists in OPFS, creating it if necessary
 * @param path - Directory path to ensure exists
 * @throws Error if directory creation fails
 */
export async function ensureDir(path: string): Promise<void> {
  try {
    const dirHandle = dir(path);
    const exists = await dirHandle.exists();
    if (!exists) {
      await dirHandle.create();
    }
  } catch (error) {
    console.error(`❌ Failed to create directory ${path}:`, error);
    throw error;
  }
}

/**
 * Initializes the OPFS directory structure
 * Creates /media and /update directories if they don't exist
 */
export async function initOPFS(): Promise<void> {
  await ensureDir(MEDIA_DIR);
  await ensureDir(UPDATE_DIR);
}

/**
 * Checks if a file exists in OPFS
 * @param path - File path to check
 * @returns True if file exists, false otherwise
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    const fileHandle = file(path);
    return await fileHandle.exists();
  } catch {
    return false;
  }
}

/**
 * Saves a file to OPFS
 * @param path - Destination path in OPFS
 * @param data - File or ReadableStream to save
 * @throws Error if save fails
 */
export async function saveFile(
  path: string,
  data: File | ReadableStream,
): Promise<void> {
  try {
    const stream = data instanceof File ? data.stream() : data;
    await write(path, stream);
  } catch (error) {
    console.error(`❌ Failed to save file ${path}:`, error);
    throw error;
  }
}

/**
 * Loads a file from OPFS
 * @param path - File path to load
 * @returns File object or null if not found/error
 */
export async function loadFile(path: string): Promise<File | null> {
  try {
    const fileHandle = file(path);
    const exists = await fileHandle.exists();
    if (!exists) return null;

    const originalFile = await fileHandle.getOriginFile();
    return originalFile || null;
  } catch (error) {
    console.error(`❌ Failed to load file ${path}:`, error);
    return null;
  }
}

/**
 * Deletes a file from OPFS (silent if not exists)
 * @param path - File path to delete
 */
export async function deleteFile(path: string): Promise<void> {
  try {
    const fileHandle = file(path);
    const exists = await fileHandle.exists();
    if (exists) {
      await fileHandle.remove();
    }
  } catch (error) {
    console.error(`❌ Failed to delete file ${path}:`, error);
  }
}

/**
 * Lists all files in a directory
 * @param dirPath - Directory path to list
 * @returns Array of file names (not full paths)
 */
export async function listFiles(dirPath: string): Promise<string[]> {
  try {
    const dirHandle = dir(dirPath);
    const exists = await dirHandle.exists();
    if (!exists) return [];

    const children = await dirHandle.children();
    return children
      .filter((child) => child.kind === "file")
      .map((child) => child.name);
  } catch (error) {
    console.error(`❌ Failed to list files in ${dirPath}:`, error);
    return [];
  }
}

/**
 * Clears all files and subdirectories in a directory
 * @param dirPath - Directory path to clear
 */
export async function clearDir(dirPath: string): Promise<void> {
  try {
    const dirHandle = dir(dirPath);
    const exists = await dirHandle.exists();
    if (!exists) return;

    const children = await dirHandle.children();
    for (const child of children) {
      if (child.kind === "file") {
        const fileHandle = file(`${dirPath}/${child.name}`);
        await fileHandle.remove();
      } else if (child.kind === "dir") {
        const subDir = dir(`${dirPath}/${child.name}`);
        await subDir.remove();
      }
    }
  } catch (error) {
    console.error(`❌ Failed to clear directory ${dirPath}:`, error);
  }
}

/**
 * Gets file metadata (size and last modified date)
 * @param path - File path to get info for
 * @returns Object with size and lastModified, or null if not found
 */
export async function getFileInfo(
  path: string,
): Promise<{ size: number; lastModified: Date } | null> {
  try {
    const originalFile = await loadFile(path);
    if (!originalFile) return null;

    return {
      size: originalFile.size,
      lastModified: new Date(originalFile.lastModified),
    };
  } catch {
    return null;
  }
}

/**
 * Gets info for all files in the media directory
 * @returns Array of objects with name, size, and lastModified for each file
 */
export async function getMediaFilesInfo(): Promise<
  Array<{ name: string; size: number; lastModified: Date }>
> {
  const files = await listFiles(MEDIA_DIR);
  const result: Array<{ name: string; size: number; lastModified: Date }> = [];

  for (const fileName of files) {
    const info = await getFileInfo(`${MEDIA_DIR}/${fileName}`);
    if (info) {
      result.push({ name: fileName, ...info });
    }
  }

  return result;
}
