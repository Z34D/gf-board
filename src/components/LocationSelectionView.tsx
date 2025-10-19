import React from 'react'
import { useAppStore } from '../stores/appStore'

const LocationSelectionView: React.FC = () => {
  const { 
    selectedLocation, 
    availableLocations, 
    setSelectedLocation,
    schedulerConfig,
    setSchedulerConfig
  } = useAppStore()

  const schedulerOptions = [
    { value: '5min', label: 'Alle 5 Minuten' },
    { value: '4hours', label: 'Alle 4 Stunden' },
    { value: '8hours', label: 'Alle 8 Stunden' },
    { value: 'daily4am', label: 'Täglich um 4:00 Uhr' }
  ]

  return (
    <div className="w-full h-screen bg-black text-white flex flex-col items-center justify-center">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-6xl font-bold text-blue-400 mb-4">
          GF Board Kiosk
        </h1>
        <p className="text-xl text-gray-300">
          Wähle deinen Standort aus
        </p>
      </div>

      {/* Location Selection */}
      <div className="grid grid-cols-2 gap-6 max-w-2xl mb-8">
        {availableLocations.map((location) => (
          <button
            key={location}
            onClick={() => setSelectedLocation(location)}
            className={`
              p-8 rounded-xl text-2xl font-semibold transition-all duration-300
              ${selectedLocation === location 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/50 scale-105' 
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white hover:scale-102'
              }
            `}
          >
            {location}
          </button>
        ))}
      </div>

      {/* Scheduler Configuration */}
      <div className="bg-gray-900 p-6 rounded-xl max-w-md w-full">
        <h3 className="text-2xl font-bold text-blue-400 mb-4 text-center">
          ⏰ Automatische Synchronisation
        </h3>
        
        {/* Interval Selection */}
        <div className="mb-4">
          <label className="block text-lg text-gray-300 mb-2">
            Sync-Intervall:
          </label>
          <select
            value={schedulerConfig.interval}
            onChange={(e) => setSchedulerConfig({ 
              interval: e.target.value as typeof schedulerConfig.interval,
              enabled: true
            })}
            className="w-full p-3 bg-gray-800 text-white border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {schedulerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Next Sync Display */}
        {schedulerConfig.nextSync && (
          <div className="text-center">
            <div className="text-sm text-gray-400 mb-1">
              Nächste Synchronisation:
            </div>
            <div className="text-lg font-semibold text-green-400">
              {new Date(schedulerConfig.nextSync).toLocaleString('de-DE')}
            </div>
          </div>
        )}
      </div>

      {/* Status Display */}
      <div className="mt-8 text-center">
        <div className="text-lg text-gray-400 mb-2">
          Aktueller Standort:
        </div>
        <div className="text-3xl font-bold text-green-400">
          {selectedLocation || 'Nicht ausgewählt'}
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-8 text-center">
        <div className="text-sm text-gray-500">
          Wähle einen Standort aus, um die Slideshow zu starten
        </div>
      </div>
    </div>
  )
}

export default LocationSelectionView
