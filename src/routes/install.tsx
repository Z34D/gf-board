import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { generatePiSetupScript } from "../helper/create-installer";

export const Route = createFileRoute("/install")({
  component: InstallPage,
});

function InstallPage() {
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState("https://gf-kiosk.brandwork.tech/");
  const [generatedScript, setGeneratedScript] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);

  const handleGenerate = () => {
    if (!url) {
      alert("Bitte gib mindestens eine Ziel-URL ein");
      return;
    }

    const script = generatePiSetupScript(ssid, password, url);
    setGeneratedScript(script);

    // Copy to clipboard
    navigator.clipboard
      .writeText(script)
      .then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 3000);
      })
      .catch((err) => {
        console.error("Fehler beim Kopieren:", err);
      });
  };

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

      {/* Radial/linear gradient glow behind header */}
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
          <span className="text-red-500">Install</span>
        </h1>
        <p className="text-base sm:text-lg text-gray-300 mt-4">
          Raspberry Pi Setup Script Generator
        </p>
      </div>

      {/* Form Container */}
      <div className="w-full max-w-3xl mx-auto px-6 relative z-10">
        <div className="bg-gradient-to-b from-neutral-900/95 to-neutral-900/70 border border-white/10 p-8 rounded-lg w-full mb-6 shadow-[0_12px_40px_rgba(0,0,0,.4)]">
          {/* Form Header */}
          <div className="flex items-start gap-2.5 mb-6">
            <div className="relative mt-1">
              <div className="h-6 w-6 rounded-full bg-red-600 shadow-[0_0_16px_rgba(239,68,68,.6)]" />
              <div
                className="absolute inset-0 m-auto h-2 w-2 rounded-full bg-white"
                style={{
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%,-50%)",
                }}
              />
            </div>
            <div>
              <div className="text-base sm:text-lg font-bold text-white">
                Konfiguration
              </div>
              <div className="text-[11px] text-gray-400 -mt-0.5">
                Gib die WLAN-Daten und Ziel-URL ein
              </div>
            </div>
          </div>

          <div className="h-px w-full bg-white/10 mb-6" />

          {/* Input Fields */}
          <div className="space-y-5">
            {/* SSID Input */}
            <div>
              <label
                htmlFor="ssid"
                className="block text-[10px] sm:text-[11px] text-gray-400 uppercase tracking-[.14em] mb-2"
              >
                WLAN SSID
              </label>
              <input
                id="ssid"
                type="text"
                value={ssid}
                onChange={(e) => setSsid(e.target.value)}
                placeholder="Mein-WLAN"
                className="w-full px-4 py-2.5 bg-neutral-800 text-white border border-white/15 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm shadow-inner"
              />
            </div>

            {/* Password Input */}
            <div>
              <label
                htmlFor="password"
                className="block text-[10px] sm:text-[11px] text-gray-400 uppercase tracking-[.14em] mb-2"
              >
                WLAN Passwort
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 bg-neutral-800 text-white border border-white/15 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm shadow-inner"
              />
            </div>

            {/* URL Input */}
            <div>
              <label
                htmlFor="url"
                className="block text-[10px] sm:text-[11px] text-gray-400 uppercase tracking-[.14em] mb-2"
              >
                Ziel-URL
              </label>
              <input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full px-4 py-2.5 bg-neutral-800 text-white border border-white/15 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm shadow-inner"
              />
            </div>
          </div>

          {/* Generate Button */}
          <div className="mt-6">
            <button
              onClick={handleGenerate}
              className="w-full px-6 py-3 bg-gradient-to-b from-red-600 to-red-700 text-white font-semibold rounded-lg hover:from-red-700 hover:to-red-800 transition-all duration-300 shadow-xl shadow-red-600/40 ring-1 ring-white/10"
            >
              Setup Script generieren
            </button>
          </div>

          {/* Copy Success Message */}
          {copySuccess && (
            <div className="mt-4 flex items-center gap-2 text-emerald-400 text-sm">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="w-5 h-5">
                <path
                  fill="currentColor"
                  d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                />
              </svg>
              In Zwischenablage kopiert!
            </div>
          )}
        </div>

        {/* Generated Script Display */}
        {generatedScript && (
          <div className="bg-gradient-to-b from-neutral-900/95 to-neutral-900/70 border border-white/10 p-6 rounded-lg w-full shadow-[0_12px_40px_rgba(0,0,0,.4)]">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[10px] sm:text-[11px] text-gray-400 uppercase tracking-[.14em]">
                Setup Script
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generatedScript);
                  setCopySuccess(true);
                  setTimeout(() => setCopySuccess(false), 3000);
                }}
                className="px-3 py-1.5 bg-neutral-800 text-gray-300 text-xs rounded-md hover:bg-neutral-700 transition-colors border border-white/10"
              >
                Erneut kopieren
              </button>
            </div>
            <textarea
              readOnly
              value={generatedScript}
              className="w-full h-64 px-4 py-3 bg-neutral-950 text-gray-300 font-mono text-xs border border-white/15 rounded-md shadow-inner resize-none"
            />
            <div className="mt-3 text-xs text-gray-400 bg-emerald-950/50 p-3 rounded border border-emerald-500/20">
              ✓ Drücke F11 um den Kiosk-Modus zu verlassen!
            </div>
          </div>
        )}

        {/* Snapper Extension Link */}
        <div className="bg-gradient-to-b from-neutral-900/95 to-neutral-900/70 border border-white/10 p-6 rounded-lg w-full mt-6 shadow-[0_12px_40px_rgba(0,0,0,.4)]">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-white mb-1">
                Snapper Extension
              </h3>
              <p className="text-xs text-gray-400 mb-3">
                Installiere die Snapper Chrome Extension für automatisches
                Neuladen bei Browser-Crashes.
              </p>
              <a
                href="https://chromewebstore.google.com/detail/snapper-aw-snap-tab-reloa/jehgbfogcmbekbbcadldojojckehlkbi"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-3.953 6.848c.389.035.782.054 1.18.054 6.627 0 12-5.373 12-12 0-1.006-.124-1.983-.357-2.915zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728z" />
                </svg>
                Chrome Web Store
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
