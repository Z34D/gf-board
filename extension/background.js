/**
 * GF Kiosk Monitor - Background Service Worker
 *
 * Monitors tabs for:
 * 1. Chrome crash pages ("Aw, Snap!" Error 5)
 * 2. HTTP errors (non-200/301 responses)
 *
 * Uses exponential backoff for reload attempts:
 * Attempt 1: 1 sec, Attempt 2: 2 sec, Attempt 3: 3 sec, etc.
 */

// Configuration
const CONFIG = {
  // Only monitor these URL patterns (empty = monitor all)
  monitorPatterns: [],
  // Max reload attempts before giving up (0 = unlimited)
  maxRetries: 0,
  // Reset retry counter after this many seconds of success
  resetAfterSeconds: 60,
  // Check interval for crash detection (ms)
  checkIntervalMs: 5000,
};

// Track reload attempts per tab
const tabRetryState = new Map();

/**
 * Get or create retry state for a tab
 */
function getTabState(tabId) {
  if (!tabRetryState.has(tabId)) {
    tabRetryState.set(tabId, {
      retryCount: 0,
      lastError: null,
      lastSuccess: Date.now(),
      pendingReload: false,
    });
  }
  return tabRetryState.get(tabId);
}

/**
 * Calculate delay based on retry count (n+1 seconds)
 */
function getRetryDelay(retryCount) {
  return (retryCount + 1) * 1000;
}

/**
 * Reload a tab with exponential backoff
 */
async function reloadTabWithBackoff(tabId, reason) {
  const state = getTabState(tabId);

  // Don't queue multiple reloads
  if (state.pendingReload) {
    console.log(
      `[GF Monitor] Reload already pending for tab ${tabId}, skipping`,
    );
    return;
  }

  state.pendingReload = true;
  state.retryCount++;
  state.lastError = reason;

  const delay = getRetryDelay(state.retryCount);

  console.log(
    `[GF Monitor] ${reason} - Reload #${state.retryCount} in ${delay / 1000}s (Tab ${tabId})`,
  );

  // Wait for backoff delay
  await new Promise((resolve) => setTimeout(resolve, delay));

  try {
    // Check if tab still exists
    const tab = await chrome.tabs.get(tabId);
    if (tab) {
      await chrome.tabs.reload(tabId);
      console.log(`[GF Monitor] Reloaded tab ${tabId}`);
    }
  } catch (err) {
    console.log(`[GF Monitor] Tab ${tabId} no longer exists, cleaning up`);
    tabRetryState.delete(tabId);
    return;
  }

  const currentState = tabRetryState.get(tabId);
  if (currentState) {
    currentState.pendingReload = false;
  }
}

/**
 * Reset retry counter after successful page load
 */
function resetTabState(tabId) {
  const state = getTabState(tabId);
  const timeSinceLastSuccess = Date.now() - state.lastSuccess;

  // Only reset if page was successful for a while
  if (timeSinceLastSuccess > CONFIG.resetAfterSeconds * 1000) {
    state.retryCount = 0;
    state.lastError = null;
  }
  state.lastSuccess = Date.now();
}

/**
 * Check if URL should be monitored
 */
function shouldMonitor(url) {
  if (!url) return false;

  // Skip chrome:// and extension pages
  if (url.startsWith("chrome://") || url.startsWith("chrome-extension://")) {
    return false;
  }

  // If no patterns configured, monitor all HTTP(S) URLs
  if (CONFIG.monitorPatterns.length === 0) {
    return url.startsWith("http://") || url.startsWith("https://");
  }

  // Check against configured patterns
  return CONFIG.monitorPatterns.some((pattern) => url.includes(pattern));
}

// --- Event Listeners ---

/**
 * Listen for web navigation errors (HTTP errors)
 */
chrome.webNavigation.onErrorOccurred.addListener(async (details) => {
  // Only handle main frame errors
  if (details.frameId !== 0) return;
  if (!shouldMonitor(details.url)) return;

  console.log(
    `[GF Monitor] Navigation error: ${details.error} (Tab ${details.tabId})`,
  );

  await reloadTabWithBackoff(
    details.tabId,
    `Navigation error: ${details.error}`,
  );
});

/**
 * Listen for completed navigation to reset retry counter
 */
chrome.webNavigation.onCompleted.addListener((details) => {
  // Only handle main frame
  if (details.frameId !== 0) return;
  if (!shouldMonitor(details.url)) return;

  resetTabState(details.tabId);
});

/**
 * Listen for messages from content script (crash detection)
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CRASH_DETECTED") {
    const tabId = sender.tab?.id;
    if (tabId) {
      console.log(
        `[GF Monitor] Crash detected: ${message.error} (Tab ${tabId})`,
      );
      reloadTabWithBackoff(tabId, `Crash: ${message.error}`);
    }
    sendResponse({ received: true });
  }

  if (message.type === "PAGE_HEALTHY") {
    const tabId = sender.tab?.id;
    if (tabId) {
      resetTabState(tabId);
    }
    sendResponse({ received: true });
  }

  return true;
});

/**
 * Clean up state when tab is closed
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  tabRetryState.delete(tabId);
});

/**
 * Detect crashed tabs via tab status changes
 * When a tab crashes, status becomes "unloaded" or URL becomes chrome-error://
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Check for crash indicators
  if (changeInfo.status === "complete" && tab.url) {
    // Chrome error pages
    if (tab.url.startsWith("chrome-error://")) {
      console.log(`[GF Monitor] Tab ${tabId} crashed (chrome-error://)`);
      reloadTabWithBackoff(tabId, "Tab crashed (chrome-error)");
      return;
    }

    // Sad tab / crashed tab - URL stays same but title changes
    if (tab.title?.includes("Aw, Snap") || tab.title?.includes("Hoppla")) {
      console.log(`[GF Monitor] Tab ${tabId} crashed (Aw, Snap!)`);
      reloadTabWithBackoff(tabId, "Tab crashed (Aw, Snap!)");
      return;
    }
  }

  // Tab discarded (memory pressure) or crashed
  if (changeInfo.discarded === true) {
    console.log(`[GF Monitor] Tab ${tabId} was discarded`);
    // Reload the tab to restore it
    reloadTabWithBackoff(tabId, "Tab discarded");
  }
});

/**
 * Periodic health check using alarms
 */
chrome.alarms.create("healthCheck", { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "healthCheck") {
    // Query all tabs and check for crash pages
    const tabs = await chrome.tabs.query({});

    for (const tab of tabs) {
      if (!tab.url || !tab.id) continue;

      // Check for Chrome error pages
      if (tab.url.startsWith("chrome-error://")) {
        console.log(`[GF Monitor] Found error page (Tab ${tab.id})`);
        await reloadTabWithBackoff(tab.id, "Chrome error page detected");
      }
    }
  }
});

console.log("[GF Monitor] Background service worker started");
