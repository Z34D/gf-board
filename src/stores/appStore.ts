import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { file, dir, write } from 'opfs-tools'

// Helper function to get interval in milliseconds
function getIntervalMs(interval: SchedulerConfig['interval']): number {
  switch (interval) {
    case '5min':
      return 5 * 60 * 1000
    case '4hours':
      return 4 * 60 * 60 * 1000
    case '8hours':
      return 8 * 60 * 60 * 1000
    case 'daily4am':
      // For daily4am, we'll use a 1-hour check interval and calculate the exact time
      return 60 * 60 * 1000
    default:
      return 4 * 60 * 60 * 1000
  }
}

export interface MediaFile {
  id: string
  name: string
  type: 'image' | 'video'
  url: string
  size: number
  localPath?: string
  lastModified?: string
  localLastModified?: Date
  videoDuration?: number  // Duration in seconds for videos
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

interface SchedulerConfig {
  enabled: boolean
  interval: '5min' | '4hours' | 'daily4am' | '8hours'
  nextSync: Date | null
  intervalId?: NodeJS.Timeout
}

interface AppState {
  // App state
  isInitialized: boolean
  
  // Location state
  selectedLocation: string | null
  availableLocations: string[]
  
  // Media state
  mediaFiles: MediaFile[]
  currentIndex: number
  isPlaying: boolean
  
  // Sync state
  syncStatus: SyncStatus
  
  // Scheduler state
  schedulerConfig: SchedulerConfig
  
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
  downloadFileFromDrive: (fileId: string, fileName: string) => Promise<void>
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
  
  // Scheduler actions
  setSchedulerConfig: (config: Partial<SchedulerConfig>) => void
  startScheduler: () => void
  stopScheduler: () => void
  calculateNextSync: (interval: SchedulerConfig['interval']) => Date
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      isInitialized: false,
      selectedLocation: null,
      availableLocations: ['Flieden', 'Neuhof', 'Gersfeld', 'Schlitz', 'Eichenzell'], // Hardcoded for now
      mediaFiles: [],
      currentIndex: 0,
      isPlaying: false,
      syncStatus: {
        isSyncing: false,
        lastSync: null,
        error: null,
        progress: 0
      },
      schedulerConfig: {
        enabled: true,
        interval: '4hours',
        nextSync: null
      },
      googleDriveFolderId: 'REDACTED_FOLDER_ID',
      
      // Actions
      setSelectedLocation: (location) => {
        const { selectedLocation, clearAllOPFSFiles, schedulerConfig } = get()
        
        // If changing location, clear OPFS first
        if (selectedLocation && selectedLocation !== location) {
          console.log(`🔄 Location changed: ${selectedLocation} → ${location}`)
          clearAllOPFSFiles()
        }
        
        set({ selectedLocation: location })
        
        // Auto-sync when location is selected
        if (location) {
          get().syncLocationMedia(location)
          
          // Restart scheduler if enabled
          if (schedulerConfig.enabled) {
            get().startScheduler()
          }
        } else {
          get().stopScheduler()
        }
      },
      setAvailableLocations: (locations) => set({ availableLocations: locations }),
      setMediaFiles: (files) => set({ mediaFiles: files }),
      setCurrentIndex: (index) => set({ currentIndex: index }),
      setIsPlaying: (playing) => set({ isPlaying: playing }),
      
      nextMedia: () => {
        const { mediaFiles, currentIndex } = get()
        const nextIndex = (currentIndex + 1) % mediaFiles.length
        set({ currentIndex: nextIndex })
      },
      
      previousMedia: () => {
        const { mediaFiles, currentIndex } = get()
        const prevIndex = currentIndex === 0 ? mediaFiles.length - 1 : currentIndex - 1
        set({ currentIndex: prevIndex })
      },
      
      clearSelectedLocation: () => set({ selectedLocation: null }),
      
