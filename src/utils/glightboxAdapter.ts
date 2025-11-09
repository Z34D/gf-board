import { file } from 'opfs-tools'
import type { MediaFile } from '../stores/appStore'

export interface GLightboxSlide {
  href: string
  type: 'image' | 'video'
  title?: string
  description?: string
  width?: string
  height?: string
  videoDuration?: number  // Duration in seconds for videos
}

/**
 * GLightbox Adapter für OPFS
 * Konvertiert MediaFile Objekte aus OPFS zu GLightbox-kompatiblen Slides
 */
export class OPFSGLightboxAdapter {
  private objectUrls: Set<string> = new Set()

  /**
   * Konvertiert MediaFile Array zu GLightbox Slides
   */
  async convertToSlides(mediaFiles: MediaFile[]): Promise<GLightboxSlide[]> {
    const slides: GLightboxSlide[] = []
    
    for (const mediaFile of mediaFiles) {
      try {
        const slide = await this.createSlideFromMediaFile(mediaFile)
        slides.push(slide)
      } catch (error) {
        console.error(`❌ [GLIGHTBOX] Failed to create slide for ${mediaFile.name}:`, error)
      }
    }
    
    return slides
  }

  /**
   * Misst die Dauer eines Videos
   */
  private async getVideoDuration(videoUrl: string): Promise<number> {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      video.src = videoUrl

      const handleLoadedMetadata = () => {
        cleanup()
        const duration = video.duration
        if (isFinite(duration) && duration > 0) {
          resolve(duration)
        } else {
          // Fallback if duration is invalid
          resolve(10)
        }
      }

      const handleError = () => {
        cleanup()
        // Fallback if video can't be loaded
        resolve(10)
      }

      const cleanup = () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata)
        video.removeEventListener('error', handleError)
      }

      video.addEventListener('loadedmetadata', handleLoadedMetadata)
      video.addEventListener('error', handleError)
    })
  }

  /**
   * Erstellt einen GLightbox Slide aus einem MediaFile
   */
  private async createSlideFromMediaFile(mediaFile: MediaFile): Promise<GLightboxSlide> {
    if (!mediaFile.localPath) {
      throw new Error(`No local path for media file: ${mediaFile.name}`)
    }

    // Prüfen ob Datei in OPFS existiert
    const fileHandle = file(mediaFile.localPath)
    const exists = await fileHandle.exists()

    if (!exists) {
      throw new Error(`File not found in OPFS: ${mediaFile.localPath}`)
    }

    // Original File aus OPFS laden
    const originalFile = await fileHandle.getOriginFile()
    if (!originalFile) {
      throw new Error(`Could not load file from OPFS: ${mediaFile.localPath}`)
    }
    const objectUrl = URL.createObjectURL(originalFile)

    // Object URL für Cleanup speichern
    this.objectUrls.add(objectUrl)

    const slide: GLightboxSlide = {
      href: objectUrl,
      type: mediaFile.type,
      title: undefined, // Keine Titel/Captions
      description: undefined, // Keine Beschreibungen
      width: '100vw',
      height: '100vh'
    }

    // Video-spezifische Konfiguration
    if (mediaFile.type === 'video') {
      slide.width = '100vw'
      slide.height = '100vh'
      // Measure video duration before passing to GLightbox
      try {
        const duration = await this.getVideoDuration(objectUrl)
        slide.videoDuration = duration
        console.log(`📊 Video duration measured: ${duration.toFixed(1)}s`)
      } catch (error) {
        console.warn(`⚠️ Could not measure video duration:`, error)
        slide.videoDuration = 10 // Fallback
      }
    }

    return slide
  }


  /**
   * Bereinigt alle erstellten Object URLs
   */
  cleanup(): void {
    this.objectUrls.forEach(url => {
      URL.revokeObjectURL(url)
    })
    this.objectUrls.clear()
  }

  /**
   * Bereinigt eine spezifische Object URL
   */
  revokeObjectUrl(url: string): void {
    if (this.objectUrls.has(url)) {
      URL.revokeObjectURL(url)
      this.objectUrls.delete(url)
    }
  }
}

// Singleton Instance
export const opfsGLightboxAdapter = new OPFSGLightboxAdapter()
