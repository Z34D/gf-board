import { file } from 'opfs-tools'
import type { MediaFile } from '../stores/appStore'

export interface GLightboxSlide {
  href: string
  type: 'image' | 'video'
  title?: string
  description?: string
  width?: string
  height?: string
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
    console.log(`🎬 [GLIGHTBOX] Converting ${mediaFiles.length} media files to slides`)
    
    const slides: GLightboxSlide[] = []
    
    for (const mediaFile of mediaFiles) {
      try {
        const slide = await this.createSlideFromMediaFile(mediaFile)
        slides.push(slide)
        console.log(`✅ [GLIGHTBOX] Created slide for: ${mediaFile.name}`)
      } catch (error) {
        console.error(`❌ [GLIGHTBOX] Failed to create slide for ${mediaFile.name}:`, error)
      }
    }
    
    console.log(`🎬 [GLIGHTBOX] Successfully converted ${slides.length} slides`)
    return slides
  }

  /**
   * Erstellt einen GLightbox Slide aus einem MediaFile
   */
  private async createSlideFromMediaFile(mediaFile: MediaFile): Promise<GLightboxSlide> {
    console.log(`🎬 [GLIGHTBOX] Creating slide for: ${mediaFile.name} (type: ${mediaFile.type})`)
    
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
    
    console.log(`🎬 [GLIGHTBOX] Created object URL: ${objectUrl} for ${mediaFile.name}`)
    
    // Object URL für Cleanup speichern
    this.objectUrls.add(objectUrl)

    const slide: GLightboxSlide = {
      href: objectUrl,
      type: mediaFile.type,
      title: undefined, // Keine Titel/Captions
      description: undefined, // Keine Beschreibungen
      width: '90vw',
      height: 'auto'
    }

    // Video-spezifische Konfiguration
    if (mediaFile.type === 'video') {
      console.log(`🎬 [GLIGHTBOX] Configuring video slide for: ${mediaFile.name}`)
      slide.width = '90vw'
      slide.height = 'auto'
      console.log(`🎬 [GLIGHTBOX] Video slide configured:`, slide)
    }

    // Bild-spezifische Konfiguration
    if (mediaFile.type === 'image') {
      console.log(`🎬 [GLIGHTBOX] Image slide configured:`, slide)
    }

    return slide
  }

  /**
   * Formatiert Dateigröße für Anzeige
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Math.round(bytes / Math.pow(k, i) * 100) / 100} ${sizes[i]}`
  }

  /**
   * Gibt lesbaren Dateityp zurück
   */
  private getFileTypeLabel(type: string): string {
    switch (type) {
      case 'image': return 'Bild'
      case 'video': return 'Video'
      default: return 'Datei'
    }
  }

  /**
   * Bereinigt alle erstellten Object URLs
   */
  cleanup(): void {
    console.log(`🧹 [GLIGHTBOX] Cleaning up ${this.objectUrls.size} object URLs`)
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
