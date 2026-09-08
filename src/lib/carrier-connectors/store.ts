import "server-only";

import { sqlite } from "@/db";
import {
  decryptCarrierConnectorCredential,
  encryptCarrierConnectorCredential,
} from "@/lib/credential-crypto";
import {
  classifyCarrierProviderError,
  isRetryableCarrierProviderErrorType,
} from "@/lib/carrier-connectors/errors";
import { getCarrierConnectorProvider } from "@/lib/carrier-connectors/registry";
import type {
  CarrierConnectorHealthStatus,
  CarrierConnectorStatus,
  CarrierProviderErrorType,
  ConnectorAccountStatus,
  NormalizedCarrierSyncResult,
} from "@/lib/carrier-connectors/types";

const MAX_SNAPSHOTS_PER_SIM = 100;
const SCHEDULER_SCAN_MS = 60_000;
const SCHEDULER_INITIAL_DELAY_MS = 5_000;
const MAX_AUTOMATIC_RETRIES = 4;
const MAX_RETRY_DELAY_MS = 6 * 60 * 60_000;
const TEMPORARY_RETRY_DELAYS_MS = [60_000, 3 * 60_000, 10 * 60_000, 30 * 60_000] as const;
const SYNC_HEALTH_STALE_MINIMUM_MINUTES = 12 * 60;

const ERROR_TYPE_VALUES = new Set<CarrierProviderErrorType>([
  "temporary",
  "authentication",
  "rate_limit",
  "maintenance",
  "configuration",
  "unsupported",
  "permanent",
]);

export type CarrierConnectorMutationInput = {
  name: string;
  provider: string;
  syncIntervalMinutes: number;
  simIds: number[];
  providerConfig: Record<string, unknown>;
  credentials?: Record<string, string>;
  clearCredentials?: boolean;
};

type RawConnector = {
  id: number;
  name: string;
  provider: string;
  status: CarrierConnectorStatus;
  sync_interval_minutes: number;
  provider_config: string | null;
  credentials_encrypted: string | null;
  last_synced_at: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_error_type: string | null;
  last_error_at: string | null;
  failure_count: number;
  created_at: string;
  updated_at: string;
};

type RawLinkedSim = {
  id: number;
  label: string;
  phone_number: string | null;
  carrier_name: string;
  country: string;
  country_code: string;
  balance: number | null;
  currency_code: string | null;
};

type RawSnapshot = {
  id: number;
  sim_id: number;
  connector_id: number | null;
  source_name: string;
  source_provider: string;
  balance: number | null;
  currency_code: string | null;
  balance_valid_until: string | null;
  account_status: ConnectorAccountStatus;
  synced_at: string;
};

type RawRetryState = {
  retry_at: string;
  attempt_count: number;
};

type SyncError = {
  simId: number;
  simLabel: string;
  error: string;
  type: CarrierProviderErrorType;
  retryAfterMs: number | null;
};

const activeSyncs = new Map<number, Promise<CarrierConnectorSyncRun>>();

function connectorColumns() {
  return new Set(
    (sqlite.prepare("PRAGMA table_info(carrier_connectors)").all() as Array<{ name: string }>).map((row) => row.name),
  );
}

function ensureConnectorColumn(columns: Set<string>, name: string, definition: string) {
  if (columns.has(name)) return;
  sqlite.exec(`ALTER TABLE carrier_connectors ADD COLUMN ${name} ${definition}`);
  columns.add(name);
}

