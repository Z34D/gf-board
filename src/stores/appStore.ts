import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { file, dir, write } from 'opfs-tools'

interface MediaFile {
  id: string
  name: string
  type: 'image' | 'video'
  url: string
  size: number
  localPath?: string
  lastModified?: string
  localLastModified?: Date
}

interface SyncActions {
  toDownload: MediaFile[]
  toUpdate: MediaFile[]
  toDelete: MediaFile[]
  unchanged: MediaFile[]
}

interface SyncStatus {
  isSyncing: boolean
  lastSync: Date | null
  error: string | null
  progress: number
}

interface AppState {
  // Location state
  selectedLocation: string | null
  availableLocations: string[]
  
  // Media state
  mediaFiles: MediaFile[]
  currentIndex: number
  isPlaying: boolean
  
  // Sync state
  syncStatus: SyncStatus
  
  // Google Drive config
  googleDriveFolderId: string
  
  // Actions
  setSelectedLocation: (location: string) => void
  setAvailableLocations: (locations: string[]) => void
  setMediaFiles: (files: MediaFile[]) => void
  setCurrentIndex: (index: number) => void
  setIsPlaying: (playing: boolean) => void
  nextMedia: () => void
  previousMedia: () => void
  clearSelectedLocation: () => void
  
  // Google Drive & OPFS actions
  syncLocationMedia: (location: string) => Promise<void>
  downloadFileFromDrive: (fileId: string, fileName: string, folderPath: string) => Promise<void>
  listDriveFolder: (folderId: string) => Promise<any[]>
  saveToOPFS: (file: File, path: string) => Promise<void>
  loadFromOPFS: (path: string) => Promise<File | null>
  
  // Intelligent sync functions
  getLocalFiles: () => Promise<MediaFile[]>
  compareFiles: (driveFiles: MediaFile[], localFiles: MediaFile[]) => Promise<SyncActions>
  executeSyncActions: (actions: SyncActions) => Promise<void>
  
  // App initialization
  initializeApp: () => Promise<void>
  
  // OPFS management
  clearAllOPFSFiles: () => Promise<void>
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      selectedLocation: null,
      availableLocations: ['Flieden', 'Fulda', 'Kassel', 'Marburg'], // Hardcoded for now
      mediaFiles: [],
      currentIndex: 0,
      isPlaying: false,
      syncStatus: {
        isSyncing: false,
        lastSync: null,
        error: null,
        progress: 0
      },
      googleDriveFolderId: 'REDACTED_FOLDER_ID',
      
      // Actions
      setSelectedLocation: (location) => {
        console.log(`🏢 [STORE] Setting selected location to: ${location}`)
        
        const { selectedLocation, clearAllOPFSFiles } = get()
        
        // If changing location, clear OPFS first
        if (selectedLocation && selectedLocation !== location) {
          console.log(`🔄 [STORE] Location changed from ${selectedLocation} to ${location}, clearing OPFS`)
          clearAllOPFSFiles()
        }
        
        set({ selectedLocation: location })
        
        // Auto-sync when location is selected
        if (location) {
          console.log(`🔄 [STORE] Auto-syncing media for location: ${location}`)
          get().syncLocationMedia(location)
        }
      },
      setAvailableLocations: (locations) => set({ availableLocations: locations }),
      setMediaFiles: (files) => {
        console.log(`📁 [STORE] Setting media files: ${files.length} files`)
        set({ mediaFiles: files })
      },
      setCurrentIndex: (index) => set({ currentIndex: index }),
      setIsPlaying: (playing) => set({ isPlaying: playing }),
      
      nextMedia: () => {
        const { mediaFiles, currentIndex } = get()
        const nextIndex = (currentIndex + 1) % mediaFiles.length
        console.log(`⏭️ [STORE] Next media: ${currentIndex} → ${nextIndex}`)
        set({ currentIndex: nextIndex })
      },
      
      previousMedia: () => {
        const { mediaFiles, currentIndex } = get()
        const prevIndex = currentIndex === 0 ? mediaFiles.length - 1 : currentIndex - 1
        console.log(`⏮️ [STORE] Previous media: ${currentIndex} → ${prevIndex}`)
        set({ currentIndex: prevIndex })
      },
      
      clearSelectedLocation: () => {
        console.log(`🏢 [STORE] Clearing selected location`)
        set({ selectedLocation: null })
      },
      
