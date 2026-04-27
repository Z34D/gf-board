# GF-Board

> Digital Signage Kiosk fuer GetFit Fitnessstudios. Bun-Server auf Raspberry Pi, Media-Sync direkt via Google Drive API.

## Quick Reference

| Item | Value |
|------|-------|
| **Runtime** | Bun 1.3.x |
| **Frontend** | React 19 + Tailwind CSS v4 |
| **Server** | Bun.serve (native, kein Framework) |
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
├── frontend/                    # React Frontend (kein Store, kein Router)
│   ├── app.tsx                  # Entry: Location aus URL, Mount
│   ├── index.html               # HTML Entry (Bun bundelt automatisch)
│   ├── index.css                # Tailwind + Kiosk-Styles
│   ├── LocationSelectionView.tsx # Standort-Auswahl (navigiert zu /{location})
│   └── Slideshow.tsx            # Slideshow (Crossfade, Video-Preload, Heartbeat)
├── server/                      # Bun Kiosk Server
│   ├── index.ts                 # HTTP Server, Chromium Management, API Routes
│   ├── gdrive.ts                # Media-Sync: Google Drive API -> lokale Disk
│   ├── scheduler.ts             # Cron: Sync 01:00, Restart 03:00 (croner)
│   └── logger.ts                # Log Helper (Timestamp + Tag)
├── scripts/                     # Setup & Autostart
│   ├── setup.sh                 # Erstinstallation (Bun + Dependencies + Setup)
│   ├── install.ts               # Interaktives Pi-Setup (WLAN, Autostart, .env)
│   ├── autostart.sh             # labwc Autostart (Update + Crash-Recovery-Loop)
│   ├── ensure-system.sh         # Idempotente System-Config (labwc, WLAN, Bun PATH)
│   └── update.sh                # Git Auto-Update bei Neustart (mit Crash-Recovery)
├── package.json                 # Kiosk Dependencies (react, croner)
├── bunfig.toml                  # Bun Tailwind Plugin
├── .gitignore
├── media/                       # (gitignored) Sync-Output pro Location
├── config.json                  # (gitignored) Runtime State (selectedLocation)
└── .env                         # (gitignored) GOOGLE_DRIVE_API_KEY + ROOT_FOLDER_ID
```

## Architektur

```
Raspberry Pi
├── Bun Server (server/index.ts)
│   ├── Servt Frontend (HTML Import, Bun bundelt JS/CSS)
│   ├── Routes: /, /flieden, /neuhof, /gersfeld, /schlitz, /eichenzell
│   ├── Servt Media-Dateien von Disk (/media/{location}/{file})
│   ├── API Endpoints (/api/files/:location, /api/status, ...)
│   ├── Spawnt Chromium als Child Process (Crash-Recovery)
│   ├── Chromium-Restart nach Sync (wenn Dateien geaendert)
│   ├── Heartbeat-Watchdog: Chromium-Restart wenn Frontend nicht antwortet
│   ├── Resource-Monitoring alle 5 Min (Bun + Chrome Memory)
│   └── Cron: Sync 01:00 + Restart 03:00
│
├── Chromium --kiosk → http://localhost:3000/{location}
│
└── scripts/autostart.sh (labwc)
    ├── update.sh → git fetch + reset --hard (safe, exit 0 immer)
    │   └── Bei korruptem Repo: auto Re-Clone + Restore (.env, config, media)
    ├── ensure-system.sh → labwc Keybinds, WLAN, Bun PATH, Screen Blanking
    │   └── Idempotent, kann per git push gehotfixt werden
    └── while true: bun run start (Crash-Recovery-Loop)

    ↓ HTTPS (Google Drive API direkt)

Google Drive (Media Files pro Standort)
```

## URL-Routing

Location wird ueber URL bestimmt, kein Client-Side State:

| URL | Anzeige |
|-----|---------|
| `/` | Standort-Auswahl |
| `/flieden` | Slideshow fuer Flieden |
| `/gersfeld` | Slideshow fuer Gersfeld |
| ... | ... |

Frontend liest Location aus `window.location.pathname`. Kein Store, kein State Management.

## Sync-Flow

```
Bun-Server → Google Drive API /files (Dateiliste, API Key)
           → Vergleich mit lokalen Files auf Disk (modified-Time)
           → Google Drive API /files/{id}?alt=media (nur neue/geaenderte)
           → Streaming Download via FileSink (chunked, kein Memory-Buffer)
           → Download in .tmp, dann rename() (atomar)
           → Retry 3x mit Backoff (2s, 4s, 6s) bei Fehlern
           → Tmp-Cleanup bei Sync-Start (Crash-Recovery)
           → Geloeschte Files werden von Disk entfernt
           → Chromium-Restart wenn Dateien geaendert
