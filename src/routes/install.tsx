import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { generatePiSetupScript } from "../helper/create-installer";

export const Route = createFileRoute("/install")({
  component: InstallPage,
});

const CHECK_EXTENSIONS_CMD =
  "chromium --user-data-dir=$HOME/.chromium-kiosk chrome://extensions";

const ENABLE_ONBOARD_WIFI_CMD =
  "sudo sed -i '/dtoverlay=disable-wifi/d' /boot/firmware/config.txt && echo 'Onboard WLAN aktiviert. Neustart erforderlich.'";

function InstallPage() {
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState("https://gf-kiosk.brandwork.tech/");
  const [generatedScript, setGeneratedScript] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [checkCopySuccess, setCheckCopySuccess] = useState(false);
  const [wifiCopySuccess, setWifiCopySuccess] = useState(false);

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
    <div className="w-full min-h-screen bg-black text-white flex flex-col items-center py-12 relative overflow-auto">
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

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          {/* Snapper Extension */}
          <a
            href="https://chromewebstore.google.com/detail/snapper-aw-snap-tab-reloa/jehgbfogcmbekbbcadldojojckehlkbi"
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-2 p-4 bg-gradient-to-b from-neutral-900/95 to-neutral-900/70 border border-white/10 rounded-lg hover:border-blue-500/50 transition-colors"
          >
            <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-blue-400"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-3.953 6.848c.389.035.782.054 1.18.054 6.627 0 12-5.373 12-12 0-1.006-.124-1.983-.357-2.915zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728z" />
              </svg>
            </div>
            <span className="text-xs font-medium text-white">
              Snapper Extension
            </span>
            <span className="text-[10px] text-gray-500">Crash-Recovery</span>
          </a>

          {/* Check Kiosk Profile */}
          <button
            onClick={() => {
              navigator.clipboard.writeText(CHECK_EXTENSIONS_CMD);
              setCheckCopySuccess(true);
              setTimeout(() => setCheckCopySuccess(false), 3000);
            }}
            className="flex flex-col items-center gap-2 p-4 bg-gradient-to-b from-neutral-900/95 to-neutral-900/70 border border-white/10 rounded-lg hover:border-emerald-500/50 transition-colors"
          >
            <div className="w-10 h-10 bg-emerald-600/20 rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <span className="text-xs font-medium text-white">
              {checkCopySuccess ? "Kopiert!" : "Kiosk-Profil prüfen"}
            </span>
            <span className="text-[10px] text-gray-500">
              Extensions checken
            </span>
          </button>

          {/* Activate Pi WLAN */}
          <button
            onClick={() => {
              navigator.clipboard.writeText(ENABLE_ONBOARD_WIFI_CMD);
              setWifiCopySuccess(true);
              setTimeout(() => setWifiCopySuccess(false), 3000);
            }}
            className="flex flex-col items-center gap-2 p-4 bg-gradient-to-b from-neutral-900/95 to-neutral-900/70 border border-white/10 rounded-lg hover:border-yellow-500/50 transition-colors"
          >
            <div className="w-10 h-10 bg-yellow-600/20 rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-yellow-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                />
              </svg>
            </div>
            <span className="text-xs font-medium text-white">
              {wifiCopySuccess ? "Kopiert!" : "Onboard WLAN"}
            </span>
            <span className="text-[10px] text-gray-500">WLAN aktivieren</span>
          </button>
        </div>
      </div>
    </div>
  );
}