export function ensureCarrierConnectorTables() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS carrier_connectors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'connected',
      sync_interval_minutes INTEGER NOT NULL DEFAULT 720,
      provider_config TEXT,
      credentials_encrypted TEXT,
      last_synced_at TEXT,
      last_attempt_at TEXT,
      last_success_at TEXT,
      last_error TEXT,
      last_error_type TEXT,
      last_error_at TEXT,
      failure_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_carrier_connectors_provider
      ON carrier_connectors(provider);
    CREATE INDEX IF NOT EXISTS idx_carrier_connectors_status
      ON carrier_connectors(status);

    CREATE TABLE IF NOT EXISTS carrier_connector_sims (
      connector_id INTEGER NOT NULL,
      sim_id INTEGER NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (connector_id, sim_id),
      FOREIGN KEY (connector_id) REFERENCES carrier_connectors(id) ON DELETE CASCADE,
      FOREIGN KEY (sim_id) REFERENCES sim_cards(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_carrier_connector_sims_connector
      ON carrier_connector_sims(connector_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_carrier_connector_sims_sim
      ON carrier_connector_sims(sim_id);

    CREATE TABLE IF NOT EXISTS sim_sync_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sim_id INTEGER NOT NULL,
      connector_id INTEGER,
      source_name TEXT NOT NULL,
      source_provider TEXT NOT NULL,
      balance REAL,
      currency_code TEXT,
      balance_valid_until TEXT,
      account_status TEXT NOT NULL DEFAULT 'unknown',
      synced_at TEXT NOT NULL,
      FOREIGN KEY (sim_id) REFERENCES sim_cards(id) ON DELETE CASCADE,
      FOREIGN KEY (connector_id) REFERENCES carrier_connectors(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sim_sync_snapshots_sim_time
      ON sim_sync_snapshots(sim_id, synced_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_sim_sync_snapshots_connector
      ON sim_sync_snapshots(connector_id);

    CREATE TABLE IF NOT EXISTS carrier_connector_retries (
      connector_id INTEGER PRIMARY KEY,
      retry_at TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (connector_id) REFERENCES carrier_connectors(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_carrier_connector_retries_at
      ON carrier_connector_retries(retry_at);
  `);

  const columns = connectorColumns();
  ensureConnectorColumn(columns, "last_attempt_at", "TEXT");
  ensureConnectorColumn(columns, "last_error_type", "TEXT");
  ensureConnectorColumn(columns, "last_error_at", "TEXT");
  ensureConnectorColumn(columns, "failure_count", "INTEGER NOT NULL DEFAULT 0");

  sqlite.exec(`
    UPDATE carrier_connectors
    SET last_attempt_at = last_synced_at
    WHERE last_attempt_at IS NULL AND last_synced_at IS NOT NULL;
    UPDATE carrier_connectors
    SET failure_count = 0
    WHERE failure_count IS NULL;
  `);
}

function parseObject(value: string | null | undefined): Record<string, unknown> {
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

function normalizeCredentials(value: Record<string, string> | undefined) {
  if (!value) return undefined;
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key.trim(), item.trim()] as const)
      .filter(([key, item]) => Boolean(key) && Boolean(item)),
  );
}

function decryptCredentials(row: RawConnector) {
  if (!row.credentials_encrypted) return {};
  const plaintext = decryptCarrierConnectorCredential(row.credentials_encrypted);
  const parsed = parseObject(plaintext);
  return Object.fromEntries(
    Object.entries(parsed)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([key, value]) => [key, value]),
  );
}

const CONNECTOR_SELECT = `id, name, provider, status, sync_interval_minutes, provider_config,
  credentials_encrypted, last_synced_at, last_attempt_at, last_success_at, last_error,
  last_error_type, last_error_at, failure_count, created_at, updated_at`;

function getRawConnector(id: number) {
  ensureCarrierConnectorTables();
  return sqlite
    .prepare(`SELECT ${CONNECTOR_SELECT} FROM carrier_connectors WHERE id = ?`)
    .get(id) as RawConnector | undefined;
}

function listRawConnectors() {
  ensureCarrierConnectorTables();
  return sqlite
    .prepare(`SELECT ${CONNECTOR_SELECT} FROM carrier_connectors ORDER BY name COLLATE NOCASE, id`)
    .all() as RawConnector[];
}

function listLinkedSimRows(connectorId: number) {
  ensureCarrierConnectorTables();
  return sqlite
    .prepare(
      `SELECT s.id, s.label, s.phone_number, c.name AS carrier_name, c.country, c.country_code,
              s.balance, s.currency_code
       FROM carrier_connector_sims l
       JOIN sim_cards s ON s.id = l.sim_id
       JOIN carriers c ON c.id = s.carrier_id
       WHERE l.connector_id = ?
       ORDER BY c.name COLLATE NOCASE, s.label COLLATE NOCASE, s.id`,
    )
    .all(connectorId) as RawLinkedSim[];
}

function getLatestSnapshotRow(simId: number) {
  ensureCarrierConnectorTables();
  return sqlite
    .prepare(
      `SELECT id, sim_id, connector_id, source_name, source_provider, balance,
              currency_code, balance_valid_until, account_status, synced_at
       FROM sim_sync_snapshots
       WHERE sim_id = ?
       ORDER BY synced_at DESC, id DESC
       LIMIT 1`,
    )
    .get(simId) as RawSnapshot | undefined;
}

function getLatestConnectorSnapshotRow(simId: number, connectorId: number) {
  ensureCarrierConnectorTables();
  return sqlite
    .prepare(
      `SELECT id, sim_id, connector_id, source_name, source_provider, balance,
              currency_code, balance_valid_until, account_status, synced_at
       FROM sim_sync_snapshots
       WHERE sim_id = ? AND connector_id = ?
       ORDER BY synced_at DESC, id DESC
       LIMIT 1`,
    )
    .get(simId, connectorId) as RawSnapshot | undefined;
}

function connectorDataUpdatedAt(connectorId: number) {
  const row = sqlite
    .prepare(
      `SELECT MAX(ss.synced_at) AS data_updated_at
       FROM sim_sync_snapshots ss
       JOIN carrier_connector_sims l
         ON l.sim_id = ss.sim_id AND l.connector_id = ss.connector_id
       WHERE l.connector_id = ? AND ss.connector_id = ?`,
    )
    .get(connectorId, connectorId) as { data_updated_at: string | null } | undefined;
  return row?.data_updated_at ?? null;
}

function getConnectorRetryState(connectorId: number) {
  return sqlite
    .prepare(
      `SELECT retry_at, attempt_count
       FROM carrier_connector_retries
       WHERE connector_id = ?`,
    )
    .get(connectorId) as RawRetryState | undefined;
}

function clearConnectorRetry(connectorId: number) {
  sqlite.prepare("DELETE FROM carrier_connector_retries WHERE connector_id = ?").run(connectorId);
}

function defaultRetryDelay(type: CarrierProviderErrorType, attempt: number) {
  if (type === "maintenance") return 3 * 60_000;
  if (type === "rate_limit") return 5 * 60_000;
  return TEMPORARY_RETRY_DELAYS_MS[Math.min(attempt - 1, TEMPORARY_RETRY_DELAYS_MS.length - 1)] ?? 30 * 60_000;
}

function scheduleConnectorRetry(
  connectorId: number,
  type: CarrierProviderErrorType,
  requestedDelayMs: number | null,
) {
  const current = getConnectorRetryState(connectorId);
  const attempt = (current?.attempt_count ?? 0) + 1;
  if (attempt > MAX_AUTOMATIC_RETRIES) {
    clearConnectorRetry(connectorId);
    return null;
  }

  const requested = requestedDelayMs && Number.isFinite(requestedDelayMs) && requestedDelayMs > 0
    ? requestedDelayMs
    : defaultRetryDelay(type, attempt);
  const delay = Math.max(60_000, Math.min(MAX_RETRY_DELAY_MS, Math.round(requested)));
  const retryAt = new Date(Date.now() + delay).toISOString();
  const updatedAt = new Date().toISOString();

  sqlite
    .prepare(
      `INSERT INTO carrier_connector_retries (connector_id, retry_at, attempt_count, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(connector_id) DO UPDATE SET
         retry_at = excluded.retry_at,
         attempt_count = excluded.attempt_count,
         updated_at = excluded.updated_at`,
    )
    .run(connectorId, retryAt, attempt, updatedAt);

  return { retryAt, attempt };
}

function staleAfterMinutes(syncIntervalMinutes: number) {
  if (syncIntervalMinutes <= 0) return 7 * 24 * 60;
  return Math.max(SYNC_HEALTH_STALE_MINIMUM_MINUTES, syncIntervalMinutes * 3);
}

function isStale(
  syncedAt: string | null | undefined,
  syncIntervalMinutes: number,
  connectorPresent = true,
) {
  if (!connectorPresent || !syncedAt) return true;
  const timestamp = Date.parse(syncedAt);
  if (!Number.isFinite(timestamp)) return true;
  return Date.now() - timestamp > staleAfterMinutes(syncIntervalMinutes) * 60_000;
}

function mapSnapshot(
  row: RawSnapshot | undefined,
  syncIntervalMinutes: number,
  connectorPresent = true,
) {
  if (!row) return null;
  return {
    id: row.id,
    simId: row.sim_id,
    connectorId: row.connector_id,
    sourceName: row.source_name,
    sourceProvider: row.source_provider,
    balance: row.balance,
    currencyCode: row.currency_code,
    balanceValidUntil: row.balance_valid_until,
    accountStatus: row.account_status,
    syncedAt: row.synced_at,
    stale: isStale(row.synced_at, syncIntervalMinutes, connectorPresent),
  };
}

function inferredErrorType(row: RawConnector): CarrierProviderErrorType | null {
  if (row.last_error_type && ERROR_TYPE_VALUES.has(row.last_error_type as CarrierProviderErrorType)) {
    return row.last_error_type as CarrierProviderErrorType;
  }
  if (!row.last_error) return null;
  return classifyCarrierProviderError(new Error(row.last_error)).type;
}

function nextScheduledSyncAt(row: RawConnector) {
  if (row.sync_interval_minutes <= 0) return null;
  const previousValue = row.last_attempt_at ?? row.last_synced_at;
  if (!previousValue) return null;
  const previous = Date.parse(previousValue);
  if (!Number.isFinite(previous)) return null;
  return new Date(previous + row.sync_interval_minutes * 60_000).toISOString();
}

function connectorDataIsStale(row: RawConnector) {
  if (row.sync_interval_minutes <= 0) return false;
  const reference = row.last_success_at ?? row.created_at;
  return isStale(reference, row.sync_interval_minutes, true);
}

function connectorHealthStatus(row: RawConnector): CarrierConnectorHealthStatus {
  if (row.sync_interval_minutes <= 0) return "paused";
  if (activeSyncs.has(row.id)) return "syncing";
  if (getConnectorRetryState(row.id)) return "retrying";

  const errorType = inferredErrorType(row);
  if (row.status === "error") {
    if (errorType === "authentication") return "authentication";
    return "error";
  }
  if (connectorDataIsStale(row)) return "stale";
  if (!row.last_success_at) return "pending";
  return "healthy";
}

function linkedSimsForConnector(row: RawConnector) {
  return listLinkedSimRows(row.id).map((sim) => ({
    id: sim.id,
    label: sim.label,
    phoneNumber: sim.phone_number,
    carrierName: sim.carrier_name,
    country: sim.country,
    countryCode: sim.country_code,
    latestSnapshot: mapSnapshot(
      getLatestConnectorSnapshotRow(sim.id, row.id),
      row.sync_interval_minutes,
      true,
    ),
  }));
}

function mapConnector(row: RawConnector) {
  const provider = getCarrierConnectorProvider(row.provider);
  const retry = getConnectorRetryState(row.id);
  const scheduledSyncAt = nextScheduledSyncAt(row);
  const dataUpdatedAt = connectorDataUpdatedAt(row.id);
  const healthStatus = connectorHealthStatus(row);
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    providerLabel: provider?.label ?? row.provider,
    status: row.status,
    healthStatus,
    syncIntervalMinutes: row.sync_interval_minutes,
    providerConfig: parseObject(row.provider_config),
    hasCredentials: Boolean(row.credentials_encrypted),
    lastSyncedAt: row.last_synced_at,
    lastAttemptAt: row.last_attempt_at ?? row.last_synced_at,
    lastSuccessAt: row.last_success_at,
    dataUpdatedAt,
    lastError: row.last_error,
    lastErrorType: inferredErrorType(row),
    lastErrorAt: row.last_error_at,
    failureCount: row.failure_count ?? 0,
    retryAt: retry?.retry_at ?? null,
    retryAttempt: retry?.attempt_count ?? 0,
    nextRetryAt: retry?.retry_at ?? null,
    retryCount: retry?.attempt_count ?? 0,
    scheduledSyncAt,
    nextSyncAt: retry?.retry_at ?? scheduledSyncAt,
    stale: connectorDataIsStale(row),
    linkedSims: linkedSimsForConnector(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listCarrierConnectors() {
  return listRawConnectors().map(mapConnector);
}

export function getCarrierConnector(id: number) {
  const row = getRawConnector(id);
  return row ? mapConnector(row) : null;
}

function validateProvider(providerId: string) {
  const provider = getCarrierConnectorProvider(providerId);
  if (!provider) throw new Error("不支持的运营商连接 Provider");
  return provider;
}

function validateSimAssignments(simIds: number[], currentConnectorId?: number) {
  const uniqueIds = Array.from(new Set(simIds));
  if (uniqueIds.length !== simIds.length) throw new Error("关联号码不能重复");
  if (!uniqueIds.length) return;

  const placeholders = uniqueIds.map(() => "?").join(",");
  const found = sqlite
    .prepare(`SELECT id FROM sim_cards WHERE id IN (${placeholders})`)
    .all(...uniqueIds) as Array<{ id: number }>;
  if (found.length !== uniqueIds.length) throw new Error("部分待关联号码已不存在");

  const occupied = sqlite
    .prepare(
      `SELECT sim_id, connector_id
       FROM carrier_connector_sims
       WHERE sim_id IN (${placeholders})`,
    )
    .all(...uniqueIds) as Array<{ sim_id: number; connector_id: number }>;

  const conflict = occupied.find((item) => item.connector_id !== currentConnectorId);
  if (conflict) throw new Error("有号码已经关联到其他运营商连接，请先解除原连接");
}

function replaceSimAssignments(connectorId: number, simIds: number[], now: string) {
  sqlite.prepare("DELETE FROM carrier_connector_sims WHERE connector_id = ?").run(connectorId);
  const insert = sqlite.prepare(
    "INSERT INTO carrier_connector_sims (connector_id, sim_id, created_at) VALUES (?, ?, ?)",
  );
  for (const simId of simIds) insert.run(connectorId, simId, now);
}

export function createCarrierConnector(input: CarrierConnectorMutationInput) {
  ensureCarrierConnectorTables();
  validateProvider(input.provider);
  validateSimAssignments(input.simIds);

  const normalizedCredentials = normalizeCredentials(input.credentials);
  const credentialsEncrypted = normalizedCredentials && Object.keys(normalizedCredentials).length
    ? encryptCarrierConnectorCredential(JSON.stringify(normalizedCredentials))
    : null;
  const now = new Date().toISOString();

  const id = sqlite.transaction(() => {
    const result = sqlite
      .prepare(
        `INSERT INTO carrier_connectors (
           name, provider, status, sync_interval_minutes, provider_config,
           credentials_encrypted, failure_count, created_at, updated_at
         ) VALUES (?, ?, 'connected', ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        input.name.trim(),
        input.provider,
        input.syncIntervalMinutes,
        JSON.stringify(input.providerConfig ?? {}),
        credentialsEncrypted,
        now,
        now,
      );
    const connectorId = Number(result.lastInsertRowid);
    replaceSimAssignments(connectorId, input.simIds, now);
    return connectorId;
  })();

  return getCarrierConnector(id);
}

export function updateCarrierConnector(id: number, input: CarrierConnectorMutationInput) {
  ensureCarrierConnectorTables();
  const current = getRawConnector(id);
  if (!current) throw new Error("运营商连接不存在");
  if (current.provider !== input.provider) {
    throw new Error("已创建的连接不能切换 Provider，请新建连接");
  }
  validateProvider(input.provider);
  validateSimAssignments(input.simIds, id);

  let credentialsEncrypted = current.credentials_encrypted;
  if (input.clearCredentials) {
    credentialsEncrypted = null;
  } else if (input.credentials !== undefined) {
    const normalizedCredentials = normalizeCredentials(input.credentials) ?? {};
    credentialsEncrypted = Object.keys(normalizedCredentials).length
      ? encryptCarrierConnectorCredential(JSON.stringify(normalizedCredentials))
      : current.credentials_encrypted;
  }

  const now = new Date().toISOString();
  sqlite.transaction(() => {
    sqlite
      .prepare(
        `UPDATE carrier_connectors
         SET name = ?, sync_interval_minutes = ?, provider_config = ?,
             credentials_encrypted = ?, status = 'connected', last_error = NULL,
             last_error_type = NULL, last_error_at = NULL, failure_count = 0,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.name.trim(),
        input.syncIntervalMinutes,
        JSON.stringify(input.providerConfig ?? {}),
        credentialsEncrypted,
        now,
        id,
      );
    replaceSimAssignments(id, input.simIds, now);
    clearConnectorRetry(id);
  })();

  return getCarrierConnector(id);
}

export async function deleteCarrierConnector(id: number) {
  ensureCarrierConnectorTables();
  const row = getRawConnector(id);
  if (!row) throw new Error("运营商连接不存在");

  const provider = getCarrierConnectorProvider(row.provider);
  if (provider?.disconnect) {
    try {
      await provider.disconnect({
        connectorId: row.id,
        connectorName: row.name,
        config: parseObject(row.provider_config),
        credentials: decryptCredentials(row),
      });
    } catch {
      // Local deletion must remain possible even if remote revocation fails.
    }
  }

  sqlite.prepare("DELETE FROM carrier_connectors WHERE id = ?").run(id);
}

function validateSyncResult(result: NormalizedCarrierSyncResult) {
  if (result.balance !== null && (!Number.isFinite(result.balance) || result.balance < 0)) {
    throw new Error("Provider 返回了无效余额");
  }
  if (result.currencyCode !== null && !/^[A-Z]{3}$/.test(result.currencyCode)) {
    throw new Error("Provider 返回了无效币种");
  }
  if (
    result.balanceValidUntil !== null
    && !/^\d{4}-\d{2}-\d{2}$/.test(result.balanceValidUntil)
  ) {
    throw new Error("Provider 返回了无效余额有效期");
  }
  if (!["active", "suspended", "expired", "closed", "unknown"].includes(result.accountStatus)) {
    throw new Error("Provider 返回了无效账户状态");
  }
}

function insertSnapshot(
  connector: RawConnector,
  simId: number,
  result: NormalizedCarrierSyncResult,
  syncedAt: string,
) {
  sqlite
    .prepare(
      `INSERT INTO sim_sync_snapshots (
         sim_id, connector_id, source_name, source_provider, balance, currency_code,
         balance_valid_until, account_status, synced_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      simId,
      connector.id,
      connector.name,
      connector.provider,
      result.balance,
      result.currencyCode,
      result.balanceValidUntil,
      result.accountStatus,
      syncedAt,
    );

  sqlite
    .prepare(
      `DELETE FROM sim_sync_snapshots
       WHERE sim_id = ?
         AND id NOT IN (
           SELECT id FROM sim_sync_snapshots
           WHERE sim_id = ?
           ORDER BY synced_at DESC, id DESC
           LIMIT ?
         )`,
    )
    .run(simId, simId, MAX_SNAPSHOTS_PER_SIM);
}

function dominantErrorType(errors: SyncError[]) {
  const priority: Record<CarrierProviderErrorType, number> = {
    authentication: 70,
    configuration: 60,
    unsupported: 55,
    permanent: 50,
    rate_limit: 30,
    maintenance: 20,
    temporary: 10,
  };
  return [...errors].sort((a, b) => priority[b.type] - priority[a.type])[0]?.type ?? null;
}

export type CarrierConnectorSyncRun = {
  ok: boolean;
  connectorId: number;
  synced: number;
  failed: number;
  lastSyncedAt: string;
  lastAttemptAt: string;
  retryAt: string | null;
  retryCount: number;
  errorType: CarrierProviderErrorType | null;
  errors: Array<{
    simId: number;
    simLabel: string;
    error: string;
    type: CarrierProviderErrorType;
  }>;
};

async function performCarrierConnectorSync(connectorId: number): Promise<CarrierConnectorSyncRun> {
  ensureCarrierConnectorTables();
  const connector = getRawConnector(connectorId);
  if (!connector) throw new Error("运营商连接不存在");

  const provider = validateProvider(connector.provider);
  const linkedSims = listLinkedSimRows(connector.id);
  const config = parseObject(connector.provider_config);
  const credentials = decryptCredentials(connector);
  const attemptedAt = new Date().toISOString();
  const errors: SyncError[] = [];
  let synced = 0;

  sqlite
    .prepare(
      `UPDATE carrier_connectors
       SET last_synced_at = ?, last_attempt_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(attemptedAt, attemptedAt, attemptedAt, connector.id);

  for (const sim of linkedSims) {
    try {
      const result = await provider.sync({
        connectorId: connector.id,
        connectorName: connector.name,
        config,
        credentials,
        sim: {
          id: sim.id,
          label: sim.label,
          phoneNumber: sim.phone_number,
          carrierName: sim.carrier_name,
          countryCode: sim.country_code,
          balance: sim.balance,
          currencyCode: sim.currency_code,
        },
      });
      validateSyncResult(result);
      insertSnapshot(connector, sim.id, result, attemptedAt);
      synced += 1;
    } catch (error) {
      const classified = classifyCarrierProviderError(error);
      errors.push({
        simId: sim.id,
        simLabel: sim.label,
        error: classified.message,
        type: classified.type,
        retryAfterMs: classified.retryAfterMs,
      });
    }
  }

  const ok = errors.length === 0;
  const errorType = dominantErrorType(errors);
  const allRetryable = Boolean(
    !ok
    && errorType
    && connector.sync_interval_minutes > 0
    && errors.every((item) => isRetryableCarrierProviderErrorType(item.type)),
  );
  const requestedRetryDelay = allRetryable
    ? Math.max(...errors.map((item) => item.retryAfterMs ?? 0)) || null
    : null;
  const retryState = allRetryable && errorType
    ? scheduleConnectorRetry(connector.id, errorType, requestedRetryDelay)
    : null;

  if (ok || !allRetryable || !retryState) clearConnectorRetry(connector.id);

  const displayErrors = errors.map((item) => ({
    simId: item.simId,
    simLabel: item.simLabel,
    type: item.type,
    error: retryState
      ? `${item.error}；SIMKeeper 已安排自动重试`
      : item.error,
  }));
  const lastError = displayErrors.length
    ? displayErrors.map((item) => `${item.simLabel}：${item.error}`).join("；").slice(0, 2000)
    : null;
  const completedAt = new Date().toISOString();

  sqlite
    .prepare(
      `UPDATE carrier_connectors
       SET status = ?, last_synced_at = ?, last_attempt_at = ?, last_success_at = ?,
           last_error = ?, last_error_type = ?, last_error_at = ?, failure_count = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      ok ? "connected" : "error",
      attemptedAt,
      attemptedAt,
      synced > 0 ? attemptedAt : connector.last_success_at,
      lastError,
      ok ? null : errorType,
      ok ? null : attemptedAt,
      ok ? 0 : (connector.failure_count ?? 0) + 1,
      completedAt,
      connector.id,
    );

  return {
    ok,
    connectorId: connector.id,
    synced,
    failed: errors.length,
    lastSyncedAt: attemptedAt,
    lastAttemptAt: attemptedAt,
    retryAt: retryState?.retryAt ?? null,
    retryCount: retryState?.attempt ?? 0,
    errorType: ok ? null : errorType,
    errors: displayErrors,
  };
}

export function syncCarrierConnector(connectorId: number) {
  const active = activeSyncs.get(connectorId);
  if (active) return active;

  const task = performCarrierConnectorSync(connectorId).finally(() => {
    activeSyncs.delete(connectorId);
  });
  activeSyncs.set(connectorId, task);
  return task;
}

export function getSimSyncSummary(simId: number) {
  ensureCarrierConnectorTables();

  const link = sqlite
    .prepare(
      `SELECT connector_id FROM carrier_connector_sims WHERE sim_id = ? LIMIT 1`,
    )
    .get(simId) as { connector_id: number } | undefined;
  const connector = link ? getCarrierConnector(link.connector_id) : null;

  const latestRow = getLatestSnapshotRow(simId);
  const currentInterval = connector?.syncIntervalMinutes ?? 0;
  const latestBelongsToCurrent = Boolean(
    connector && latestRow && latestRow.connector_id === connector.id,
  );
  const latest = mapSnapshot(
    latestRow,
    currentInterval,
    Boolean(connector) && latestBelongsToCurrent,
  );

  return {
    connector,
    latest,
    stale: connector ? connector.stale : latest?.stale ?? true,
    sourceDeleted: Boolean(latest && !connector),
  };
}

export function listSimSyncHistory(simId: number, limit = 20) {
  ensureCarrierConnectorTables();
  const normalizedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const rows = sqlite
    .prepare(
      `SELECT id, sim_id, connector_id, source_name, source_provider, balance,
              currency_code, balance_valid_until, account_status, synced_at
       FROM sim_sync_snapshots
       WHERE sim_id = ?
       ORDER BY synced_at DESC, id DESC
       LIMIT ?`,
    )
    .all(simId, normalizedLimit) as RawSnapshot[];

  const linked = sqlite
    .prepare(
      `SELECT c.id, c.sync_interval_minutes
       FROM carrier_connector_sims l
       JOIN carrier_connectors c ON c.id = l.connector_id
       WHERE l.sim_id = ?
       LIMIT 1`,
    )
    .get(simId) as { id: number; sync_interval_minutes: number } | undefined;

  return rows.map((row) => mapSnapshot(
    row,
    linked?.sync_interval_minutes ?? 0,
    Boolean(linked && row.connector_id === linked.id),
  ));
}

function connectorIsDue(row: RawConnector, now = Date.now()) {
  if (row.sync_interval_minutes <= 0) return false;

  const retry = getConnectorRetryState(row.id);
  if (retry) {
    const retryTimestamp = Date.parse(retry.retry_at);
    if (Number.isFinite(retryTimestamp)) return now >= retryTimestamp;
    clearConnectorRetry(row.id);
  }

  const errorType = inferredErrorType(row);
  if (
    row.status === "error"
    && errorType
    && !isRetryableCarrierProviderErrorType(errorType)
  ) {
    return false;
  }

  const previousValue = row.last_attempt_at ?? row.last_synced_at;
  if (!previousValue) return true;
  const previous = Date.parse(previousValue);
  if (!Number.isFinite(previous)) return true;
  return now - previous >= row.sync_interval_minutes * 60_000;
}

async function runDueConnectorSyncs() {
  const now = Date.now();
  for (const connector of listRawConnectors()) {
    if (!connectorIsDue(connector, now)) continue;
    try {
      await syncCarrierConnector(connector.id);
    } catch (error) {
      console.error("[SIMKeeper] carrier connector sync failed", connector.id, error);
    }
  }
}

let schedulerStarted = false;
let schedulerTimer: ReturnType<typeof setTimeout> | null = null;

function armCarrierConnectorScheduler(delay = SCHEDULER_SCAN_MS) {
  if (!schedulerStarted) return;
  if (schedulerTimer) clearTimeout(schedulerTimer);
  schedulerTimer = setTimeout(() => {
    void runDueConnectorSyncs().finally(() => {
      armCarrierConnectorScheduler();
    });
  }, delay);
  schedulerTimer.unref?.();
}

export function rescheduleCarrierConnectorScheduler() {
  armCarrierConnectorScheduler(1000);
}

export function startCarrierConnectorScheduler() {
  if (schedulerStarted) return;
  ensureCarrierConnectorTables();
  schedulerStarted = true;
  armCarrierConnectorScheduler(SCHEDULER_INITIAL_DELAY_MS);
}
