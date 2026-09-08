import "server-only";

import { sqlite } from "@/db";
import {
  ensureCarrierConnectorTables,
  listCarrierConnectors,
} from "@/lib/carrier-connectors/store";
import type { ReminderItem } from "@/lib/reminders";

export type ConditionEpisodeStatus = "open" | "resolved";

export type ConditionEpisodeRecord = {
  id: number;
  conditionKey: string;
  conditionType: string;
  subjectType: string;
  subjectId: number;
  episodeNo: number;
  status: ConditionEpisodeStatus;
  openedAt: string;
  resolvedAt: string | null;
  lastObservedAt: string;
  snapshot: Record<string, unknown>;
};

type RawEpisode = {
  id: number;
  condition_key: string;
  condition_type: string;
  subject_type: string;
  subject_id: number;
  episode_no: number;
  status: string;
  opened_at: string;
  resolved_at: string | null;
  last_observed_at: string;
  snapshot_json: string | null;
};

type LowBalanceSimRow = {
  id: number;
  label: string;
  phone_number: string | null;
  status: string;
  balance: number | null;
  currency_code: string | null;
  balance_updated_at: string | null;
  low_balance_enabled: number;
  low_balance_threshold: number | null;
  auto_balance_eligible: number;
  carrier_name: string;
  country: string;
};

type SyncHealthConditionType = "sync_authentication" | "sync_failure" | "sync_stale";
const SYNC_HEALTH_CONDITION_TYPES: SyncHealthConditionType[] = [
  "sync_authentication",
  "sync_failure",
  "sync_stale",
];
const RECOVERY_LOOKBACK_MS = 14 * 24 * 60 * 60_000;