      // Google Drive & OPFS actions
      syncLocationMedia: async (location: string) => {
        console.log(`🔄 [SYNC] Starting intelligent sync for location: ${location}`)
        
        set(state => ({
          syncStatus: {
            ...state.syncStatus,
            isSyncing: true,
            error: null,
            progress: 0
          }
        }))
        
        try {
          const { googleDriveFolderId } = get()
          console.log(`📁 [SYNC] Using Google Drive folder ID: ${googleDriveFolderId}`)
          
          // 1. List all folders in the main directory
          const folders = await get().listDriveFolder(googleDriveFolderId)
          console.log(`📂 [SYNC] Found ${folders.length} folders in main directory:`, folders.map(f => f.name))
          
          // Find shared folder and location folder
          const sharedFolder = folders.find(f => f.name.toLowerCase() === 'shared')
          const locationFolder = folders.find(f => f.name.toLowerCase() === location.toLowerCase())
          
          console.log(`🔍 [SYNC] Shared folder found:`, sharedFolder ? sharedFolder.name : 'NOT FOUND')
          console.log(`🔍 [SYNC] Location folder found:`, locationFolder ? locationFolder.name : 'NOT FOUND')
          
          let allDriveFiles: MediaFile[] = []
          
          // 2. Get all files from Google Drive
          if (sharedFolder) {
            console.log(`📁 [SYNC] Getting shared folder files`)
            const sharedFiles = await get().listDriveFolder(sharedFolder.id)
            console.log(`📄 [SYNC] Found ${sharedFiles.length} files in shared folder`)
            
            for (const driveFile of sharedFiles) {
              if (driveFile.mimeType.startsWith('image/') || driveFile.mimeType.startsWith('video/')) {
                const mediaFile: MediaFile = {
                  id: driveFile.id,
                  name: driveFile.name,
                  type: driveFile.mimeType.startsWith('image/') ? 'image' : 'video',
                  url: `https://drive.google.com/uc?id=${driveFile.id}`,
                  size: driveFile.size || 0,
                  localPath: driveFile.name, // Direct in root
                  lastModified: driveFile.modifiedTime
                }
                allDriveFiles.push(mediaFile)
              }
            }
          }
          
          if (locationFolder) {
            console.log(`📁 [SYNC] Getting location folder files`)
            const locationFiles = await get().listDriveFolder(locationFolder.id)
            console.log(`📄 [SYNC] Found ${locationFiles.length} files in location folder`)
            
            for (const driveFile of locationFiles) {
              if (driveFile.mimeType.startsWith('image/') || driveFile.mimeType.startsWith('video/')) {
                const mediaFile: MediaFile = {
                  id: driveFile.id,
                  name: driveFile.name,
                  type: driveFile.mimeType.startsWith('image/') ? 'image' : 'video',
                  url: `https://drive.google.com/uc?id=${driveFile.id}`,
                  size: driveFile.size || 0,
                  localPath: driveFile.name, // Direct in root
                  lastModified: driveFile.modifiedTime
                }
                allDriveFiles.push(mediaFile)
              }
            }
          }
          
          console.log(`📊 [SYNC] Total files on Google Drive: ${allDriveFiles.length}`)
          
          // 3. Get all local files from OPFS
          const localFiles = await get().getLocalFiles()
          console.log(`💾 [SYNC] Total files in OPFS: ${localFiles.length}`)
          
          // 4. Compare and determine sync actions
          const syncActions = await get().compareFiles(allDriveFiles, localFiles)
          console.log(`🔄 [SYNC] Sync actions:`, syncActions)
          
          // 5. Execute sync actions
          await get().executeSyncActions(syncActions)
          
          // 6. Update media files list
          set(state => ({
            mediaFiles: allDriveFiles,
            syncStatus: {
              ...state.syncStatus,
              isSyncing: false,
              lastSync: new Date(),
              progress: 100
            }
          }))
          
          console.log(`✅ [SYNC] Intelligent sync completed!`)
          
        } catch (error) {
          console.error(`❌ [SYNC] Sync failed:`, error)
          set(state => ({
            syncStatus: {
              ...state.syncStatus,
              isSyncing: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          }))
        }
      },
      
      listDriveFolder: async (folderId: string) => {
        console.log(`📂 [DRIVE] Listing folder via proxy: ${folderId}`)
        
        try {
          const url = `/api/drive/files?q='${folderId}'+in+parents`
          
          console.log(`📂 [DRIVE] Proxy URL: ${url}`)
          
          const response = await fetch(url)
          
          console.log(`📂 [DRIVE] Response status: ${response.status}`)
          console.log(`📂 [DRIVE] Response headers:`, Object.fromEntries(response.headers.entries()))
          
          if (!response.ok) {
            const errorText = await response.text()
            console.error(`❌ [DRIVE] Error response:`, errorText)
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`)
          }
          
          // Handle gzip compression properly
          const data = await response.json()
          console.log(`📂 [DRIVE] Proxy Response:`, data)
          console.log(`📂 [DRIVE] Found ${data.files?.length || 0} items in folder`)
          
          return data.files || []
          
        } catch (error) {
          console.error(`❌ [DRIVE] Failed to list folder:`, error)
          throw error
        }
      },
      
      downloadFileFromDrive: async (fileId: string, fileName: string, folderPath: string) => {
        console.log(`⬇️ [DRIVE] Downloading file via proxy: ${fileName} (ID: ${fileId})`)
        
        try {
          const downloadUrl = `/api/drive/files/${fileId}?alt=media`
          
          console.log(`⬇️ [DRIVE] Proxy download URL: ${downloadUrl}`)
          
          const response = await fetch(downloadUrl)
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }
          
          const blob = await response.blob()
          const file = new File([blob], fileName, { type: blob.type })
          
          console.log(`💾 [OPFS] Saving file to OPFS: ${fileName} (${file.size} bytes)`)
          await get().saveToOPFS(file, fileName) // Save directly in root
          
        } catch (error) {
          console.error(`❌ [DRIVE] Failed to download file:`, error)
          throw error
        }
      },
      
      saveToOPFS: async (fileToSave: File, path: string) => {
        console.log(`💾 [OPFS] Saving file: ${path} (${fileToSave.size} bytes)`)
        
        try {
          // Save directly in root, no directory creation needed
          await write(path, fileToSave.stream())
          console.log(`✅ [OPFS] File saved successfully: ${path}`)
        } catch (error) {
          console.error(`❌ [OPFS] Failed to save file:`, error)
          throw error
        }
      },
      
      loadFromOPFS: async (path: string) => {
        console.log(`📖 [OPFS] Loading file: ${path}`)
        
        try {
          const fileHandle = file(path)
          const exists = await fileHandle.exists()
          
          if (!exists) {
            console.log(`⚠️ [OPFS] File does not exist: ${path}`)
            return null
          }
          
          // Get the original file
          const originalFile = await fileHandle.getOriginFile()
          console.log(`✅ [OPFS] File loaded successfully: ${path}`)
          return originalFile
        } catch (error) {
          console.error(`❌ [OPFS] Failed to load file:`, error)
          return null
        }
      },
      
      // Intelligent sync functions
      getLocalFiles: async () => {
        console.log(`💾 [SYNC] Getting all local files from OPFS`)
        
        try {
          const localFiles: MediaFile[] = []
          
          // Check existing mediaFiles for local files
          const { mediaFiles } = get()
          console.log(`📊 [SYNC] Checking ${mediaFiles.length} existing media files for local copies`)
          
          for (const mediaFile of mediaFiles) {
            if (mediaFile.localPath) {
              try {
                const fileHandle = file(`/${mediaFile.localPath}`)
                const exists = await fileHandle.exists()
                
                if (exists) {
                  const originalFile = await fileHandle.getOriginFile()
                  
                  const localFile: MediaFile = {
                    ...mediaFile,
                    localLastModified: new Date(originalFile.lastModified)
                  }
                  
                  localFiles.push(localFile)
                  console.log(`📄 [SYNC] Found local file: ${mediaFile.localPath} (${originalFile.size} bytes, modified: ${originalFile.lastModified})`)
                } else {
                  console.log(`⚠️ [SYNC] Local file does not exist: ${mediaFile.localPath}`)
                }
              } catch (error) {
                console.error(`❌ [SYNC] Error checking local file ${mediaFile.localPath}:`, error)
              }
            }
          }
          
          console.log(`💾 [SYNC] Found ${localFiles.length} local files`)
          return localFiles
        } catch (error) {
          console.error(`❌ [SYNC] Failed to get local files:`, error)
          return []
        }
      },
      
      compareFiles: async (driveFiles: MediaFile[], localFiles: MediaFile[]) => {
        console.log(`🔄 [SYNC] Comparing ${driveFiles.length} drive files with ${localFiles.length} local files`)
        
        const actions: SyncActions = {
          toDownload: [],
          toUpdate: [],
          toDelete: [],
          unchanged: []
        }
        
        // Create maps for easier lookup
        const driveMap = new Map(driveFiles.map(f => [f.name, f]))
        const localMap = new Map(localFiles.map(f => [f.name, f]))
        
        // Check drive files
        for (const driveFile of driveFiles) {
          const localFile = localMap.get(driveFile.name)
          
          if (!localFile) {
            // File doesn't exist locally - download
            actions.toDownload.push(driveFile)
            console.log(`⬇️ [SYNC] To download: ${driveFile.name}`)
          } else {
            // File exists - check if it needs updating
            const driveModified = new Date(driveFile.lastModified || 0)
            const localModified = localFile.localLastModified || new Date(0)
            
            if (driveModified > localModified) {
              // Drive file is newer - update
              actions.toUpdate.push(driveFile)
              console.log(`🔄 [SYNC] To update: ${driveFile.name} (drive: ${driveModified.toISOString()}, local: ${localModified.toISOString()})`)
            } else {
              // File is up to date
              actions.unchanged.push(driveFile)
              console.log(`✅ [SYNC] Unchanged: ${driveFile.name}`)
            }
          }
        }
        
        // Check local files for deletion
        for (const localFile of localFiles) {
          const driveFile = driveMap.get(localFile.name)
          
          if (!driveFile) {
            // File exists locally but not on drive - delete
            actions.toDelete.push(localFile)
            console.log(`🗑️ [SYNC] To delete: ${localFile.name}`)
          }
        }
        
        console.log(`📊 [SYNC] Sync actions summary:`)
        console.log(`  - To download: ${actions.toDownload.length}`)
        console.log(`  - To update: ${actions.toUpdate.length}`)
        console.log(`  - To delete: ${actions.toDelete.length}`)
        console.log(`  - Unchanged: ${actions.unchanged.length}`)
        
        return actions
      },
      
      executeSyncActions: async (actions: SyncActions) => {
        console.log(`🚀 [SYNC] Executing sync actions`)
        
        // Download new files
        for (const file of actions.toDownload) {
          console.log(`⬇️ [SYNC] Downloading new file: ${file.name}`)
          await get().downloadFileFromDrive(file.id, file.name, '')
        }
        
        // Update existing files
        for (const file of actions.toUpdate) {
          console.log(`🔄 [SYNC] Updating file: ${file.name}`)
          await get().downloadFileFromDrive(file.id, file.name, '')
        }
        
        // Delete removed files
        for (const file of actions.toDelete) {
          console.log(`🗑️ [SYNC] Deleting file: ${file.name}`)
          try {
            const fileHandle = file(file.localPath!)
            await fileHandle.remove()
            console.log(`✅ [SYNC] Deleted: ${file.name}`)
          } catch (error) {
            console.error(`❌ [SYNC] Failed to delete ${file.name}:`, error)
          }
        }
        
        console.log(`✅ [SYNC] All sync actions completed`)
      },
      
      // App initialization
      initializeApp: async () => {
        console.log(`🚀 [APP] Initializing application`)
        
        const { selectedLocation } = get()
        
        if (selectedLocation) {
          console.log(`🏢 [APP] Found saved location: ${selectedLocation}`)
          console.log(`🔄 [APP] Auto-syncing media for saved location`)
          
          // Auto-sync the saved location
          await get().syncLocationMedia(selectedLocation)
        } else {
          console.log(`🏢 [APP] No saved location found`)
        }
        
        console.log(`✅ [APP] Application initialization complete`)
      },
      
      // OPFS management
      clearAllOPFSFiles: async () => {
        console.log(`🗑️ [OPFS] Clearing all files from OPFS`)
        
        try {
          const rootDir = dir('/')
          const children = await rootDir.children()
          
          console.log(`📁 [OPFS] Found ${children.length} items in root directory`)
          
          for (const child of children) {
            if (child.kind === 'file') {
              console.log(`🗑️ [OPFS] Deleting file: ${child.name}`)
              const fileHandle = file(`/${child.name}`)
              await fileHandle.remove()
            } else if (child.kind === 'directory') {
              console.log(`🗑️ [OPFS] Deleting directory: ${child.name}`)
              const dirHandle = dir(`/${child.name}`)
              await dirHandle.remove()
            }
          }
          
          console.log(`✅ [OPFS] All files cleared from OPFS`)
        } catch (error) {
          console.error(`❌ [OPFS] Failed to clear files:`, error)
        }
      },
    }),
    {
      name: 'gf-board-storage',
      partialize: (state) => ({ 
        selectedLocation: state.selectedLocation,
        mediaFiles: state.mediaFiles 
      }),
    }
  )
)
