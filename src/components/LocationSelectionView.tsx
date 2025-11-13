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
    <div className="w-full h-screen bg-black text-white flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="w-full h-full" style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px'
        }} />
      </div>

      {/* Radial/linear gradient glow behind header */}
      <div className="pointer-events-none absolute inset-0" style={{
        backgroundImage: `radial-gradient(1200px 500px at 50% 10%, rgba(255,255,255,0.15), rgba(255,255,255,0) 60%), radial-gradient(900px 300px at 50% 8%, rgba(239,68,68,0.18), rgba(239,68,68,0) 65%)`
      }} />

      {/* Header */}
      <div className="text-center mb-10 relative z-10">
        <h1 className="text-6xl sm:text-7xl font-extrabold tracking-tight mb-0">
          <span className="text-white">GF </span>
          <span className="text-red-500">Board</span>
        </h1>
        <p className="text-base sm:text-lg text-gray-300 mt-4">
          Wähle deinen Standort aus
        </p>
      </div>

      {/* Shared width container so grid and card are exactly aligned */}
      <div className="w-full max-w-3xl mx-auto px-6 relative z-10">
        {/* Location Selection Grid */}
        <div className="grid grid-cols-3 gap-5 mb-8">
          {availableLocations.map((location) => (
            <button
              key={location}
              onClick={() => setSelectedLocation(location).catch(console.error)}
              className={`
                px-6 py-6 sm:px-7 sm:py-7 rounded-xl text-xl sm:text-2xl font-semibold transition-all duration-300 flex flex-col items-center
                ${selectedLocation === location 
                  ? 'bg-gradient-to-b from-blue-600 to-blue-700 text-white shadow-xl shadow-blue-600/40 scale-105 ring-1 ring-white/10' 
                  : 'bg-gradient-to-b from-neutral-900/95 to-neutral-800/80 text-gray-200 hover:from-neutral-900 hover:to-neutral-800 hover:text-white hover:scale-[1.02] ring-1 ring-white/10 shadow-[0_10px_30px_rgba(0,0,0,.35)]'
                }
              `}
            >
              {/* Location Pin Icon */}
              <svg aria-hidden="true" viewBox="0 0 24 24" className="w-5 h-5 sm:w-6 sm:h-6 mb-2 text-gray-400">
                <path fill="currentColor" d="M12 2C8.686 2 6 4.686 6 8c0 4.5 6 12 6 12s6-7.5 6-12c0-3.314-2.686-6-6-6zm0 8.5A2.5 2.5 0 1 1 12 5.5a2.5 2.5 0 0 1 0 5z"/>
              </svg>
              {location}
            </button>
          ))}
        </div>

        {/* Scheduler Configuration Card */}
        <div className="bg-gradient-to-b from-neutral-900/95 to-neutral-900/70 border border-white/10 p-5 rounded-lg w-full mb-6 shadow-[0_12px_40px_rgba(0,0,0,.4)]">
        {/* Header with Clock Icon */}
        <div className="flex items-start gap-2.5 mb-1">
          <div className="relative mt-1">
            <div className="h-6 w-6 rounded-full bg-red-600 shadow-[0_0_16px_rgba(239,68,68,.6)]" />
            <div className="absolute inset-0 m-auto h-2 w-2 rounded-full bg-white" style={{top:'50%',left:'50%',transform:'translate(-50%,-50%)'}} />
          </div>
          <div>
            <div className="text-base sm:text-lg font-bold text-white">Automatische Synchronisation</div>
            <div className="text-[11px] text-gray-400 -mt-0.5">Halte deine Daten aktuell</div>
        </div>
      </div>

        <div className="h-px w-full bg-white/10 my-4" />
        
        {/* Sync Interval */}
        <div className="mb-6">
          <div className="text-[10px] sm:text-[11px] text-gray-400 uppercase tracking-[.14em] mb-2">
            SYNC-INTERVALL
          </div>
          <div className="relative inline-block">
            <select
              value={schedulerConfig.interval}
              onChange={(e) => setSchedulerConfig({ 
                interval: e.target.value as typeof schedulerConfig.interval,
                enabled: true
              })}
              className="appearance-none pr-7 pl-3 py-1.5 bg-neutral-800 text-white border border-white/15 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-[13px] shadow-inner"
            >
              {schedulerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-300">▾</span>
          </div>
        </div>

        {/* Next Sync Display */}
        {schedulerConfig.nextSync && (
          <div>
            <div className="text-[10px] sm:text-[11px] text-gray-400 uppercase tracking-[.14em] mb-2">
              NÄCHSTE SYNCHRONISATION
            </div>
            <div className="flex items-center gap-2">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4 text-emerald-400">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none" />
                <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="font-mono text-emerald-400 text-[13px] sm:text-sm">
                {new Date(schedulerConfig.nextSync).toLocaleString('de-DE')}
              </span>
            </div>
          </div>
        )}
      </div>

      </div>

    </div>
  )
}

export default LocationSelectionView
