# GF-Board Cloudflare Auto-Reload Extension

> Chrome/Chromium Extension for automatic page reload on Cloudflare errors
> Designed for 24/7 Raspberry Pi Kiosk operation

**Last Updated:** November 21, 2025
**Target Platform:** Linux Chromium (Raspberry Pi OS)
**Purpose:** Auto-reload kiosk when Cloudflare or backend is down

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Cloudflare Error Analysis](#cloudflare-error-analysis)
3. [Solution Architecture](#solution-architecture)
4. [Implementation Plan](#implementation-plan)
5. [Testing Strategy](#testing-strategy)
6. [Installation Guide](#installation-guide)
7. [Maintenance](#maintenance)

---

## Problem Statement

### Current Situation

**GF-Board Kiosk Setup:**
- Raspberry Pi running Chromium in kiosk mode
- Loads: `https://simeon-gf-kiosk.brandwork-gmbh.workers.dev`
- Auto-reload: Once daily at 3am (via `index.html` meta refresh)

**The Problem:**
1. **Cloudflare Outage:** If Cloudflare is down, kiosk shows error page
2. **3am Coincidence:** If Cloudflare is down at exactly 3am, kiosk stays on error page for 24 hours
3. **No Recovery:** Without intervention, kiosk displays error until next 3am reload
4. **Rare but Critical:** Cloudflare downtime is rare (~99.99% uptime) but when it happens, kiosk is unusable

### Success Criteria

✅ Detect Cloudflare error pages automatically
✅ Auto-reload every 15 minutes when error detected
✅ Works on Linux Chromium (Raspberry Pi OS)
✅ Minimal CPU/Memory overhead
✅ No false positives (don't reload working pages)
✅ Easy to install and maintain

---

## Cloudflare Error Analysis

### What Cloudflare Returns When Down

#### 1. Cloudflare's Own Errors (5xx)

**Error 502: Bad Gateway**
```html
<!DOCTYPE html>
<html>
<head>
  <title>502 Bad Gateway</title>
</head>
<body>
  <center><h1>502 Bad Gateway</h1></center>
  <center>cloudflare</center>
</body>
</html>
```

**Indicators:**
- HTTP Status: `502`
- Page Title: `"502 Bad Gateway"`
- Body contains: `"cloudflare"` (lowercase)
- Very minimal HTML

**Error 503: Service Unavailable**
```html
<!DOCTYPE html>
<html>
<head>
  <title>503 Service Temporarily Unavailable</title>
</head>
<body>
  <center><h1>503 Service Temporarily Unavailable</h1></center>
  <center>cloudflare</center>
</body>
</html>
```

**Indicators:**
- HTTP Status: `503`
- Page Title: `"503 Service Temporarily Unavailable"`
- Body contains: `"cloudflare"`

**Error 504: Gateway Timeout**
```html
<!DOCTYPE html>
<html>
<head>
  <title>504 Gateway Time-out</title>
</head>
<body>
  <center><h1>504 Gateway Time-out</h1></center>
  <center>cloudflare</center>
</body>
</html>
```

**Indicators:**
- HTTP Status: `504`
- Page Title: `"504 Gateway Time-out"`
- Body contains: `"cloudflare"`

#### 2. Cloudflare Error Codes (1xxx)

**Error 1000-1999:** Cloudflare-specific errors
```html
<div class="cf-error-title">
  <h1>Error 1xxx</h1>
</div>
```

**Common Cloudflare Error Codes:**
- `1000` - DNS points to prohibited IP
- `1001` - DNS resolution error
- `1002` - Restricted (banned)
- `1003` - Direct IP access not allowed
- `1004` - Not configured
- `1005` - Banned
- `1006` - Brotli support issue
- `1007` - Access denied
- `1008` - Too many redirects
- `1009` - Ratelimit
- `1010` - Firewall rule triggered
- `1011` - Origin refused connection
- `1012` - Origin timeout
- `1013` - Origin unreachable

**Indicators:**
- Page Title: Usually `"Error | domain.com | Cloudflare"`
- Body contains: `"Error 1xxx"` or `"cf-error"`
- Cloudflare branding visible

#### 3. Cloudflare Branded Error Pages

**Modern Cloudflare Error Page:**
```html
<div class="cf-wrapper">
  <div class="cf-error-title">
    <h1>Web server is down</h1>
  </div>
  <div class="cf-highlight">Error code 521</div>
</div>
```

**Indicators:**
- CSS classes: `cf-wrapper`, `cf-error-title`, `cf-highlight`
- Cloudflare logo SVG
- Ray ID: `Ray ID: abc123xyz`

#### 4. Workers Down (Specific to our setup)

**Workers Deployment Error:**
```html
<!DOCTYPE html>
<html>
<head>
  <title>Application Error</title>
</head>
<body>
  <h1>Application Error</h1>
  <p>This Cloudflare Workers application is currently unavailable.</p>
</body>
</html>
```

**Indicators:**
- Page Title: `"Application Error"`
- Body contains: `"Cloudflare Workers"`

### Detection Strategy

**Primary Indicators (High Confidence):**
1. Page title contains: `"502"`, `"503"`, `"504"`, `"Error"`, `"cloudflare"`
2. Body text contains: `"cloudflare"` (case-insensitive)
3. Body text contains: `"Error 1"` followed by 3 digits
4. CSS classes: `cf-error`, `cf-wrapper`

**Secondary Indicators (Medium Confidence):**
1. Very short HTML document (< 1KB) with error keywords
2. No app-specific elements (e.g., no React root div)
3. HTTP status code is 5xx (if accessible)

**False Positive Prevention:**
1. Don't trigger if `<div id="root">` exists (our React app)
2. Don't trigger if page contains "GET" and "FIT" branding
3. Require multiple indicators to match

---

## Solution Architecture

### Extension Components

```
gf-board-extension/
├── manifest.json          # Extension configuration (Manifest V3)
├── content.js             # Error detection logic
├── background.js          # Service worker (optional for logging)
├── icons/
│   ├── icon16.png        # Extension icon 16x16
│   ├── icon48.png        # Extension icon 48x48
│   └── icon128.png       # Extension icon 128x128
└── IMPLEMENTATION_PLAN.md # This file
```

### How It Works

```
┌─────────────────────────────────────────────────┐
│ 1. Page Loads                                   │
│    Chromium loads any URL                       │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────┐
│ 2. Content Script Injects                       │
│    content.js runs on page load                 │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────┐
│ 3. Error Detection                              │
│    Check page title, body text, CSS classes     │
│    ├─ Is it Cloudflare error? ─→ YES           │
│    └─ Is it our app? ─────────→ NO              │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────┐
│ 4. Schedule Reload                              │
│    setTimeout(() => location.reload(), 15min)   │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────┐
│ 5. Wait 15 Minutes                              │
│    Timer runs in background                     │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────┐
│ 6. Reload Page                                  │
│    window.location.reload()                     │
└────────────────┬────────────────────────────────┘
                 │
                 └─→ Back to Step 1 (Loop until success)
```

### Performance Considerations

**CPU Usage:**
- Script runs once per page load
- No continuous polling
- setTimeout is passive (no CPU)

**Memory Usage:**
- < 1MB total
- One timer object per tab
- Minimal DOM inspection

**Battery Impact:**
- None (RPi has constant power)

---

## Implementation Plan

### File 1: `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "GF-Board Auto-Reload",
  "version": "1.0.0",
  "description": "Automatically reload page on Cloudflare errors (GF-Board Kiosk)",
  "permissions": [
    "tabs"
  ],
  "host_permissions": [
    "https://simeon-gf-kiosk.brandwork-gmbh.workers.dev/*"
  ],
  "content_scripts": [
    {
      "matches": ["https://simeon-gf-kiosk.brandwork-gmbh.workers.dev/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

**Key Points:**
- Manifest V3 (latest standard)
- Only runs on our specific domain (security)
- `run_at: document_idle` → waits for page to load
- Minimal permissions

### File 2: `content.js`

```javascript
// GF-Board Auto-Reload Extension
// Detects Cloudflare errors and reloads page after 15 minutes

(function() {
  'use strict';

  const RELOAD_DELAY_MS = 15 * 60 * 1000; // 15 minutes
  const DEBUG = true; // Set to false in production

  function log(message, ...args) {
    if (DEBUG) {
      console.log(`[GF-Board Auto-Reload] ${message}`, ...args);
    }
  }

  function isCloudflareError() {
    // Get page elements
    const title = document.title.toLowerCase();
    const bodyText = document.body.innerText.toLowerCase();
    const html = document.documentElement.outerHTML.toLowerCase();

    // Check if our React app loaded successfully
    const hasReactRoot = document.getElementById('root') !== null;
    const hasAppBranding = bodyText.includes('getfit') || bodyText.includes('get fit');

    if (hasReactRoot || hasAppBranding) {
      log('✅ App loaded successfully, not an error page');
      return false;
    }

    // Check for Cloudflare error indicators
    const indicators = {
      // HTTP error codes in title
      has502: title.includes('502'),
      has503: title.includes('503'),
      has504: title.includes('504'),

      // Cloudflare branding
      hasCloudflare: bodyText.includes('cloudflare') || html.includes('cloudflare'),

      // Cloudflare error codes
      hasErrorCode: /error\s+1\d{3}/.test(bodyText),

      // Cloudflare CSS classes
      hasCfError: html.includes('cf-error') || html.includes('cf-wrapper'),

      // Workers error
      hasWorkersError: title.includes('application error') && bodyText.includes('workers'),

      // Generic error title
      hasErrorTitle: title.includes('error') || title.includes('unavailable'),

      // Very short page (< 2KB indicates error page)
      isShortPage: html.length < 2048
    };

    log('Indicators:', indicators);

    // Decision logic: Multiple indicators must match
    const errorScore =
      (indicators.has502 ? 3 : 0) +
      (indicators.has503 ? 3 : 0) +
      (indicators.has504 ? 3 : 0) +
      (indicators.hasCloudflare ? 2 : 0) +
      (indicators.hasErrorCode ? 3 : 0) +
      (indicators.hasCfError ? 2 : 0) +
      (indicators.hasWorkersError ? 3 : 0) +
      (indicators.hasErrorTitle && indicators.isShortPage ? 1 : 0);

    const isError = errorScore >= 3;

    log(`Error score: ${errorScore} (threshold: 3) → ${isError ? 'ERROR DETECTED' : 'Normal page'}`);

    return isError;
  }

  function scheduleReload() {
    const reloadTime = new Date(Date.now() + RELOAD_DELAY_MS);
    log(`🔄 Scheduling reload at ${reloadTime.toLocaleTimeString()}`);

    setTimeout(() => {
      log('⏰ Reload timer triggered, reloading page...');
      window.location.reload();
    }, RELOAD_DELAY_MS);
  }

  // Main execution
  log('Extension loaded, checking page...');

  if (isCloudflareError()) {
    log('❌ Cloudflare error detected!');
    scheduleReload();
  } else {
    log('✅ Page is normal, no action needed');
  }
})();
```

**Key Features:**
- Multi-indicator detection (reduces false positives)
- Scoring system (requires threshold of 3 points)
- Checks for React app presence (prevents false positives)
- Debug logging (can be disabled)
- IIFE wrapper (isolated scope)
- 15-minute delay before reload

### File 3: `background.js` (Optional)

```javascript
// Background service worker for logging and monitoring
// Optional: Only needed if you want centralized logging

chrome.runtime.onInstalled.addListener(() => {
  console.log('GF-Board Auto-Reload Extension installed');
});

// Listen for messages from content script (if needed)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'ERROR_DETECTED') {
    console.log('Error detected on tab:', sender.tab.id);
  }
  if (request.type === 'RELOAD_SCHEDULED') {
    console.log('Reload scheduled for:', request.time);
  }
});
```

**Note:** This is optional for basic functionality.

---

## Testing Strategy

### Phase 1: Local Development Testing

#### Test 1: Mock Cloudflare 502 Error

**Create local HTML file:** `test-502.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title>502 Bad Gateway</title>
</head>
<body>
  <center><h1>502 Bad Gateway</h1></center>
  <center>cloudflare</center>
</body>
</html>
```

**Expected:** Extension should detect error and schedule reload.

#### Test 2: Mock Cloudflare 503 Error

**Create:** `test-503.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title>503 Service Temporarily Unavailable</title>
</head>
<body>
  <center><h1>503 Service Temporarily Unavailable</h1></center>
  <center>cloudflare</center>
</body>
</html>
```

**Expected:** Extension should detect error.

#### Test 3: Mock Working App

**Create:** `test-working.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title>GF Kiosk</title>
</head>
<body>
  <div id="root">
    <div>GETFIT</div>
  </div>
</body>
</html>
```

**Expected:** Extension should NOT trigger reload (false positive check).

#### Test 4: Mock Cloudflare Error Code

**Create:** `test-1020.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title>Error | cloudflare</title>
</head>
<body>
  <div class="cf-error">
    <h1>Error 1020: Access Denied</h1>
  </div>
</body>
</html>
```

**Expected:** Extension should detect error.

### Phase 2: Production Simulation Testing

#### Test 5: Actual GF-Board App (Running)

1. Install extension in Chromium
2. Navigate to: `https://simeon-gf-kiosk.brandwork-gmbh.workers.dev`
3. Check console logs

**Expected:**
```
[GF-Board Auto-Reload] Extension loaded, checking page...
[GF-Board Auto-Reload] ✅ App loaded successfully, not an error page
[GF-Board Auto-Reload] ✅ Page is normal, no action needed
```

#### Test 6: Simulate Backend Down

**Method:** Use browser DevTools to block network

1. Open DevTools (F12)
2. Network tab → Enable "Offline" mode
3. Reload page
4. Check console logs

**Expected:**
- Browser shows connection error
- Extension may or may not trigger (depends on browser's offline page)

#### Test 7: Simulate Cloudflare Down

**Method:** Temporarily point DNS to wrong IP (requires SSH access)

1. Edit `/etc/hosts` on RPi:
   ```
   127.0.0.1 simeon-gf-kiosk.brandwork-gmbh.workers.dev
   ```
2. Reload page in Chromium
3. Observe error page
4. Check console logs

**Expected:** Extension should detect Cloudflare-like error.

**Cleanup:** Remove hosts entry after test.

### Phase 3: Raspberry Pi Testing

#### Test 8: Full Kiosk Simulation

1. Install extension on RPi Chromium
2. Start Chromium in kiosk mode:
   ```bash
   chromium-browser --kiosk --app=https://simeon-gf-kiosk.brandwork-gmbh.workers.dev
   ```
3. Use `/etc/hosts` to simulate error
4. Wait 15 minutes
5. Verify page reloads

**Expected:** Page reloads automatically after 15 minutes.

#### Test 9: CPU/Memory Monitoring

```bash
# Monitor Chromium resource usage
top -p $(pgrep chromium)
```

**Expected:** No significant CPU increase, memory < 1MB extra.

#### Test 10: Multi-Day Reliability Test

1. Leave kiosk running with extension for 7 days
2. Manually trigger errors 2-3 times
3. Verify all reloads occur
4. Check for memory leaks

**Expected:** Extension works reliably over extended period.

### Phase 4: Edge Case Testing

#### Test 11: Multiple Rapid Errors

1. Trigger error
2. Manually reload before 15min timer
3. Trigger error again
4. Verify only one timer is active

**Expected:** No duplicate timers, no memory leak.

#### Test 12: Very Fast Cloudflare Recovery

1. Trigger error (schedules 15min reload)
2. Cloudflare comes back after 1 minute
3. User manually reloads
4. Verify normal operation

**Expected:** Extension detects working app, doesn't schedule reload.

#### Test 13: Network Flapping

1. Simulate on/off network (WiFi disconnect/reconnect)
2. Verify extension doesn't false-trigger

**Expected:** Extension only triggers on actual Cloudflare error pages.

### Testing Checklist

```
□ Test 1: Mock 502 page
□ Test 2: Mock 503 page
□ Test 3: Mock working app (false positive)
□ Test 4: Mock Cloudflare 1xxx error
□ Test 5: Real GF-Board app (running)
□ Test 6: Offline mode
□ Test 7: Simulate Cloudflare down
□ Test 8: Full kiosk simulation
□ Test 9: CPU/Memory monitoring
□ Test 10: Multi-day reliability
□ Test 11: Multiple rapid errors
□ Test 12: Fast recovery
□ Test 13: Network flapping
```

---

## Installation Guide

### Prerequisites

- Raspberry Pi with Raspberry Pi OS
- Chromium browser installed
- SSH access to Pi

### Step 1: Prepare Extension Files

On your development machine:

```bash
# Navigate to project
cd gf-board/gf-board-extension

# Create icon directory
mkdir -p icons

# Generate simple icons (or use custom ones)
# You can use any 16x16, 48x48, 128x128 PNG images
# For now, you can use placeholder images
```

**Icon Creation (Optional):**
- Use online tool: https://favicon.io
- Or create simple colored squares in GIMP/Photoshop
- Sizes: 16x16, 48x48, 128x128 pixels
- Format: PNG
- Content: Simple "GF" text or logo

### Step 2: Transfer to Raspberry Pi

```bash
# From your development machine
scp -r gf-board-extension pi@<PI_IP_ADDRESS>:/home/pi/

# Or use rsync
rsync -av gf-board-extension/ pi@<PI_IP_ADDRESS>:/home/pi/gf-board-extension/
```

### Step 3: Install Extension in Chromium

On the Raspberry Pi (via SSH + VNC or direct access):

1. **Open Chromium:**
   ```bash
   chromium-browser
   ```

2. **Navigate to Extensions:**
   - Enter in address bar: `chrome://extensions`
   - Or Menu → More Tools → Extensions

3. **Enable Developer Mode:**
   - Toggle switch in top-right corner

4. **Load Extension:**
   - Click "Load unpacked"
   - Navigate to: `/home/pi/gf-board-extension`
   - Click "Select Folder"

5. **Verify Installation:**
   - Extension should appear in list
   - Check for errors in console (if any)

### Step 4: Test Installation

1. **Navigate to test page:**
   ```
   file:///home/pi/gf-board-extension/test-502.html
   ```

2. **Open DevTools (F12)**

3. **Check Console:**
   Should see:
   ```
   [GF-Board Auto-Reload] Extension loaded, checking page...
   [GF-Board Auto-Reload] ❌ Cloudflare error detected!
   [GF-Board Auto-Reload] 🔄 Scheduling reload at <time>
   ```

4. **Wait 15 minutes or adjust timer in code for testing**

### Step 5: Configure Autostart (if needed)

If Chromium autostart is not configured:

```bash
# Edit autostart file
nano ~/.config/lxsession/LXDE-pi/autostart

# Add line:
@chromium-browser --kiosk --app=https://simeon-gf-kiosk.brandwork-gmbh.workers.dev
```

Extension will auto-load with Chromium.

### Step 6: Verify in Production

1. Reboot Pi
2. Kiosk should start with extension active
3. Monitor logs (if accessible)
4. Manually test by simulating error

---

## Maintenance

### Updating the Extension

1. **Modify files on dev machine**
2. **Transfer to Pi:**
   ```bash
   scp content.js pi@<PI_IP>:/home/pi/gf-board-extension/
   ```
3. **Reload extension in Chromium:**
   - Go to `chrome://extensions`
   - Click reload button on extension card

### Monitoring

**Check if extension is active:**
```bash
# SSH into Pi
ssh pi@<PI_IP>

# Check Chromium process
ps aux | grep chromium

# Check extension files
ls -la /home/pi/gf-board-extension/
```

**View extension console logs:**
- Requires DevTools access
- Or use remote debugging:
  ```bash
  chromium-browser --remote-debugging-port=9222
  ```
  Then visit from another machine: `http://<PI_IP>:9222`

### Troubleshooting

**Extension not loading:**
1. Check file permissions: `chmod -R 755 /home/pi/gf-board-extension/`
2. Verify manifest.json syntax: Use JSONLint
3. Check Chromium version: `chromium-browser --version`

**False positives (reloading working app):**
1. Adjust scoring threshold in content.js
2. Add more app-specific checks
3. Check console logs for indicator values

**Not detecting errors:**
1. Verify error page HTML structure
2. Adjust detection patterns
3. Lower scoring threshold (temporarily)

### Logs

**Enable verbose logging:**

In `content.js`, set:
```javascript
const DEBUG = true;
```

**Disable in production** to reduce console clutter:
```javascript
const DEBUG = false;
```

---

## Future Enhancements

**v1.1 - Planned Features:**
- [ ] Exponential backoff (15min → 30min → 60min)
- [ ] Notification when error detected (optional)
- [ ] Stats page: total errors detected, reloads triggered
- [ ] Remote logging to GF-Board backend

**v2.0 - Advanced Features:**
- [ ] Multiple domain support (if needed)
- [ ] Configurable reload interval via popup UI
- [ ] Health check ping before reload
- [ ] Email/SMS alert on persistent errors

---

## License & Support

**Maintainer:** GF-Board Development Team
**Support:** Internal use only
**License:** Proprietary (internal tool)

---

**End of Implementation Plan**

Last Updated: November 21, 2025
