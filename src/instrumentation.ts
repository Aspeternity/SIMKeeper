export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.SIMKEEPER_BUILD_TIME === "true") return;

  const { installGlobeOneFetchAuth } = await import("@/lib/carrier-connectors/providers/globe-transport");
  installGlobeOneFetchAuth();

  const { ensureBalanceTimestampTriggers } = await import("@/lib/balance-timestamps");
  const { ensureConditionEpisodeTables } = await import("@/lib/condition-episodes");
  ensureBalanceTimestampTriggers();
  ensureConditionEpisodeTables();

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
    const { ensureCarrierBalanceProjection } = await import("@/lib/carrier-connectors/balance-projection");
    ensureCarrierConnectorTables();
    ensureCarrierBalanceProjection();
    startCarrierConnectorScheduler();
  }
}
