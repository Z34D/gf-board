import React from 'react'
import { useAppStore } from '../stores/appStore'

const LocationSelectionView: React.FC = () => {
  const { selectedLocation, availableLocations, setSelectedLocation } = useAppStore()

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
      <div className="grid grid-cols-2 gap-6 max-w-2xl">
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

      {/* Status Display */}
      <div className="mt-12 text-center">
        <div className="text-lg text-gray-400 mb-2">
          Aktueller Standort:
        </div>
        <div className="text-3xl font-bold text-green-400">
          {selectedLocation || 'Nicht ausgewählt'}
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-16 text-center">
        <div className="text-sm text-gray-500">
          Wähle einen Standort um zur Slideshow zu wechseln
        </div>
      </div>
    </div>
  )
}

export default LocationSelectionView
