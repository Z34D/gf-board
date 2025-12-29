/**
 * GF Kiosk Monitor - Content Script
 *
 * Detects:
 * - "Aw, Snap!" crash pages (Error 5, 6)
 * - HTTP error responses (500, 502, 503, 504)
 * - Cloudflare error pages
 */

(function () {
  "use strict";

  // Check immediately and after DOM loads
  checkForCrash();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", checkForCrash);
  }

  // Check periodically (every 30s is enough - crashes don't happen often)
  setInterval(checkForCrash, 30000);

  /**
   * Check if current page is a crash/error page
   */
  function checkForCrash() {
    const crashIndicators = detectCrashIndicators();

    if (crashIndicators.isCrashed) {
      console.log("[GF Monitor] ❌ ERROR:", crashIndicators.reason);
      notifyBackground("CRASH_DETECTED", crashIndicators.reason);
    } else {
      notifyBackground("PAGE_HEALTHY", null);
    }
  }

  /**
   * Detect various crash/error indicators
   */
  function detectCrashIndicators() {
    const bodyText = document.body?.textContent || "";
    const title = document.title || "";

    // 1. Check for "Aw, Snap!" error page
    const awSnapIndicators = [
      // English
      bodyText.includes("Aw, Snap!"),
      bodyText.includes("Something went wrong"),
      // German
      bodyText.includes("Hoppla!"),
      bodyText.includes("Da ist etwas schiefgelaufen"),
      // Error code 5 specifically
      bodyText.includes("Error code: 5"),
      bodyText.includes("Fehlercode: 5"),
      bodyText.includes("STATUS_ACCESS_VIOLATION"),
      // Out of memory
      bodyText.includes("Error code: 6"),
      bodyText.includes("Fehlercode: 6"),
      bodyText.includes("Out of Memory"),
      bodyText.includes("Nicht genügend Arbeitsspeicher"),
    ];

    if (awSnapIndicators.some(Boolean)) {
      return { isCrashed: true, reason: "Aw, Snap! error page" };
    }

    // 2. Check for HTTP error pages (500, 502, 503, 504)
    const httpErrorIndicators = [
      // Generic HTTP errors
      title.includes("500"),
      title.includes("502"),
      title.includes("503"),
      title.includes("504"),
      bodyText.includes("500 Internal Server Error"),
      bodyText.includes("502 Bad Gateway"),
      bodyText.includes("503 Service Unavailable"),
      bodyText.includes("503 Service Temporarily Unavailable"),
      bodyText.includes("504 Gateway Timeout"),
      // Cloudflare specific
      bodyText.includes("cloudflare") && bodyText.includes("Error"),
      bodyText.includes("Web server is down"),
      bodyText.includes("Origin is unreachable"),
      bodyText.includes("Connection timed out"),
      bodyText.includes("Error 520"),
      bodyText.includes("Error 521"),
      bodyText.includes("Error 522"),
      bodyText.includes("Error 523"),
      bodyText.includes("Error 524"),
      // German variants
      bodyText.includes("Server nicht erreichbar"),
      bodyText.includes("Dienst nicht verfügbar"),
    ];

    if (httpErrorIndicators.some(Boolean)) {
      return { isCrashed: true, reason: "HTTP error page (500/502/503/504)" };
    }

    // 3. Check for chrome-error:// page
    if (window.location.href.startsWith("chrome-error://")) {
      return { isCrashed: true, reason: "Chrome error page" };
    }

    // 4. Check for specific error page elements
    const errorElements = document.querySelectorAll(
      "#main-frame-error, .interstitial-wrapper, .error-code, .cf-error-overview",
    );
    if (errorElements.length > 0) {
      return { isCrashed: true, reason: "Error page elements detected" };
    }

    // 5. Check for empty body (possible render crash)
    if (document.body && document.body.innerHTML.trim() === "") {
      if (document.readyState === "complete") {
        return { isCrashed: true, reason: "Empty page body" };
      }
    }

    return { isCrashed: false, reason: null };
  }

  /**
   * Send message to background script
   */
  function notifyBackground(type, error) {
    try {
      chrome.runtime.sendMessage({ type, error }, (response) => {
        if (chrome.runtime.lastError) {
          // Extension might be reloading, ignore
          console.debug(
            "[GF Monitor] Message error:",
            chrome.runtime.lastError.message,
          );
        }
      });
    } catch (e) {
      // Extension context invalidated, ignore
    }
  }
})();
