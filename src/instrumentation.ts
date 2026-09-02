export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.SIMKEEPER_BUILD_TIME === "true") return;

  const globalState = globalThis as typeof globalThis & { __simkeeperNotificationSchedulerStarted?: boolean };
  if (globalState.__simkeeperNotificationSchedulerStarted) return;
  globalState.__simkeeperNotificationSchedulerStarted = true;

  const { ensureNotificationTables, startNotificationScheduler } = await import("@/lib/notifications");
  ensureNotificationTables();
  startNotificationScheduler();
}