```

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
    → swayidle -w timeout 5 'wtype ...' &
      → nach 5s Idle: sendet Alt+Super+H an labwc
      → labwc HideCursor action: Cursor weg, bei Maus-Bewegung zurueck
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
| `/` | GET | Location-Auswahl (Frontend) |
| `/{location}` | GET | Slideshow (Frontend) |
| `/media/{location}/{file}` | GET | Media-Dateien von Disk |
| `/api/files/{location}` | GET | Dateiliste einer Location |
| `/api/status` | GET | Location, Sync-Status, naechster Sync, Memory, Watchdog |
| `/api/sync` | POST | Manuellen Sync triggern |
| `/api/set-location` | POST | Location aendern (triggert Sync) |
| `/api/heartbeat` | POST | Frontend-Heartbeat (alle 60s, Watchdog-Reset) |
| `/api/kill-kiosk` | POST | Chromium beenden (Alt+Q) |

## Keyboard Navigation

| Taste | Aktion |
|-------|--------|
| → / Space | Naechster Slide |
| ← | Vorheriger Slide |
| L | Zurueck zur Standort-Auswahl |
| Alt+Q | Chromium beenden (via API) |

## Sync-Zeitplan (fest)

- 01:00 Uhr: Automatischer Sync mit Google Drive
- 03:00 Uhr: Chromium-Restart (frischer Browser-State, kein Server-Neustart)
- Nach jedem Sync: Chromium-Restart wenn Dateien geaendert wurden

## Erstinstallation auf Pi

```bash
git clone https://github.com/Z34D/gf-board.git
cd gf-board
bash scripts/setup.sh
# → Installiert Bun, Dependencies, startet interaktives Setup
# → Fragt WLAN, Google Drive API Key, konfiguriert Autostart
sudo reboot
```

## Environment (.env, gitignored)

```
GOOGLE_DRIVE_API_KEY=...
GOOGLE_DRIVE_ROOT_FOLDER_ID=...
```

Wird von `scripts/install.ts` erstellt.

## Logging

Format: `HH:MM:SS [tag] message`

```
14:32:05 [server] Location: Flieden
14:32:05 [server] GF-Kiosk gestartet → http://localhost:3000/flieden
14:32:05 [sync] Gestartet: Flieden
14:32:06 [sync] +3 neu, ~1 geaendert, -2 geloescht, =6 aktuell
14:32:08 [sync] ↓ video1.mp4 (2/4, 24.3MB)
14:32:45 [sync] Fertig (40.2s): +3 neu, ~1 geaendert, -2 geloescht
14:32:46 [chromium] Neustart nach Sync...
```

Tags: `server`, `sync`, `chromium`, `scheduler`, `monitor`

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
```

## Watchdog

```
Frontend (Slideshow.tsx)
  → POST /api/heartbeat alle 60s

Server (index.ts)
  → Prueft alle 60s ob Heartbeat < 2 Min alt
  → Kein Heartbeat → Chromium-Restart
  → 3x hintereinander kein Heartbeat → process.exit(1)
  → autostart.sh while-loop startet alles neu
```

## Video-Stability

- Alle Slides im DOM, Sichtbarkeit per CSS opacity-Crossfade (500ms)
- Bilder: immer geladen, kein Re-Decode bei Slide-Wechsel
- Videos: nur aktives + naechstes haben `src` gesetzt (max 2 Video-Decoder)
- Inaktive Videos: `pause() + removeAttribute('src') + load()` gibt Decoder frei
- Chromium gibt Video-Buffer ohne `load()` nie frei (bekannter Chrome-Bug)
- Naechstes Video wird mit `preload="auto"` vorgeladen (gleicher DOM-Node)
- Video-Advance via 'ended' Event, nicht Duration-Timer
- Error-Handler: kaputtes Video wird uebersprungen
- Safety-Timeout: 5 Min fuer stuck Videos
- Page-Reload nach 100 Slide-Wechseln (frischer Chromium-Renderer)
- Einzelnes Video: wird dupliziert (2 Slides gleicher Datei) damit Crossfade/Counter/Preload funktionieren

