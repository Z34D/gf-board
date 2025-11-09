import { useEffect, useRef, useState, useMemo } from 'react'
import { file } from 'opfs-tools'

/**
 * Hook zum Konvertieren von OPFS Paths zu blob URLs
 * Memoized um zu verhindern dass URLs mehrfach recreated werden
 */
export const useMediaBlobUrls = (mediaFiles: any[]) => {
  const [mediaUrls, setMediaUrls] = useState<{ [key: string]: string }>({})
  const objectUrlsRef = useRef<Set<string>>(new Set())
  const loadedRef = useRef<Set<string>>(new Set())

  // Memoize mediaFiles um zu verhinderten dass Hook mehrfach triggert
  const memoizedFiles = useMemo(() => mediaFiles, [mediaFiles.length])

  useEffect(() => {
    const convertToBlobs = async () => {
      const urls: { [key: string]: string } = {}
      const newLoaded = new Set<string>()

      for (const mediaFile of memoizedFiles) {
        if (!mediaFile.localPath) continue

        // Skip wenn bereits geladen
        if (loadedRef.current.has(mediaFile.localPath)) {
          continue
        }

        try {
          // Get file from OPFS
          const fileHandle = file(mediaFile.localPath)
          const exists = await fileHandle.exists()

          if (!exists) {
            console.warn(`⚠️ File not found in OPFS: ${mediaFile.localPath}`)
            continue
          }

          // Get original file and create blob URL
          const originalFile = await fileHandle.getOriginFile()
          if (!originalFile) {
            console.warn(`⚠️ Could not load file from OPFS: ${mediaFile.localPath}`)
            continue
          }

          const blobUrl = URL.createObjectURL(originalFile)
          urls[mediaFile.localPath] = blobUrl
          objectUrlsRef.current.add(blobUrl)
          newLoaded.add(mediaFile.localPath)

          console.log(`✅ Created blob URL for ${mediaFile.name}`)
        } catch (error) {
          console.error(`❌ Error converting ${mediaFile.localPath}:`, error)
        }
      }

      // Nur update wenn neue URLs erstellt wurden
      if (newLoaded.size > 0) {
        loadedRef.current = new Set([...loadedRef.current, ...newLoaded])
        setMediaUrls((prev) => ({ ...prev, ...urls }))
      }
    }

    convertToBlobs()

    // Cleanup - aber preserve URLs bis component unmount
    return () => {
      // Nicht hier löschen - nur bei unmount
    }
  }, [memoizedFiles])

  // Nur beim unmount clearen
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url)
      })
      objectUrlsRef.current.clear()
      loadedRef.current.clear()
    }
  }, [])

  return mediaUrls
}