export function ensureConditionEpisodeTables() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS condition_episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      condition_key TEXT NOT NULL,
      condition_type TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id INTEGER NOT NULL,
      episode_no INTEGER NOT NULL,
      status TEXT NOT NULL,
      opened_at TEXT NOT NULL,
      resolved_at TEXT,
      last_observed_at TEXT NOT NULL,
      snapshot_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_condition_episodes_occurrence
      ON condition_episodes(condition_key, episode_no);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_condition_episodes_open
      ON condition_episodes(condition_key)
      WHERE status = 'open';
    CREATE INDEX IF NOT EXISTS idx_condition_episodes_subject
      ON condition_episodes(subject_type, subject_id, status);
    CREATE INDEX IF NOT EXISTS idx_condition_episodes_type_status
      ON condition_episodes(condition_type, status);
  `);
}

function parseSnapshot(value: string | null) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function mapEpisode(row: RawEpisode): ConditionEpisodeRecord {
  return {
    id: row.id,
    conditionKey: row.condition_key,
    conditionType: row.condition_type,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    episodeNo: row.episode_no,
    status: row.status === "resolved" ? "resolved" : "open",
    openedAt: row.opened_at,
    resolvedAt: row.resolved_at,
    lastObservedAt: row.last_observed_at,
    snapshot: parseSnapshot(row.snapshot_json),
  };
}

function selectEpisodeById(id: number) {
  const row = sqlite
    .prepare(
      `SELECT id, condition_key, condition_type, subject_type, subject_id, episode_no,
              status, opened_at, resolved_at, last_observed_at, snapshot_json
       FROM condition_episodes WHERE id = ?`,
    )
    .get(id) as RawEpisode | undefined;
  return row ? mapEpisode(row) : null;
}

function getOpenEpisode(conditionKey: string) {
  const row = sqlite
    .prepare(
      `SELECT id, condition_key, condition_type, subject_type, subject_id, episode_no,
              status, opened_at, resolved_at, last_observed_at, snapshot_json
       FROM condition_episodes
       WHERE condition_key = ? AND status = 'open'
       LIMIT 1`,
    )
    .get(conditionKey) as RawEpisode | undefined;
  return row ? mapEpisode(row) : null;
}

function nextEpisodeNo(conditionKey: string) {
  const row = sqlite
    .prepare("SELECT MAX(episode_no) AS value FROM condition_episodes WHERE condition_key = ?")
    .get(conditionKey) as { value?: number | null } | undefined;
  return Math.max(0, Number(row?.value) || 0) + 1;
}

function openEpisode(input: {
  conditionKey: string;
  conditionType: string;
  subjectType: string;
  subjectId: number;
  snapshot: Record<string, unknown>;
  observedAt: string;
}) {
  const episodeNo = nextEpisodeNo(input.conditionKey);
  const result = sqlite
    .prepare(
      `INSERT INTO condition_episodes (
         condition_key, condition_type, subject_type, subject_id, episode_no, status,
         opened_at, resolved_at, last_observed_at, snapshot_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'open', ?, NULL, ?, ?, ?, ?)`,
    )
    .run(
      input.conditionKey,
      input.conditionType,
      input.subjectType,
      input.subjectId,
      episodeNo,
      input.observedAt,
      input.observedAt,
      JSON.stringify(input.snapshot),
      input.observedAt,
      input.observedAt,
    );
  const episode = selectEpisodeById(Number(result.lastInsertRowid));
  if (!episode) throw new Error("Condition episode 创建失败");
  return episode;
}

function observeEpisode(episode: ConditionEpisodeRecord, snapshot: Record<string, unknown>, observedAt: string) {
  const nextSnapshot = JSON.stringify(snapshot);
  sqlite
    .prepare(
      `UPDATE condition_episodes
       SET last_observed_at = ?, snapshot_json = ?, updated_at = ?
       WHERE id = ? AND status = 'open'`,
    )
    .run(observedAt, nextSnapshot, observedAt, episode.id);
  return { ...episode, lastObservedAt: observedAt, snapshot };
}

function resolveEpisode(episode: ConditionEpisodeRecord, observedAt: string) {
  sqlite
    .prepare(
      `UPDATE condition_episodes
       SET status = 'resolved', resolved_at = ?, last_observed_at = ?, updated_at = ?
       WHERE id = ? AND status = 'open'`,
    )
    .run(observedAt, observedAt, observedAt, episode.id);
}

function lowBalanceConditionKey(simId: number) {
  return `low_balance:sim:${simId}`;
}

function balanceConditionEligibleStatus(status: string) {
  return status === "active" || status === "paused";
}

function formatAmount(value: number) {
  return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 6 });
}

function formatObservedAt(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function getLowBalanceReminderItems(): ReminderItem[] {
  ensureConditionEpisodeTables();
  ensureCarrierConnectorTables();
  const observedAt = new Date().toISOString();
  const sims = sqlite
    .prepare(
      `SELECT s.id, s.label, s.phone_number, s.status, s.balance, s.currency_code,
              s.balance_updated_at, s.low_balance_enabled, s.low_balance_threshold,
              CASE WHEN EXISTS (
                SELECT 1
                FROM carrier_connector_sims l
                JOIN carrier_connectors cc ON cc.id = l.connector_id
                WHERE l.sim_id = s.id
                  AND cc.provider <> 'mock'
                  AND cc.sync_interval_minutes > 0
                  AND cc.last_success_at IS NOT NULL
                  AND (
                    SELECT ss.balance
                    FROM sim_sync_snapshots ss
                    WHERE ss.sim_id = s.id
                      AND ss.connector_id = cc.id
                      AND ss.source_provider <> 'mock'
                    ORDER BY ss.synced_at DESC, ss.id DESC
                    LIMIT 1
                  ) IS NOT NULL
              ) THEN 1 ELSE 0 END AS auto_balance_eligible,
              c.name AS carrier_name, c.country
       FROM sim_cards s
       JOIN carriers c ON c.id = s.carrier_id
       ORDER BY s.id`,
    )
    .all() as LowBalanceSimRow[];

  const activeItems: ReminderItem[] = [];

  sqlite.transaction(() => {
    for (const sim of sims) {
      const conditionKey = lowBalanceConditionKey(sim.id);
      const currentEpisode = getOpenEpisode(conditionKey);
      const autoBalanceEligible = Boolean(sim.auto_balance_eligible);

      if (!autoBalanceEligible && sim.low_balance_enabled) {
        sqlite
          .prepare("UPDATE sim_cards SET low_balance_enabled = 0, updated_at = ? WHERE id = ?")
          .run(observedAt, sim.id);
        sim.low_balance_enabled = 0;
      }

      const enabled = autoBalanceEligible
        && Boolean(sim.low_balance_enabled)
        && sim.low_balance_threshold !== null
        && Number.isFinite(sim.low_balance_threshold)
        && sim.low_balance_threshold >= 0
        && balanceConditionEligibleStatus(sim.status);
      const active = enabled
        && sim.balance !== null
        && Number.isFinite(sim.balance)
        && sim.balance <= (sim.low_balance_threshold as number);

      if (!active) {
        if (currentEpisode) resolveEpisode(currentEpisode, observedAt);
        continue;
      }

      const currencyCode = sim.currency_code || "";
      const snapshot = {
        balance: sim.balance,
        threshold: sim.low_balance_threshold,
        currencyCode: currencyCode || null,
        balanceUpdatedAt: sim.balance_updated_at,
      };
      const episode = currentEpisode
        ? observeEpisode(currentEpisode, snapshot, observedAt)
        : openEpisode({
            conditionKey,
            conditionType: "low_balance",
            subjectType: "sim",
            subjectId: sim.id,
            snapshot,
            observedAt,
          });
      const balanceLabel = `${formatAmount(sim.balance as number)}${currencyCode ? ` ${currencyCode}` : ""}`;
      const thresholdLabel = `${formatAmount(sim.low_balance_threshold as number)}${currencyCode ? ` ${currencyCode}` : ""}`;
      const updatedLabel = formatObservedAt(sim.balance_updated_at);

      activeItems.push({
        key: `low-balance-${sim.id}-episode-${episode.episodeNo}`,
        simId: sim.id,
        simLabel: sim.label,
        phoneNumber: sim.phone_number,
        carrierName: sim.carrier_name,
        country: sim.country,
        kind: "low_balance",
        title: "余额不足",
        dueDate: null,
        status: "condition",
        days: null,
        href: "/sims",
        detail: `当前余额 ${balanceLabel} · 提醒阈值 ${thresholdLabel}${updatedLabel ? ` · 余额更新 ${updatedLabel}` : ""}`,
        requirement: `余额需高于 ${thresholdLabel}`,
        conditionState: "active",
      });
    }
  })();

  return activeItems;
}

function syncHealthConditionKey(type: SyncHealthConditionType, connectorId: number) {
  return `${type}:connector:${connectorId}`;
}

function desiredSyncHealthConditionType(healthStatus: string): SyncHealthConditionType | null {
  if (healthStatus === "authentication") return "sync_authentication";
  if (healthStatus === "error") return "sync_failure";
  if (healthStatus === "stale") return "sync_stale";
  return null;
}

function syncHealthTitle(type: SyncHealthConditionType) {
  if (type === "sync_authentication") return "运营商认证失效";
  if (type === "sync_stale") return "同步数据已过期";
  return "运营商同步异常";
}

function syncHealthRequirement(type: SyncHealthConditionType) {
  if (type === "sync_authentication") return "请更新运营商登录凭据并重新同步";
  if (type === "sync_stale") return "请立即同步并检查运营商连接";
  return "请检查连接状态并重新同步";
}

function syncHealthDetail(
  connector: ReturnType<typeof listCarrierConnectors>[number],
  type: SyncHealthConditionType,
) {
  const parts = [`${connector.providerLabel} · ${connector.name}`];
  const lastAttempt = formatObservedAt(connector.lastAttemptAt);
  const lastSuccess = formatObservedAt(connector.lastSuccessAt);
  const dataUpdated = formatObservedAt(connector.dataUpdatedAt);
  if (type === "sync_authentication" && connector.lastError) parts.push(connector.lastError);
  if (type === "sync_failure") {
    parts.push(`连续失败 ${Math.max(1, connector.failureCount)} 次`);
    if (connector.lastError) parts.push(connector.lastError);
  }
  if (type === "sync_stale") parts.push("当前自动同步数据已超过可信新鲜度窗口");
  if (lastAttempt) parts.push(`最后尝试 ${lastAttempt}`);
  if (lastSuccess) parts.push(`最后成功 ${lastSuccess}`);
  if (dataUpdated) parts.push(`数据更新 ${dataUpdated}`);
  return parts.join(" · ");
}

function syncHealthSnapshot(connector: ReturnType<typeof listCarrierConnectors>[number]) {
  return {
    provider: connector.provider,
    providerLabel: connector.providerLabel,
    connectorName: connector.name,
    healthStatus: connector.healthStatus,
    lastAttemptAt: connector.lastAttemptAt,
    lastSuccessAt: connector.lastSuccessAt,
    dataUpdatedAt: connector.dataUpdatedAt,
    lastError: connector.lastError,
    lastErrorType: connector.lastErrorType,
    lastErrorAt: connector.lastErrorAt,
    failureCount: connector.failureCount,
    nextRetryAt: connector.nextRetryAt,
    retryCount: connector.retryCount,
  };
}

export function getSyncHealthReminderItems(): ReminderItem[] {
  ensureConditionEpisodeTables();
  ensureCarrierConnectorTables();
  const observedAt = new Date().toISOString();
  const connectors = listCarrierConnectors();
  const desired = new Map<string, {
    connector: ReturnType<typeof listCarrierConnectors>[number];
    type: SyncHealthConditionType;
  }>();

  for (const connector of connectors) {
    if (connector.provider === "mock" || connector.syncIntervalMinutes <= 0 || !connector.linkedSims.length) continue;
    const type = desiredSyncHealthConditionType(connector.healthStatus);
    if (!type) continue;
    desired.set(syncHealthConditionKey(type, connector.id), { connector, type });
  }

  const items: ReminderItem[] = [];
  sqlite.transaction(() => {
    const openHealthEpisodes = sqlite
      .prepare(
        `SELECT id, condition_key, condition_type, subject_type, subject_id, episode_no,
                status, opened_at, resolved_at, last_observed_at, snapshot_json
         FROM condition_episodes
         WHERE status = 'open'
           AND condition_type IN ('sync_authentication', 'sync_failure', 'sync_stale')`,
      )
      .all() as RawEpisode[];

    for (const row of openHealthEpisodes) {
      if (!desired.has(row.condition_key)) resolveEpisode(mapEpisode(row), observedAt);
    }

    for (const [conditionKey, candidate] of desired) {
      const { connector, type } = candidate;
      const sim = connector.linkedSims[0];
      if (!sim) continue;
      const snapshot = syncHealthSnapshot(connector);
      const currentEpisode = getOpenEpisode(conditionKey);
      const episode = currentEpisode
        ? observeEpisode(currentEpisode, snapshot, observedAt)
        : openEpisode({
            conditionKey,
            conditionType: type,
            subjectType: "connector",
            subjectId: connector.id,
            snapshot,
            observedAt,
          });

      items.push({
        key: `sync-health-${connector.id}-${type}-episode-${episode.episodeNo}`,
        simId: sim.id,
        simLabel: sim.label,
        phoneNumber: sim.phoneNumber,
        carrierName: sim.carrierName,
        country: sim.country,
        kind: "sync_health",
        title: syncHealthTitle(type),
        dueDate: null,
        status: "condition",
        days: null,
        href: "/sims",
        detail: syncHealthDetail(connector, type),
        requirement: syncHealthRequirement(type),
        conditionState: "active",
      });
    }
  })();

  return items;
}

export function getSyncHealthRecoveryNotificationItems(): ReminderItem[] {
  ensureConditionEpisodeTables();
  ensureCarrierConnectorTables();
  const cutoff = new Date(Date.now() - RECOVERY_LOOKBACK_MS).toISOString();
  const connectors = new Map(listCarrierConnectors().map((connector) => [connector.id, connector]));
  const rows = sqlite
    .prepare(
      `SELECT ce.id, ce.condition_key, ce.condition_type, ce.subject_type, ce.subject_id,
              ce.episode_no, ce.status, ce.opened_at, ce.resolved_at, ce.last_observed_at,
              ce.snapshot_json
       FROM condition_episodes ce
       WHERE ce.status = 'resolved'
         AND ce.resolved_at >= ?
         AND ce.condition_type IN ('sync_authentication', 'sync_failure', 'sync_stale')
         AND ce.id = (
           SELECT MAX(latest.id)
           FROM condition_episodes latest
           WHERE latest.subject_type = 'connector'
             AND latest.subject_id = ce.subject_id
             AND latest.condition_type IN ('sync_authentication', 'sync_failure', 'sync_stale')
         )
       ORDER BY ce.resolved_at DESC`,
    )
    .all(cutoff) as RawEpisode[];

  const items: ReminderItem[] = [];
  for (const row of rows) {
    const episode = mapEpisode(row);
    const connector = connectors.get(episode.subjectId);
    if (!connector || connector.healthStatus !== "healthy") continue;
    const sim = connector.linkedSims[0];
    if (!sim) continue;
    const recoveredAt = formatObservedAt(episode.resolvedAt);
    const successAt = formatObservedAt(connector.lastSuccessAt);
    items.push({
      key: `sync-health-recovery-episode-${episode.id}`,
      simId: sim.id,
      simLabel: sim.label,
      phoneNumber: sim.phoneNumber,
      carrierName: sim.carrierName,
      country: sim.country,
      kind: "sync_health",
      title: "运营商同步已恢复",
      dueDate: null,
      status: "condition",
      days: null,
      href: "/sims",
      detail: `${connector.providerLabel} · ${connector.name} 已恢复正常${successAt ? ` · 最近成功 ${successAt}` : ""}${recoveredAt ? ` · 恢复于 ${recoveredAt}` : ""}`,
      requirement: null,
      conditionState: "recovered",
      notificationPolicy: "once",
    });
  }
  return items;
}