## Known Issues

### WLAN: Onboard-only, keine USB-Dongle-Policy
Fuer die Kiosk-Pis reicht das Onboard-WLAN aus. USB-WLAN-Dongles sind fuer
die wenigen monatlichen Updates und gelegentliche Google-Drive-Syncs
unnoetige Fehlerflaeche: zusaetzlicher Treiber, USB-Strom/Reset, wechselnde
`wlan0`/`wlan1`-Zuordnung und NetworkManager-Auswahl.
Regel: Keine USB-WLAN-Sonderbehandlung mehr einbauen und Onboard-WLAN niemals
wegen eines Dongles deaktivieren.

`ensure-system.sh` ist der Healing-Pfad fuer alte WLAN-Konfigurationen. Beim
Boot muss es `dtoverlay=disable-wifi` aus `/boot/firmware/config.txt`
entfernen, `rfkill unblock wifi` ausfuehren, `nmcli radio wifi on` setzen und
alle vorhandenen `wlan*` wieder auf `managed yes` stellen. Da das beim Boot
ohne interaktives Terminal laeuft, nutzt das Script `sudo -A` mit
`SUDO_ASKPASS` fuer das Default-Pi-Passwort. Ohne funktionierendes sudo kann
der wichtigste Fix (`/boot/firmware/config.txt`) nicht garantiert angewendet
werden.

### Git Repo Corruption nach Stromausfall
`git reset --hard` in `update.sh` ist nicht crash-safe. Wenn der Pi waehrend
eines `git reset --hard` Strom verliert (oder der Desktop durch `pkill labwc`
abstuerzt), werden `.git/objects` halb geschrieben → korruptes Repo → alle
getrackte Dateien sind 0 Bytes → Server startet nicht.
Fix: `update.sh` prueft bei jedem Boot mit `git rev-parse HEAD` + `git fsck`
ob das Repo intakt ist. Bei Korruption: automatischer Re-Clone nach `/tmp`,
dann Swap. `.env`, `config.json` und `media/` werden gesichert und
wiederhergestellt. Clone nach `/tmp` statt direktes `rm -rf` des Repo-Dir,
weil das Script sich sonst sein eigenes CWD unter den Fuessen wegloescht.

### Bun PATH geht nach Re-Clone verloren
Bun's Installer schreibt den PATH in `.bashrc`, aber nach einem Re-Clone
(oder wenn `.bashrc` ueberschrieben wird) fehlt der Eintrag.
Fix: `ensure-system.sh` prueft idempotent ob `BUN_INSTALL` in `.bashrc`
steht und traegt es ein wenn nicht.

### labwc HideCursor greift nicht nach Config-Reload
Nach `pkill -HUP labwc` (Config-Reload) wird die `rc.xml` neu geladen,
aber `swayidle` hat den `HideCursor` Keybind noch nicht neu getriggert.
Der Cursor bleibt sichtbar bis zum naechsten manuellen `wtype`-Aufruf.
Fix: `ensure-system.sh` startet `swayidle` nach dem `rc.xml`-Schreiben
neu (`pkill swayidle; swayidle ... &`), damit der Cursor sofort nach
5s Idle verschwindet.

### ensure-system.sh darf NIEMALS pkill labwc oder pkill kanshi ohne Restart ausfuehren
Fruehe Versionen von `ensure-system.sh` haben `pkill labwc` ausgefuehrt,
was den gesamten Desktop (und damit Chromium, Terminal, alles) abschiessen
laesst. Das fuehrte zu einem Crash-Loop und in Kombination mit `update.sh`
zur Git-Repo-Korruption (siehe oben).
Regeln:
- labwc Config-Reload: `pkill -HUP labwc` (SIGHUP, kein Kill)
- kanshi Restart: `pkill kanshi; sleep 0.5; kanshi &` (nur kanshi, nicht labwc)
- NIEMALS `pkill labwc` in einem Script das beim Boot laeuft

