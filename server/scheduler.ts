import { Cron } from "croner";

export type Interval = "5min" | "4hours" | "8hours" | "daily1am";

let syncJob: Cron | null = null;
let restartJob: Cron | null = null;

function intervalToCron(interval: Interval): string {
  switch (interval) {
    case "5min":
      return "*/5 * * * *";
    case "4hours":
      return "0 */4 * * *";
    case "8hours":
      return "0 */8 * * *";
    case "daily1am":
      return "0 1 * * *";
  }
}

export function startScheduler(
  interval: Interval,
  onSync: () => void,
  onRestart: () => void,
): void {
  if (syncJob) syncJob.stop();
  if (restartJob) restartJob.stop();

  syncJob = new Cron(intervalToCron(interval), onSync);
  console.log(`[scheduler] Sync: ${interval} (next: ${syncJob.nextRun()?.toLocaleString("de-DE")})`);

  restartJob = new Cron("0 3 * * *", onRestart);
  console.log(`[scheduler] Neustart: täglich 3:00 Uhr (nächster: ${restartJob.nextRun()?.toLocaleString("de-DE")})`);
}

export function setSchedule(interval: Interval, onSync: () => void): void {
  if (syncJob) syncJob.stop();
  syncJob = new Cron(intervalToCron(interval), onSync);
  console.log(`[scheduler] Sync updated: ${interval} (next: ${syncJob.nextRun()?.toLocaleString("de-DE")})`);
}

export function getNextSync(): string | null {
  return syncJob?.nextRun()?.toISOString() ?? null;
}
