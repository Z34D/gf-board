import React, { useEffect, useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { file } from 'opfs-tools'

const SlideshowView: React.FC = () => {
  const { selectedLocation, clearSelectedLocation, syncStatus, mediaFiles, currentIndex, nextMedia, previousMedia } = useAppStore()
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Load current media file from OPFS
  useEffect(() => {
    const loadCurrentMedia = async () => {
      if (mediaFiles.length === 0) return
      
      const currentFile = mediaFiles[currentIndex]
      if (!currentFile.localPath) return
      
      setIsLoading(true)
      console.log(`🖼️ [SLIDESHOW] Loading current media: ${currentFile.name}`)
      
      try {
        const fileHandle = file(currentFile.localPath)
        const exists = await fileHandle.exists()
        
        if (exists) {
          const originalFile = await fileHandle.getOriginFile()
          const url = URL.createObjectURL(originalFile)
          setCurrentImageUrl(url)
          console.log(`✅ [SLIDESHOW] Loaded image: ${currentFile.name}`)
        } else {
          console.log(`⚠️ [SLIDESHOW] File not found in OPFS: ${currentFile.localPath}`)
          setCurrentImageUrl(null)
        }
      } catch (error) {
        console.error(`❌ [SLIDESHOW] Failed to load media:`, error)
        setCurrentImageUrl(null)
      } finally {
        setIsLoading(false)
      }
    }

    loadCurrentMedia()
  }, [mediaFiles, currentIndex])

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      if (currentImageUrl) {
        URL.revokeObjectURL(currentImageUrl)
      }
    }
  }, [currentImageUrl])

  return (
    <div className="w-full h-screen bg-black text-white flex flex-col items-center justify-center">
      {/* Header */}
      <div className="absolute top-8 left-8 text-left">
        <h1 className="text-3xl font-bold text-blue-400 mb-2">
          GF Board Slideshow
        </h1>
        <p className="text-lg text-gray-300">
          Standort: <span className="text-green-400 font-semibold">{selectedLocation}</span>
        </p>
        {mediaFiles.length > 0 && (
          <p className="text-sm text-gray-400">
            {currentIndex + 1} / {mediaFiles.length} - {mediaFiles[currentIndex]?.name}
          </p>
        )}
      </div>

      {/* Sync Status */}
      <div className="absolute top-8 right-8 text-right">
        {syncStatus.isSyncing && (
          <div className="bg-blue-900 p-4 rounded-lg">
            <div className="text-blue-300 text-sm mb-2">🔄 Synchronisiere...</div>
            <div className="w-32 bg-gray-700 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${syncStatus.progress}%` }}
              />
            </div>
          </div>
        )}
        
        {syncStatus.error && (
          <div className="bg-red-900 p-4 rounded-lg">
            <div className="text-red-300 text-sm">❌ Fehler: {syncStatus.error}</div>
          </div>
        )}
        
        {syncStatus.lastSync && !syncStatus.isSyncing && (
          <div className="bg-green-900 p-4 rounded-lg">
            <div className="text-green-300 text-sm">
              ✅ Letzte Sync: {syncStatus.lastSync.toLocaleTimeString()}
            </div>
            <div className="text-green-400 text-xs">
              {mediaFiles.length} Medien verfügbar
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex items-center justify-center w-full">
        {mediaFiles.length > 0 ? (
          <div className="text-center">
            {isLoading ? (
              <div className="text-6xl mb-8">⏳</div>
            ) : currentImageUrl ? (
              <div className="max-w-4xl max-h-4xl">
                <img 
                  src={currentImageUrl} 
                  alt={mediaFiles[currentIndex]?.name}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                  style={{ maxHeight: '70vh' }}
                />
              </div>
            ) : (
              <div className="text-6xl mb-8">❌</div>
            )}
            
            <div className="mt-8">
              <h2 className="text-2xl font-bold text-gray-300 mb-4">
                {mediaFiles[currentIndex]?.name || 'Kein Bild'}
              </h2>
              <p className="text-lg text-gray-500">
                {mediaFiles[currentIndex]?.type === 'image' ? 'Bild' : 'Video'} • 
                {mediaFiles[currentIndex]?.size ? ` ${Math.round(mediaFiles[currentIndex].size / 1024)} KB` : ' Größe unbekannt'}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-6xl mb-8">📺</div>
            <h2 className="text-4xl font-bold text-gray-300 mb-4">
              {syncStatus.isSyncing ? 'Synchronisiere...' : 'Slideshow wird hier angezeigt'}
            </h2>
            <p className="text-xl text-gray-500">
              {syncStatus.isSyncing ? 'Lade Medien von Google Drive...' : 'Medien werden später hier geladen'}
            </p>
          </div>
        )}
      </div>

      {/* Navigation Controls */}
      {mediaFiles.length > 1 && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-4">
          <button
            onClick={previousMedia}
            className="bg-gray-800 hover:bg-gray-700 px-6 py-3 rounded-lg text-white font-semibold transition-colors"
          >
            ← Vorheriges
          </button>
          <button
            onClick={nextMedia}
            className="bg-gray-800 hover:bg-gray-700 px-6 py-3 rounded-lg text-white font-semibold transition-colors"
          >
            Nächstes →
          </button>
        </div>
      )}

      {/* Instructions */}
      <div className="absolute bottom-8 left-8 text-left">
        <p className="text-sm text-gray-500">
          Drücke <span className="bg-gray-800 px-2 py-1 rounded text-yellow-400 font-mono">L</span> um zurück zur Übersicht zu gehen
        </p>
        {mediaFiles.length > 1 && (
          <p className="text-sm text-gray-500 mt-1">
            Pfeiltasten oder Buttons zum Navigieren
          </p>
        )}
      </div>

      {/* Keyboard Handler */}
      <div 
        className="w-full h-full absolute inset-0 focus:outline-none"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key.toLowerCase() === 'l') {
            clearSelectedLocation()
          } else if (e.key === 'ArrowLeft') {
            previousMedia()
          } else if (e.key === 'ArrowRight') {
            nextMedia()
          }
        }}
        autoFocus
      />
    </div>
  )
}

export default SlideshowView