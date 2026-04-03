import { Cron } from "croner";
import { log } from "./logger";

let syncJob: Cron | null = null;
let restartJob: Cron | null = null;

export function startScheduler(onSync: () => void, onRestart: () => void): void {
  if (syncJob) syncJob.stop();
  if (restartJob) restartJob.stop();

  // Sync täglich um 1:00
  syncJob = new Cron("0 1 * * *", onSync);
  log("scheduler", `Sync: täglich 01:00 (nächster: ${syncJob.nextRun()?.toLocaleString("de-DE")})`);

  // Restart täglich um 3:00
  restartJob = new Cron("0 3 * * *", onRestart);
  log("scheduler", `Restart: täglich 03:00 (nächster: ${restartJob.nextRun()?.toLocaleString("de-DE")})`);
}

export function getNextSync(): string | null {
  return syncJob?.nextRun()?.toISOString() ?? null;
}
