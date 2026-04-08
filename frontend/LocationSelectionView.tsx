import React from "react";

const LOCATIONS = ["Flieden", "Neuhof", "Gersfeld", "Schlitz", "Eichenzell"];

const LocationSelectionView: React.FC = () => {

  async function selectLocation(location: string) {
    const slug = location.toLowerCase();
    await fetch("/api/set-location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location: slug }),
    }).catch(() => {});
    window.location.href = `/${slug}`;
  }

  return (
    <div className="w-full h-screen bg-black text-white flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
            backgroundSize: "50px 50px",
          }}
        />
      </div>

      {/* Radial gradient glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(1200px 500px at 50% 10%, rgba(255,255,255,0.15), rgba(255,255,255,0) 60%), radial-gradient(900px 300px at 50% 8%, rgba(239,68,68,0.18), rgba(239,68,68,0) 65%)`,
        }}
      />

      {/* Header */}
      <div className="text-center mb-10 relative z-10">
        <h1 className="text-6xl sm:text-7xl font-extrabold tracking-tight mb-0">
          <span className="text-white">GF </span>
          <span className="text-red-500">Kiosk</span>
        </h1>
        <p className="text-base sm:text-lg text-gray-300 mt-4">
          Wähle deinen Standort aus
        </p>
      </div>

      <div className="w-full max-w-3xl mx-auto px-6 relative z-10">
        <div className="grid grid-cols-3 gap-5 mb-8">
          {LOCATIONS.map((location) => (
            <button
              key={location}
              onClick={() => selectLocation(location)}
              className="px-6 py-6 sm:px-7 sm:py-7 rounded-xl text-xl sm:text-2xl font-semibold transition-all duration-300 flex flex-col items-center cursor-pointer bg-gradient-to-b from-neutral-900/95 to-neutral-800/80 text-gray-200 hover:from-neutral-900 hover:to-neutral-800 hover:text-white hover:scale-[1.02] ring-1 ring-white/10 shadow-[0_10px_30px_rgba(0,0,0,.35)]"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="w-5 h-5 sm:w-6 sm:h-6 mb-2 text-gray-400"
              >
                <path
                  fill="currentColor"
                  d="M12 2C8.686 2 6 4.686 6 8c0 4.5 6 12 6 12s6-7.5 6-12c0-3.314-2.686-6-6-6zm0 8.5A2.5 2.5 0 1 1 12 5.5a2.5 2.5 0 0 1 0 5z"
                />
              </svg>
              {location}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LocationSelectionView;
