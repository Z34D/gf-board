# GF-Board

> Digital Signage Kiosk fuer GetFit Fitnessstudios. Bun-Server auf Raspberry Pi, Media-Sync via Google Drive.

## Quick Reference

| Item | Value |
|------|-------|
| **Runtime** | Bun 1.3.x |
| **Frontend** | React 19 + Zustand + Tailwind CSS v4 |
| **Server** | Bun.serve (native, kein Framework) |
| **Worker** | Separates Repo: `gf-board-worker` (Cloudflare Workers + Hono) |
| **Target** | Raspberry Pi 4/5 + Chromium Kiosk (24/7) |

## Commands

```bash
bun run start       # Produktion: Server + Chromium Kiosk
bun run dev         # Dev-Server auf :3000 (kein Chromium)
bun run setup       # Interaktives Pi-Setup (scripts/install.ts)
bash scripts/setup.sh  # Erstinstallation (Bun installieren + Setup)
```

## Projektstruktur

```
gf-board/
├── frontend/                    # React Frontend
│   ├── app.tsx                  # Entry: App-Komponente + Mount
│   ├── index.html               # HTML Entry (Bun bundelt automatisch)
│   ├── index.css                # Tailwind + Kiosk-Styles
│   ├── components/
│   │   ├── LocationSelectionView.tsx   # Standort-Auswahl + Scheduler-Config
│   │   ├── SlideshowView.tsx           # Slideshow mit Keyboard/Touch Nav
│   │   ├── Slide.tsx                   # Einzelner Slide (Bild/Video)
│   │   └── slideshow/hooks/
│   │       └── useSlideshowMachine.ts  # State Machine: IDLE->LOADING->PLAYING
│   ├── stores/appStore.ts       # Zustand Store (Location, Files, Scheduler)
│   └── utils/errors.ts          # Global Error Handlers
├── server/                      # Bun Kiosk Server
│   ├── index.ts                 # HTTP Server, Chromium Management, API Routes
│   ├── sync.ts                  # Media-Sync: Worker API -> lokale Disk
│   └── scheduler.ts             # Cron-basierter Sync-Scheduler (croner)
├── scripts/                     # Setup & Autostart
│   ├── setup.sh                 # Erstinstallation (Bun + Dependencies + Setup)
│   ├── install.ts               # Interaktives Pi-Setup (WLAN, Autostart, .env)
│   ├── autostart.sh             # labwc Autostart (Update + Crash-Recovery-Loop)
│   └── update.sh                # Git Auto-Update bei Neustart
├── package.json                 # Kiosk Dependencies (react, zustand, croner)
├── bunfig.toml                  # Bun Tailwind Plugin
├── .gitignore
├── media/                       # (gitignored) Sync-Output pro Location
├── config.json                  # (gitignored) Runtime State
└── .env                         # (gitignored) KIOSK_PIN + WORKER_URL
```

## Architektur

```
Raspberry Pi
├── Bun Server (server/index.ts)
│   ├── Servt Frontend (HTML Import)
│   ├── Servt Media-Dateien von Disk (/media/{location}/{file})
│   ├── API Endpoints (/api/files, /api/status, /api/set-location, ...)
│   ├── Spawnt Chromium als Child Process (Crash-Recovery)
│   └── Cron: Sync-Scheduler + 3 AM Chromium-Restart
│
├── Chromium --kiosk → http://localhost:3000
│
└── scripts/autostart.sh (labwc)
    ├── update.sh → git fetch + reset --hard (safe, exit 0 immer)
    └── while true: bun run start (Crash-Recovery-Loop)

    ↓ HTTPS (nur fuer Sync)

Cloudflare Worker (separates Repo: gf-board-worker)
├── POST /api/auth/login (PIN → JWT Cookie)
├── GET /api/locations/:location/files (Google Drive Ordner lesen)
└── ALL /api/drive/* (Google Drive API Proxy, Streaming)
    ↓
Google Drive (Media Files pro Standort)
```

## Sync-Flow

