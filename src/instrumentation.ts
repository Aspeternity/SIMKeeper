export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.SIMKEEPER_BUILD_TIME === "true") return;

  const { installGlobeOneFetchAuth } = await import("@/lib/carrier-connectors/providers/globe-transport");
  installGlobeOneFetchAuth();

  const { ensureBalanceTimestampTriggers } = await import("@/lib/balance-timestamps");
  const { ensureConditionEpisodeTables } = await import("@/lib/condition-episodes");
  const { ensureSimLifecycleTables } = await import("@/lib/sim-lifecycle");
  ensureBalanceTimestampTriggers();
  ensureConditionEpisodeTables();
  ensureSimLifecycleTables();

  const globalState = globalThis as typeof globalThis & {
    __simkeeperNotificationSchedulerStarted?: boolean;
    __simkeeperCarrierConnectorSchedulerStarted?: boolean;
    __simkeeperRemoteBackupSchedulerStarted?: boolean;
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
    const { ensureCarrierConnectorDiagnosticTables } = await import("@/lib/carrier-connectors/diagnostics");
    ensureCarrierConnectorTables();
    ensureCarrierBalanceProjection();
    ensureCarrierConnectorDiagnosticTables();
    startCarrierConnectorScheduler();
  }

  if (!globalState.__simkeeperRemoteBackupSchedulerStarted) {
    globalState.__simkeeperRemoteBackupSchedulerStarted = true;
    const { getRemoteBackupConfig, startRemoteBackupScheduler } = await import("@/lib/remote-backups");
    // Materialize the stable instance identity before the first alpha.50 backup
    // snapshot so the ID itself is part of the portable backup.
    getRemoteBackupConfig();
    startRemoteBackupScheduler();
  }
}
