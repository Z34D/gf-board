/**
 * Hook to convert OPFS file paths to blob URLs for media playback
 *
 * Features:
 * - Loads files from OPFS and creates blob URLs
 * - Memoized to prevent unnecessary URL recreation
 * - Tracks loaded files to avoid duplicate conversions
 * - Revokes blob URLs on unmount to prevent memory leaks
 *
 * @module hooks/useMediaBlobUrls
 */

import { useEffect, useRef, useState, useMemo } from "react";
import { loadFile, MEDIA_DIR } from "../../../utils/opfs";
import type { MediaFile } from "../../../stores/appStore";

/**
 * Converts OPFS media files to blob URLs for browser playback
 *
 * @param mediaFiles - Array of media file metadata from store
 * @returns Map of localPath → blobUrl for each loaded file
 *
 * @example
 * const urls = useMediaBlobUrls(mediaFiles)
 * // urls = { "video1.mp4": "blob:http://...", "image1.jpg": "blob:http://..." }
 */
export const useMediaBlobUrls = (mediaFiles: MediaFile[]) => {
  const [mediaUrls, setMediaUrls] = useState<{ [key: string]: string }>({});
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const loadedRef = useRef<Set<string>>(new Set());

  // Memoize mediaFiles to prevent hook from triggering multiple times
  const memoizedFiles = useMemo(() => mediaFiles, [mediaFiles.length]);

  useEffect(() => {
    const convertToBlobs = async () => {
      const urls: { [key: string]: string } = {};
      const newLoaded = new Set<string>();

      for (const mediaFile of memoizedFiles) {
        const localPath = mediaFile.name;

        // Skip if already loaded
        if (loadedRef.current.has(localPath)) {
          continue;
        }

        try {
          // Get file from OPFS media directory
          const originalFile = await loadFile(`${MEDIA_DIR}/${localPath}`);

          if (!originalFile) {
            console.warn(`⚠️ File not found in OPFS: ${localPath}`);
            continue;
          }

          const blobUrl = URL.createObjectURL(originalFile);
          urls[localPath] = blobUrl;
          objectUrlsRef.current.add(blobUrl);
          newLoaded.add(localPath);
        } catch (error) {
          console.error(`❌ Error converting ${localPath}:`, error);
        }
      }

      // Only update if new URLs were created
      if (newLoaded.size > 0) {
        loadedRef.current = new Set([...loadedRef.current, ...newLoaded]);
        setMediaUrls((prev) => ({ ...prev, ...urls }));
      }
    };

    convertToBlobs();
  }, [memoizedFiles]);

  // Cleanup only on unmount
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      objectUrlsRef.current.clear();
      loadedRef.current.clear();
    };
  }, []);

  return mediaUrls;
};
