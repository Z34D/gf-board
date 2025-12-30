/**
 * GF Kiosk Monitor - Content Script
 *
 * Detects "Aw, Snap!" crash pages (Error 5, 6)
 * HTTP errors (502, 503) are handled by Service Worker
 */

(function () {
  "use strict";

  // Check immediately and after DOM loads
  checkForCrash();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", checkForCrash);
  }

  // Check periodically (every 30s)
  setInterval(checkForCrash, 30000);

  /**
   * Check if current page is a crash page
   */
  function checkForCrash() {
    const crashIndicators = detectCrashIndicators();

    if (crashIndicators.isCrashed) {
      console.log("[GF Monitor] Crash detected:", crashIndicators.reason);
      notifyBackground("CRASH_DETECTED", crashIndicators.reason);
    } else {
      notifyBackground("PAGE_HEALTHY", null);
    }
  }

  /**
   * Detect browser crash indicators
   */
  function detectCrashIndicators() {
    const bodyText = document.body?.textContent || "";

    // Check for "Aw, Snap!" error page
    const crashIndicators = [
      // English
      bodyText.includes("Aw, Snap!"),
      bodyText.includes("Something went wrong"),
      // German
      bodyText.includes("Hoppla!"),
      bodyText.includes("Da ist etwas schiefgelaufen"),
      // Error codes
      bodyText.includes("Error code: 5"),
      bodyText.includes("Fehlercode: 5"),
      bodyText.includes("STATUS_ACCESS_VIOLATION"),
      bodyText.includes("Error code: 6"),
      bodyText.includes("Fehlercode: 6"),
      bodyText.includes("Out of Memory"),
      bodyText.includes("Nicht genügend Arbeitsspeicher"),
    ];

    if (crashIndicators.some(Boolean)) {
      return { isCrashed: true, reason: "Aw, Snap! error" };
    }

    // Check for chrome-error:// page
    if (window.location.href.startsWith("chrome-error://")) {
      return { isCrashed: true, reason: "Chrome error page" };
    }

    // Check for error page elements
    const errorElements = document.querySelectorAll(
      "#main-frame-error, .interstitial-wrapper, .error-code",
    );
    if (errorElements.length > 0) {
      return { isCrashed: true, reason: "Error page elements" };
    }

    return { isCrashed: false, reason: null };
  }

  /**
   * Send message to background script
   */
  function notifyBackground(type, error) {
    try {
      chrome.runtime.sendMessage({ type, error }, () => {
        if (chrome.runtime.lastError) {
          // Extension might be reloading, ignore
        }
      });
    } catch (e) {
      // Extension context invalidated
    }
  }
})();
