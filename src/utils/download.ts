/**
 * Download utilities with timeout and retry support
 * @module utils/download
 */

import { saveFile, UPDATE_DIR } from "./opfs";

/** Maximum time for a single download attempt (10 minutes) */
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

/** Initial delay before first retry (1 minute) */
const INITIAL_RETRY_DELAY_MS = 60 * 1000;

/** Maximum delay between retries (15 minutes) */
const MAX_RETRY_DELAY_MS = 15 * 60 * 1000;

/**
 * Downloads a file from the Google Drive API proxy
 *
 * Features:
 * - 10 minute timeout covering entire download (including streaming)
 * - Streams to blob to avoid memory issues
 * - Saves to /update/ directory for atomic sync
 *
 * @param fileId - Google Drive file ID
 * @param fileName - Name to save file as
 * @returns True if successful, false if failed
 */
export async function downloadFile(
  fileId: string,
  fileName: string,
): Promise<boolean> {
  const downloadUrl = `/api/drive/files/${fileId}?alt=media`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, DOWNLOAD_TIMEOUT_MS);

  try {
    console.log(`⬇️ Downloading: ${fileName}`);

    const response = await fetch(downloadUrl, { signal: controller.signal });

    if (!response.ok) {
      clearTimeout(timeoutId);
      console.error(`❌ HTTP error ${response.status}: ${fileName}`);
      return false;
    }

    if (!response.body) {
      clearTimeout(timeoutId);
      console.error(`❌ No response body: ${fileName}`);
      return false;
    }

    // Stream with abort signal still active (timeout covers streaming too)
    const result = await streamToBlob(response.body, controller.signal);
    clearTimeout(timeoutId);

    if (!result.success) {
      return false;
    }

    // Save to update directory
    const file = new File([result.blob], fileName, {
      type: response.headers.get("content-type") || "application/octet-stream",
    });

    await saveFile(`${UPDATE_DIR}/${fileName}`, file);
    console.log(
      `✅ Downloaded: ${fileName} (${(result.blob.size / 1024 / 1024).toFixed(2)}MB)`,
    );

    return true;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === "AbortError") {
      console.error(`⏱️ Download timeout: ${fileName}`);
    } else {
      console.error(`❌ Download failed: ${fileName}`, error);
    }
    return false;
  }
}

/**
 * Streams a response body to a Blob with abort support
 * @param body - ReadableStream from fetch response
 * @param signal - AbortSignal to cancel streaming
 * @returns Object with success status and resulting blob
 */
async function streamToBlob(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): Promise<{ success: boolean; blob: Blob }> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      if (signal.aborted) {
        reader.cancel();
        return { success: false, blob: new Blob() };
      }

      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return { success: true, blob: new Blob(chunks) };
  } catch (error) {
    console.error(`❌ Stream error:`, error);
    return { success: false, blob: new Blob() };
  }
}

/**
 * Calculates retry delay using exponential backoff
 *
 * Delay sequence: 1min → 2min → 4min → 8min → 15min (capped)
 *
 * @param retryCount - Number of retries so far (0-indexed)
 * @returns Delay in milliseconds
 */
export function calculateRetryDelay(retryCount: number): number {
  const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

/**
 * Waits for a specified duration
 * @param ms - Milliseconds to wait
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
