# GF Kiosk Monitor Extension

Chrome/Chromium Extension for monitoring the GF Kiosk app on Raspberry Pi.

## Features

1. **Crash Detection** - Detects "Aw, Snap!" errors (Error code 5, 6) and auto-reloads
2. **Error Handling** - Reloads on HTTP errors with exponential backoff (n+1 seconds)
3. **Periodic Health Check** - Checks every minute for stuck error pages

## Installation

### Development Mode

1. Open Chrome/Chromium
2. Go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `extension/` folder

### Raspberry Pi (Kiosk Mode)

Add to Chromium startup flags:
```bash
chromium-browser \
  --kiosk \
  --load-extension=/path/to/extension \
  --disable-extensions-except=/path/to/extension \
  https://your-kiosk-url
```

Or in `/etc/xdg/lxsession/LXDE-pi/autostart`:
```
@chromium-browser --kiosk --load-extension=/home/pi/extension https://your-kiosk-url
```

## How It Works

### Crash Detection (content.js)

The content script runs in every page and checks for:
- "Aw, Snap!" text (English/German)
- Error codes 5 (ACCESS_VIOLATION) and 6 (Out of Memory)
- Chrome error page elements
- Empty page body (render crash)

### Error Handling (background.js)

The background service worker:
- Listens for navigation errors
- Tracks retry count per tab
- Implements exponential backoff: Attempt 1 = 1s, Attempt 2 = 2s, etc.
- Resets retry counter after 60 seconds of successful operation

### Retry Logic

```
Error occurs
    ↓
Wait (retryCount + 1) seconds
    ↓
Reload page
    ↓
If still error → increment retryCount, repeat
If success for 60s → reset retryCount to 0
```

## Configuration

Edit `background.js` CONFIG object:

```javascript
const CONFIG = {
  // Only monitor specific URLs (empty = all)
  monitorPatterns: ['gf-board.', 'localhost'],
  
  // Max retries (0 = unlimited)
  maxRetries: 0,
  
  // Reset counter after N seconds of success
  resetAfterSeconds: 60,
  
  // Health check interval
  checkIntervalMs: 5000
};
```

## Logs

View logs in Chrome DevTools:
- Background: `chrome://extensions/` → GF Kiosk Monitor → "service worker"
- Content: Regular DevTools console (F12)

All logs prefixed with `[GF Monitor]`.

## Icons

Replace placeholder icons with custom ones:
- `icon16.png` - 16x16 px
- `icon48.png` - 48x48 px  
- `icon128.png` - 128x128 px
