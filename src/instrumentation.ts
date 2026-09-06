export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.SIMKEEPER_BUILD_TIME === "true") return;

  const globalState = globalThis as typeof globalThis & {
    __simkeeperNotificationSchedulerStarted?: boolean;
    __simkeeperCarrierConnectorSchedulerStarted?: boolean;
  };

  if (!globalState.__simkeeperNotificationSchedulerStarted) {
    globalState.__simkeeperNotificationSchedulerStarted = true;
    const { ensureNotificationTables, startNotificationScheduler } = await import("@/lib/notifications");
    ensureNotificationTables();
    startNotificationScheduler();
  }

  if (!globalState.__simkeeperCarrierConnectorSchedulerStarted) {
    globalState.__simkeeperCarrierConnectorSchedulerStarted = true;
    const {
      ensureCarrierConnectorTables,
      startCarrierConnectorScheduler,
    } = await import("@/lib/carrier-connectors/store");
    ensureCarrierConnectorTables();
    startCarrierConnectorScheduler();
  }
}