```
Bun-Server → Worker /api/auth/login (PIN, bekommt JWT Cookie)
           → Worker /api/locations/{location}/files (Dateiliste)
           → Vergleich mit lokalen Files auf Disk (modified-Time)
           → Worker /api/drive/files/{id}?alt=media (nur neue/geaenderte)
           → Download in .tmp, dann rename() (quasi-atomar)
           → Geloeschte Files werden von Disk entfernt
```

Session-Cookie wird gecached. Bei 401 automatisch Re-Login.

## Autostart-Flow (Pi Boot)

```
labwc Desktop startet
  → ~/.config/labwc/autostart
    → bash scripts/autostart.sh &
      → sleep 10 (Desktop laden lassen)
      → bash scripts/update.sh (safe, exit 0 immer)
        ├── git fetch origin main (timeout 15s, skip wenn offline)
        ├── git reset --hard origin/main (nie Merge-Conflicts)
        └── bun install (timeout 120s, skip wenn fehlschlaegt)
      → while true: bun run start (Crash-Recovery-Loop)
```

## 5 Standorte

Flieden, Neuhof, Gersfeld, Schlitz, Eichenzell

Google Drive Struktur:
```
Root Folder/
├── Shared/       ← Inhalte fuer alle Standorte
├── Flieden/      ← Standort-spezifisch
├── Neuhof/
├── Gersfeld/
├── Schlitz/
└── Eichenzell/
```

## Server API (server/index.ts)

| Endpoint | Methode | Beschreibung |
|----------|---------|-------------|
| `/` | GET | Frontend (HTML Import) |
| `/media/{location}/{file}` | GET | Media-Dateien von Disk |
| `/api/files` | GET | Dateiliste der aktuellen Location |
| `/api/status` | GET | Location, Scheduler, Sync-Status, Memory |
| `/api/sync` | POST | Manuellen Sync triggern |
| `/api/set-location` | POST | Location aendern (triggert Sync) |
| `/api/set-scheduler` | POST | Sync-Intervall aendern |
| `/api/kill-kiosk` | POST | Chromium dauerhaft beenden (Alt+Q) |

## Keyboard Navigation

| Taste | Aktion |
|-------|--------|
| → / Space | Naechster Slide |
| ← | Vorheriger Slide |
| L | Zurueck zur Standort-Auswahl |
| Alt+Q | Chromium beenden (via API) |

## Sync-Intervalle (konfigurierbar)

- 5 Minuten
- 4 Stunden
- 8 Stunden
- Taeglich um 1:00 Uhr (Default)

3 AM: Chromium-Restart (frischer Browser-State, kein Server-Neustart)

## Erstinstallation auf Pi

```bash
git clone https://github.com/Z34D/gf-board.git
cd gf-board
bash scripts/setup.sh
# → Installiert Bun, Dependencies, startet interaktives Setup
# → Fragt WLAN, PIN, konfiguriert Autostart
sudo reboot
```

## Environment (.env, gitignored)

```
KIOSK_PIN=0000
WORKER_URL=https://gf-kiosk.brandwork.tech
```

Wird von `scripts/install.ts` erstellt.

## Worker Deploy (separates Repo)

Siehe `gf-board-worker` Repo (`../gf-board-worker/`).

```bash
cd ../gf-board-worker
bun install
bun run deploy    # wrangler deploy --keep-vars
```

Cloudflare Env-Vars (im Dashboard gesetzt):
- `GOOGLE_DRIVE_API_KEY`
- `GOOGLE_DRIVE_ROOT_FOLDER_ID`
- `KIOSK_PIN`
- `JWT_SECRET`

## Debugging auf Pi

```bash
# Update-Log
cat /tmp/kiosk-update.log

# Server-Log
cat /tmp/kiosk-server.log

# Memory
watch -n 1 'free -h'

# Chromium Prozesse
ps aux | grep chromium

# Kiosk verlassen
# Strg+Alt+F3 → pkill chromium → Strg+Alt+F7

# Onboard WLAN reaktivieren (wenn USB-WLAN entfernt wurde)
sudo sed -i '/dtoverlay=disable-wifi/d' /boot/firmware/config.txt
sudo reboot
```

## Known Issues

### Chromium "Aw, Snap!" Error 5
Out of memory nach Wochen Betrieb.
Mitigation: 3 AM Chromium-Restart + autostart.sh Crash-Recovery-Loop.