### Chromium "Aw, Snap!" Error 5
Out of memory nach Wochen Betrieb.
Mitigation: 3 AM Chromium-Restart + Heartbeat-Watchdog + autostart.sh Crash-Recovery-Loop.

### Bun.write(path, Response) haengt auf ARM/Linux
`Bun.write(targetPath, res)` mit einem fetch Response haengt auf Raspberry Pi.
Fix: Streaming via `Bun.file().writer()` + `for await (chunk of res.body)`.
Nicht `Bun.write` fuer fetch Responses auf Pi verwenden!

### Chromium Video-Buffer Memory Leak
Chromium gibt Video-Decoder-Buffer nicht frei wenn Video-Elemente aus dem DOM entfernt werden.
Fix: Vor dem Entfernen: `video.pause(); video.removeAttribute('src'); video.load();`
Zusaetzlich: Nur aktives + naechstes Video mit `src` belegen, alle anderen leer.

### `--memory-pressure-off` verursacht System-Freeze
Chromium-Flag `--memory-pressure-off` deaktiviert Chromiums eigene Speicherverwaltung.
Auf dem Pi fuehrt das zu einem kompletten System-Freeze (kein TTY, keine Tastatur).
Fix: Flag entfernt. Chromium raeumt jetzt bei Speicherdruck selbst auf.

### Chromium Renderer degradiert ueber Stunden
Nach 10+ Stunden Dauerbetrieb werden CSS-Transitions ruckelig und Bilder laden
sichtbar langsam rein (Pi-CPU zu schwach fuer wiederholtes Bild-Dekodieren).
Fix: Bilder immer im DOM halten (kein Re-Decode), Page-Reload nach 100 Slides,
3 AM Chromium-Restart.

### xdotool nicht auf Pi OS vorinstalliert
Entgegen der Dokumentation ist `xdotool` auf Raspberry Pi OS mit labwc Desktop
NICHT vorinstalliert. `wtype` und `swayidle` muessen per `apt install` nachinstalliert
werden (erledigt `scripts/install.ts::setupCursorHide()`).

### Bun.spawn stdin Default ist "inherit"
`Bun.spawn()` vererbt standardmaessig stdin vom Parent-Prozess. Wenn ein Script
`readline` nutzt und gleichzeitig Child-Prozesse spawnt (z.B. `nmcli`, `sudo`),
koennen die Child-Prozesse stdin-Bytes stehlen → readline haengt.
Fix: Immer `stdin: "ignore"` bei Shell-Aufrufen in interaktiven Scripts setzen.

### Location-Wechsel: fetch muss geawaitet werden
`window.location.href = ...` nach einem fire-and-forget `fetch()` bricht den
Request ab, weil der Browser sofort navigiert. Der Server bekommt den Request nie.
Fix: `await fetch(...)` bevor navigiert wird.

### Maus-Cursor verstecken auf labwc/Wayland
`unclutter` / `unclutter-xfixes` funktionieren **nicht** auf labwc (wlroots-basiert) —
der Compositor verwaltet den Pointer selbst und ignoriert X11-Cursor-Manipulationen von
XWayland-Clients. Chromium CSS `cursor: none` wirkt nur innerhalb der Page, nicht auf dem
Desktop drumherum.

**Loesung (seit labwc 0.8.2):** labwc hat eine eingebaute `HideCursor` action, die den
Cursor sofort versteckt und bei jeder Maus-/Touchpad-Bewegung automatisch wieder zeigt.
Die Action laesst sich nur an Keybinds haengen — wir triggern sie per `swayidle` + `wtype`:

1. `~/.config/labwc/rc.xml`: Keybind `A-W-h` -> `HideCursor` action
2. `~/.config/labwc/autostart`: `swayidle -w timeout 5 'wtype -M alt -M logo -k h' &`
3. `scripts/install.ts::setupCursorHide()` installiert `wtype` + `swayidle` per apt und
   schreibt beide Files idempotent.

Ergebnis: Cursor verschwindet 5s nach letzter Maus-Bewegung, erscheint sofort bei
Bewegung wieder — funktioniert auf nacktem Desktop (Debugging) und im Chromium-Kiosk.

Referenzen: labwc PR #2273 (touch auto-hide), labwc PR #2633 (HideCursor action).
