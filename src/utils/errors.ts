/**
 * Error handling utilities for kiosk resilience
 *
 * Provides:
 * - Safe wrappers for async/sync functions
 * - Global error handlers to prevent crashes
 * - Error classification for retry decisions
 *
 * @module utils/errors
 */

/**
 * Wraps an async function with error handling
 * Returns a default value on error instead of throwing
 *
 * @param fn - Async function to wrap
 * @param defaultValue - Value to return on error
 * @param context - Optional context for error logging
 * @returns Result of fn or defaultValue on error
 *
 * @example
 * const data = await safeAsync(() => fetchData(), [], 'Fetching data')
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  defaultValue: T,
  context?: string,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ ${context || "Error"}: ${message}`);
    return defaultValue;
  }
}

/**
 * Wraps a sync function with error handling
 * Returns a default value on error instead of throwing
 *
 * @param fn - Sync function to wrap
 * @param defaultValue - Value to return on error
 * @param context - Optional context for error logging
 * @returns Result of fn or defaultValue on error
 */
export function safeSync<T>(fn: () => T, defaultValue: T, context?: string): T {
  try {
    return fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ ${context || "Error"}: ${message}`);
    return defaultValue;
  }
}

/**
 * Logs an error without crashing the application
 *
 * @param error - Error to log (can be any type)
 * @param context - Optional context description
 */
export function logError(error: unknown, context?: string): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  const stack = error instanceof Error ? error.stack : undefined;

  console.error(`❌ ${context || "Error"}: ${message}`);
  if (stack) {
    console.error(stack);
  }
}

/**
 * Sets up global error handlers to prevent app crashes
 *
 * Catches:
 * - Unhandled promise rejections
 * - Uncaught JavaScript errors
 *
 * Should be called once on app initialization
 */
export function setupGlobalErrorHandlers(): void {
  // Catch unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    event.preventDefault();
    logError(event.reason, "Unhandled Promise Rejection");
  });

  // Catch uncaught errors
  window.addEventListener("error", (event) => {
    event.preventDefault();
    logError(event.error || event.message, "Uncaught Error");
  });

  console.log("🛡️ Global error handlers initialized");
}

/**
 * Checks if an error is network-related
 *
 * @param error - Error to check
 * @returns True if error is network-related
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  return false;
}

/**
 * Checks if an error is recoverable (worth retrying)
 *
 * Recoverable errors include:
 * - Network errors (temporary connectivity issues)
 * - HTTP 5xx errors (server-side issues)
 *
 * @param error - Error to check
 * @returns True if error might recover on retry
 */
export function isRecoverableError(error: unknown): boolean {
  if (isNetworkError(error)) {
    return true;
  }

  if (error instanceof Error && /5\d{2}/.test(error.message)) {
    return true;
  }

  return false;
}
