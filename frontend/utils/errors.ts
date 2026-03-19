export function logError(error: unknown, context?: string): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  const stack = error instanceof Error ? error.stack : undefined;

  console.error(`[ERR] ${context || "Error"}: ${message}`);
  if (stack) {
    console.error(stack);
  }
}

export function setupGlobalErrorHandlers(): void {
  window.addEventListener("unhandledrejection", (event) => {
    event.preventDefault();
    logError(event.reason, "Unhandled Promise Rejection");
  });

  window.addEventListener("error", (event) => {
    event.preventDefault();
    logError(event.error || event.message, "Uncaught Error");
  });

  console.log("[init] Global error handlers initialized");
}