      // Google Drive & OPFS actions
      syncLocationMedia: async (location: string) => {
        console.log(`🔄 Syncing: ${location}`)
        
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
          
          // 1. List all folders in the main directory
          const folders = await get().listDriveFolder(googleDriveFolderId)
          
          // Find shared folder and location folder
          const sharedFolder = folders.find(f => f.name.toLowerCase() === 'shared')
          const locationFolder = folders.find(f => f.name.toLowerCase() === location.toLowerCase())
          
          let allDriveFiles: MediaFile[] = []
          
          // 2. Get all files from Google Drive
          if (sharedFolder) {
            const sharedFiles = await get().listDriveFolder(sharedFolder.id)
            
            for (const driveFile of sharedFiles) {
              if (driveFile.mimeType.startsWith('image/') || driveFile.mimeType.startsWith('video/')) {
                const mediaFile: MediaFile = {
                  id: driveFile.id,
                  name: driveFile.name,
                  type: driveFile.mimeType.startsWith('image/') ? 'image' : 'video',
                  url: `https://drive.google.com/uc?id=${driveFile.id}`,
                  size: driveFile.size || 0,
                  localPath: driveFile.name,
                  lastModified: driveFile.modifiedTime
                }
                allDriveFiles.push(mediaFile)
              }
            }
          }
          
          if (locationFolder) {
            const locationFiles = await get().listDriveFolder(locationFolder.id)
            
            for (const driveFile of locationFiles) {
              if (driveFile.mimeType.startsWith('image/') || driveFile.mimeType.startsWith('video/')) {
                const mediaFile: MediaFile = {
                  id: driveFile.id,
                  name: driveFile.name,
                  type: driveFile.mimeType.startsWith('image/') ? 'image' : 'video',
                  url: `https://drive.google.com/uc?id=${driveFile.id}`,
                  size: driveFile.size || 0,
                  localPath: driveFile.name,
                  lastModified: driveFile.modifiedTime
                }
                allDriveFiles.push(mediaFile)
              }
            }
          }
          
          // 3. Get all local files from OPFS
          const localFiles = await get().getLocalFiles()
          
          // 4. Compare and determine sync actions
          const syncActions = await get().compareFiles(allDriveFiles, localFiles)
          
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
          
          // Build detailed sync summary
          const parts = []
          if (syncActions.toDownload.length > 0) parts.push(`⬇️${syncActions.toDownload.length} new`)
          if (syncActions.toUpdate.length > 0) parts.push(`🔄${syncActions.toUpdate.length} updated`)
          if (syncActions.toDelete.length > 0) parts.push(`🗑️${syncActions.toDelete.length} deleted`)
          if (syncActions.unchanged.length > 0) parts.push(`✓${syncActions.unchanged.length} unchanged`)
          
          console.log(`✅ Sync complete: ${parts.join(', ')} | Total: ${allDriveFiles.length} files`)
          
        } catch (error) {
          console.error(`❌ Sync failed:`, error)
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
        try {
          const url = `/api/drive/files?q='${folderId}'+in+parents`
          const response = await fetch(url)
          
          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`)
          }
          
          const data = await response.json()
          return data.files || []
          
        } catch (error) {
          console.error(`❌ Drive API error:`, error)
          throw error
        }
      },
      
      downloadFileFromDrive: async (fileId: string, fileName: string) => {
        try {
          const downloadUrl = `/api/drive/files/${fileId}?alt=media`
          const response = await fetch(downloadUrl)
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }
          
          const blob = await response.blob()
          const file = new File([blob], fileName, { type: blob.type })
          
          await get().saveToOPFS(file, fileName)
          
        } catch (error) {
          console.error(`❌ Download failed: ${fileName}`, error)
          throw error
        }
      },
      
      saveToOPFS: async (fileToSave: File, path: string) => {
        try {
          await write(path, fileToSave.stream())
        } catch (error) {
          console.error(`❌ Save failed: ${path}`, error)
          throw error
        }
      },
      
      loadFromOPFS: async (path: string) => {
        try {
          const fileHandle = file(path)
          const exists = await fileHandle.exists()
          
          if (!exists) return null
          
          const originalFile = await fileHandle.getOriginFile()
          return originalFile || null
        } catch (error) {
          console.error(`❌ Load failed: ${path}`, error)
          return null
        }
      },
      
      // Intelligent sync functions
      getLocalFiles: async () => {
        try {
          const localFiles: MediaFile[] = []
          const { mediaFiles } = get()
          
          for (const mediaFile of mediaFiles) {
            if (mediaFile.localPath) {
              try {
                const fileHandle = file(`/${mediaFile.localPath}`)
                const exists = await fileHandle.exists()
                
                if (exists) {
                  const originalFile = await fileHandle.getOriginFile()
                  
                  if (originalFile) {
                    const localFile: MediaFile = {
                      ...mediaFile,
                      localLastModified: new Date(originalFile.lastModified)
                    }
                    localFiles.push(localFile)
                  }
                }
              } catch (error) {
                console.error(`❌ Check failed: ${mediaFile.localPath}`, error)
              }
            }
          }
          
          return localFiles
        } catch (error) {
          console.error(`❌ Get local files failed:`, error)
          return []
        }
      },
      
      compareFiles: async (driveFiles: MediaFile[], localFiles: MediaFile[]) => {
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
            actions.toDownload.push(driveFile)
          } else {
            const driveModified = new Date(driveFile.lastModified || 0)
            const localModified = localFile.localLastModified || new Date(0)
            
            if (driveModified > localModified) {
              actions.toUpdate.push(driveFile)
            } else {
              actions.unchanged.push(driveFile)
            }
          }
        }
        
        // Check local files for deletion
        for (const localFile of localFiles) {
          const driveFile = driveMap.get(localFile.name)
          
          if (!driveFile) {
            actions.toDelete.push(localFile)
          }
        }
        
        // Only log if there are actions to perform
        const hasActions = actions.toDownload.length + actions.toUpdate.length + actions.toDelete.length > 0
        if (hasActions) {
          console.log(`📊 Sync: ⬇️${actions.toDownload.length} 🔄${actions.toUpdate.length} 🗑️${actions.toDelete.length}`)
        }
        
        return actions
      },
      
      executeSyncActions: async (actions: SyncActions) => {
        // Download new files
        for (const mediaFile of actions.toDownload) {
          await get().downloadFileFromDrive(mediaFile.id, mediaFile.name)
        }
        
        // Update existing files
        for (const mediaFile of actions.toUpdate) {
          await get().downloadFileFromDrive(mediaFile.id, mediaFile.name)
        }
        
        // Delete removed files
        for (const mediaFile of actions.toDelete) {
          try {
            const fileHandle = file(mediaFile.localPath!)
            await fileHandle.remove()
          } catch (error) {
            console.error(`❌ Delete failed: ${mediaFile.name}`, error)
          }
        }
      },
      
      // App initialization
      initializeApp: async () => {
        const { isInitialized } = get()
        if (isInitialized) return
        
        // Set initialized flag IMMEDIATELY to prevent race conditions
        set({ isInitialized: true })
        
        const { selectedLocation, schedulerConfig } = get()
        
        if (selectedLocation) {
          console.log(`🚀 Init: ${selectedLocation}`)
          
          // Auto-sync the saved location
          await get().syncLocationMedia(selectedLocation)
          
          // Start scheduler if enabled
          if (schedulerConfig.enabled) {
            get().startScheduler()
          }
        }
      },
      
      // OPFS management
      clearAllOPFSFiles: async () => {
        try {
          const rootDir = dir('/')
          const children = await rootDir.children()
          
          for (const child of children) {
            if (child.kind === 'file') {
              const fileHandle = file(`/${child.name}`)
              await fileHandle.remove()
            } else if (child.kind === 'dir') {
              const dirHandle = dir(`/${child.name}`)
              await dirHandle.remove()
            }
          }
          
          console.log(`🗑️ Cleared ${children.length} files`)
        } catch (error) {
          console.error(`❌ Clear OPFS failed:`, error)
        }
      },

      // Scheduler actions
      setSchedulerConfig: (config) => {
        const currentConfig = get().schedulerConfig
        const newConfig = { ...currentConfig, ...config }
        
        // Calculate next sync time if interval changed
        if (config.interval && config.interval !== currentConfig.interval) {
          newConfig.nextSync = get().calculateNextSync(config.interval)
        }
        
        set({ schedulerConfig: newConfig })
        
        // Restart scheduler if enabled
        if (newConfig.enabled) {
          get().startScheduler()
        } else {
          get().stopScheduler()
        }
      },

      startScheduler: () => {
        const { schedulerConfig, selectedLocation } = get()
        
        if (!schedulerConfig.enabled || !selectedLocation) return
        
        // Clear existing interval
        get().stopScheduler()
        
        // Set up interval based on configuration
        const intervalMs = getIntervalMs(schedulerConfig.interval)
        
        const intervalId = setInterval(async () => {
          const { schedulerConfig, selectedLocation } = get()
          
          if (!schedulerConfig.enabled || !selectedLocation) {
            get().stopScheduler()
            return
          }
          
          await get().syncLocationMedia(selectedLocation)
          
          // Update next sync time
          const nextSync = get().calculateNextSync(schedulerConfig.interval)
          set(state => ({
            schedulerConfig: {
              ...state.schedulerConfig,
              nextSync
            }
          }))
          
        }, intervalMs)
        
        // Store interval ID for cleanup
        set(state => ({
          schedulerConfig: {
            ...state.schedulerConfig,
            intervalId: intervalId as any
          }
        }))
        
        console.log(`⏰ Scheduler: ${schedulerConfig.interval}`)
      },

      stopScheduler: () => {
        const { schedulerConfig } = get()
        
        if (schedulerConfig.intervalId) {
          clearInterval(schedulerConfig.intervalId as any)
          set(state => ({
            schedulerConfig: {
              ...state.schedulerConfig,
              intervalId: undefined
            }
          }))
        }
      },

      calculateNextSync: (interval) => {
        const now = new Date()
        
        switch (interval) {
          case '5min':
            return new Date(now.getTime() + 5 * 60 * 1000)
          case '4hours':
            return new Date(now.getTime() + 4 * 60 * 60 * 1000)
          case '8hours':
            return new Date(now.getTime() + 8 * 60 * 60 * 1000)
          case 'daily4am':
            const tomorrow = new Date(now)
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(4, 0, 0, 0)
            return tomorrow
          default:
            return new Date(now.getTime() + 4 * 60 * 60 * 1000)
        }
      },
    }),
    {
      name: 'gf-board-storage',
      partialize: (state) => ({ 
        selectedLocation: state.selectedLocation,
        mediaFiles: state.mediaFiles,
        schedulerConfig: {
          enabled: state.schedulerConfig.enabled,
          interval: state.schedulerConfig.interval,
          nextSync: state.schedulerConfig.nextSync
        }
      }),
    }
  )
)
