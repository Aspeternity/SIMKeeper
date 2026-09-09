import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir, sqlite } from "@/db";
import {
  decryptPortableBackup,
  encryptPortableBackup,
  encryptedBackupFilename,
  isEncryptedPortableBackup,
} from "@/lib/backup-security";
import { ensureCarrierConnectorTables } from "@/lib/carrier-connectors/store";
import { ensureConditionEpisodeTables } from "@/lib/condition-episodes";
import { exportCredentialSecret, importCredentialSecret } from "@/lib/credential-crypto";
import { ensureEsimProfileTable } from "@/lib/esim-profiles";
import { ensureNotificationTables } from "@/lib/notifications";
import { ensureReminderActionTables } from "@/lib/reminder-actions";
import { ensureSimArchiveTable } from "@/lib/sim-archives";
import { dropSimLifecycleTriggers, ensureSimLifecycleTables } from "@/lib/sim-lifecycle";

export const BACKUP_FORMAT = "simkeeper-portable-backup";
export const BACKUP_FORMAT_VERSION = 4;
export const BACKUP_SCHEMA_VERSION = 2;
export const DEFAULT_BACKUP_RETENTION = 20;
export const MIN_BACKUP_RETENTION = 1;
export const MAX_BACKUP_RETENTION = 100;

const BACKUP_SCHEMA_V1_TABLES = [
  "users",
  "settings",
  "carriers",
  "devices",
  "sim_cards",
  "carrier_connectors",
  "carrier_connector_sims",
  "sim_sync_snapshots",
  "sim_deleted_records",
  "sim_esim_profiles",
  "sim_tariffs",
  "sim_tariff_rates",
  "sim_tariff_rate_rules",
  "sim_tariff_rule_conditions",
  "sim_tariff_custom_items",
  "sim_keep_alive_rules",
  "sim_keep_alive_events",
  "condition_episodes",
  "reminder_actions",
  "sim_bound_services",
  "notification_channels",
  "notification_deliveries",
] as const;

export const BACKUP_TABLES = [
  "users",
  "settings",
  "carriers",
  "devices",
  "sim_cards",
  "carrier_connectors",
  "carrier_connector_sims",
  "sim_sync_snapshots",
  "carrier_connector_attempts",
  "sim_deleted_records",
  "sim_esim_profiles",
  "sim_tariffs",
  "sim_tariff_rates",
  "sim_tariff_rate_rules",
  "sim_tariff_rule_conditions",
  "sim_tariff_custom_items",
  "sim_keep_alive_rules",
  "sim_keep_alive_events",
  "sim_lifecycle_events",
  "condition_episodes",
  "reminder_actions",
  "sim_bound_services",
  "notification_channels",
  "notification_deliveries",
] as const;

const DELETE_ORDER = [...BACKUP_TABLES].reverse();
const backupDir = path.join(dataDir, "backups");

function ensureBackupTables() {
  ensureCarrierConnectorTables();
  ensureEsimProfileTable();
  ensureSimArchiveTable();
  ensureNotificationTables();
  ensureReminderActionTables();
  ensureConditionEpisodeTables();
  ensureSimLifecycleTables();
}

ensureBackupTables();

export type BackupTableName = (typeof BACKUP_TABLES)[number];
export type BackupRow = Record<string, unknown>;
export type BackupIntegrity = {
  algorithm: "sha256";
  digest: string;
};
export type BackupPayload = {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  appVersion: string;
  createdAt: string;
  reason: string;
  credentialSecret?: string;
  tables: Record<BackupTableName, BackupRow[]>;
  integrity?: BackupIntegrity;
};

export type BackupValidationStatus = "verified" | "legacy" | "invalid";

export type BackupListItem = {
  name: string;
  createdAt: string;
  appVersion: string;
  reason: string;
  size: number;
  counts: Record<string, number>;
  formatVersion: number | null;
  schemaVersion: number | null;
  validation: BackupValidationStatus;
  error?: string;
};

export type BackupSummary = {
  formatVersion: number;
  schemaVersion: number;
  appVersion: string;
  createdAt: string;
  reason: string;
  counts: Record<string, number>;
  validation: Exclude<BackupValidationStatus, "invalid">;
  compatible: true;
  encrypted: boolean;
  warnings: string[];
};

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function getAppVersion() {
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { version?: unknown };
    return typeof packageJson.version === "string" ? packageJson.version : "unknown";
  } catch {
    return "unknown";
  }
}

function getCurrentColumns(table: BackupTableName) {
  return (
    sqlite.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{
      name: string;
    }>
  ).map((column) => column.name);
}

function integritySource(payload: Omit<BackupPayload, "integrity">) {
  return JSON.stringify({
    format: payload.format,
    formatVersion: payload.formatVersion,
    schemaVersion: payload.schemaVersion,
    appVersion: payload.appVersion,
    createdAt: payload.createdAt,
    reason: payload.reason,
    credentialSecret: payload.credentialSecret ?? null,
    tables: payload.tables,
  });
}

function computeBackupDigest(payload: Omit<BackupPayload, "integrity">) {
  return crypto.createHash("sha256").update(integritySource(payload), "utf8").digest("hex");
}

function digestMatches(actual: string, expected: string) {
  if (!/^[a-f0-9]{64}$/i.test(actual) || !/^[a-f0-9]{64}$/i.test(expected)) return false;
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

export function getBackupRetention() {
  const row = sqlite
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get("backup_retention") as { value?: string } | undefined;
  const parsed = Number(row?.value);
  if (
    !Number.isInteger(parsed)
    || parsed < MIN_BACKUP_RETENTION
    || parsed > MAX_BACKUP_RETENTION
  ) {
    return DEFAULT_BACKUP_RETENTION;
  }
  return parsed;
}

export function setBackupRetention(value: number) {
  if (
    !Number.isInteger(value)
    || value < MIN_BACKUP_RETENTION
    || value > MAX_BACKUP_RETENTION
  ) {
    throw new Error(
      `本地备份保留数量需要在 ${MIN_BACKUP_RETENTION}-${MAX_BACKUP_RETENTION} 之间`,
    );
  }

  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run("backup_retention", String(value), now);

  pruneLocalBackups(value);
  return value;
}

export function createBackupPayload(reason = "manual"): BackupPayload {
  ensureBackupTables();
  const tables = Object.fromEntries(
    BACKUP_TABLES.map((table) => [
      table,
      sqlite.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all() as BackupRow[],
    ]),
  ) as Record<BackupTableName, BackupRow[]>;

  const payload: Omit<BackupPayload, "integrity"> = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: getAppVersion(),
    createdAt: new Date().toISOString(),
    reason,
    credentialSecret: exportCredentialSecret(),
    tables,
  };

  return {
    ...payload,
    integrity: {
      algorithm: "sha256",
      digest: computeBackupDigest(payload),
    },
  };
}

function backupFilename(payload: BackupPayload) {
  const stamp = payload.createdAt.replace(/[-:]/g, "").replace(".", "-");
  const reason =
    payload.reason.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 32) || "manual";
  return `simkeeper-backup-${reason}-${stamp}.json`;
}

function resolveBackupPath(name: string) {
  if (
    path.basename(name) !== name
    || !name.startsWith("simkeeper-backup-")
    || !name.endsWith(".json")
  ) {
    throw new Error("备份文件名不合法");
  }
  return path.join(backupDir, name);
}

export function createLocalBackup(reason = "manual", prune = true) {
  fs.mkdirSync(backupDir, { recursive: true });
  const payload = createBackupPayload(reason);
  const name = backupFilename(payload);
  const destination = resolveBackupPath(name);
  const temporary = `${destination}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(payload, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, destination);
  try {
    fs.chmodSync(destination, 0o600);
  } catch {
    // Best effort on filesystems that do not support POSIX modes.
  }
  if (prune) pruneLocalBackups(getBackupRetention());
  return { name, payload, size: fs.statSync(destination).size };
}

export function parseBackupPayload(value: unknown): BackupPayload {
  ensureBackupTables();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("备份文件格式不正确");
  }

  const raw = value as Partial<BackupPayload> & { tables?: unknown };
  if (raw.format !== BACKUP_FORMAT) throw new Error("这不是 SIMKeeper 可移植备份文件");
  if (!Number.isInteger(raw.formatVersion) || Number(raw.formatVersion) < 1) {
    throw new Error("备份格式版本无效");
  }
  if (Number(raw.formatVersion) > BACKUP_FORMAT_VERSION) {
    throw new Error(
      `这份备份使用格式 v${String(raw.formatVersion)}，当前 SIMKeeper 仅支持到 v${BACKUP_FORMAT_VERSION}；请先升级 SIMKeeper 再恢复`,
    );
  }
  if (!raw.tables || typeof raw.tables !== "object" || Array.isArray(raw.tables)) {
    throw new Error("备份数据表结构不正确");
  }

  const rawTables = raw.tables as Record<string, unknown>;
  const users = rawTables.users;
  if (!Array.isArray(users) || users.length === 0) {
    throw new Error("完整备份必须包含至少一个管理员账户");
  }

  const tables = Object.fromEntries(
    BACKUP_TABLES.map((table) => {
      const rows = rawTables[table];
      if (rows === undefined) return [table, []];
      if (
        !Array.isArray(rows)
        || rows.some(
          (row) => !row || typeof row !== "object" || Array.isArray(row),
        )
      ) {
        throw new Error(`备份中的 ${table} 数据不正确`);
      }
      return [table, rows as BackupRow[]];
    }),
  ) as Record<BackupTableName, BackupRow[]>;

  const connectorHasCredential = tables.carrier_connectors.some(
    (row) => typeof row.credentials_encrypted === "string" && row.credentials_encrypted.length > 0,
  );
  if (
    (tables.sim_esim_profiles.length || connectorHasCredential)
    && typeof raw.credentialSecret !== "string"
  ) {
    throw new Error("备份包含加密凭据，但缺少对应的凭据密钥，无法安全恢复");
  }

  const formatVersion = Number(raw.formatVersion);
  const schemaVersion = Number.isInteger(raw.schemaVersion) && Number(raw.schemaVersion) >= 0
    ? Number(raw.schemaVersion)
    : 0;
  if (formatVersion >= 4 && schemaVersion < 1) {
    throw new Error("备份 Schema 版本无效");
  }

  const normalized: Omit<BackupPayload, "integrity"> = {
    format: BACKUP_FORMAT,
    formatVersion,
    schemaVersion,
    appVersion: typeof raw.appVersion === "string" ? raw.appVersion : "unknown",
    createdAt:
      typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
    reason: typeof raw.reason === "string" ? raw.reason : "imported",
    credentialSecret:
      typeof raw.credentialSecret === "string" ? raw.credentialSecret : undefined,
    tables,
  };

  let integrity: BackupIntegrity | undefined;
  if (formatVersion >= 4) {
    const rawIntegrity = raw.integrity;
    if (
      !rawIntegrity
      || rawIntegrity.algorithm !== "sha256"
      || typeof rawIntegrity.digest !== "string"
    ) {
      throw new Error("备份缺少完整性校验信息");
    }

    // Schema v1 backups were signed before lifecycle and connector-attempt history
    // became portable tables. Reconstruct exactly that original table object so
    // alpha.40-alpha.45 backups keep validating after the schema grows.
    const integrityPayload = schemaVersion < 2
      ? {
          ...normalized,
          tables: Object.fromEntries(
            BACKUP_SCHEMA_V1_TABLES.map((table) => [table, tables[table]]),
          ),
        } as Omit<BackupPayload, "integrity">
      : normalized;
    const expected = computeBackupDigest(integrityPayload);
    if (!digestMatches(rawIntegrity.digest, expected)) {
      throw new Error("备份完整性校验失败，文件可能已损坏或被修改");
    }
    integrity = { algorithm: "sha256", digest: rawIntegrity.digest.toLowerCase() };
  }

  return {
    ...normalized,
    integrity,
  };
}

export function parseBackupInput(value: unknown, passphrase?: string) {
  if (isEncryptedPortableBackup(value)) {
    if (!passphrase) throw new Error("请输入这份加密备份的口令");
    return {
      payload: parseBackupPayload(decryptPortableBackup(value, passphrase)),
      encrypted: true,
    };
  }
  return { payload: parseBackupPayload(value), encrypted: false };
}

export function createEncryptedPortableBackup(passphrase: string) {
  const payload = createBackupPayload("export");
  const encrypted = encryptPortableBackup(
    payload,
    { appVersion: payload.appVersion, createdAt: payload.createdAt },
    passphrase,
  );
  return {
    payload,
    encrypted,
    name: encryptedBackupFilename(payload.createdAt),
  };
}

export function readLocalBackup(name: string) {
  const filePath = resolveBackupPath(name);
  if (!fs.existsSync(filePath)) throw new Error("备份文件不存在");
  return parseBackupPayload(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

export function listLocalBackups(): BackupListItem[] {
  ensureBackupTables();
  fs.mkdirSync(backupDir, { recursive: true });
  return fs
    .readdirSync(backupDir)
    .filter(
      (name) => name.startsWith("simkeeper-backup-") && name.endsWith(".json"),
    )
    .map((name): BackupListItem => {
      const filePath = resolveBackupPath(name);
      const stat = fs.statSync(filePath);
      try {
        const payload = readLocalBackup(name);
        return {
          name,
          createdAt: payload.createdAt,
          appVersion: payload.appVersion,
          reason: payload.reason,
          size: stat.size,
          counts: Object.fromEntries(
            BACKUP_TABLES.map((table) => [table, payload.tables[table].length]),
          ),
          formatVersion: payload.formatVersion,
          schemaVersion: payload.schemaVersion,
          validation: payload.integrity ? "verified" : "legacy",
        };
      } catch (error) {
        return {
          name,
          createdAt: stat.mtime.toISOString(),
          appVersion: "unknown",
          reason: "invalid",
          size: stat.size,
          counts: {},
          formatVersion: null,
          schemaVersion: null,
          validation: "invalid",
          error: error instanceof Error ? error.message : "备份无法验证",
        };
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function deleteLocalBackup(name: string) {
  const filePath = resolveBackupPath(name);
  if (!fs.existsSync(filePath)) throw new Error("备份文件不存在");
  fs.unlinkSync(filePath);
}

export function pruneLocalBackups(retention = getBackupRetention()) {
  const items = listLocalBackups().filter((item) => item.validation !== "invalid");
  for (const item of items.slice(retention)) {
    try {
      fs.unlinkSync(resolveBackupPath(item.name));
    } catch {
      // Keep pruning best-effort; a failed removal should not break backup creation.
    }
  }
}

function restoreParsedBackup(payload: BackupPayload) {
  ensureBackupTables();
  const safetyBackup = createLocalBackup("pre-restore", false);
  const previousCredentialSecret = exportCredentialSecret();

  if (payload.credentialSecret) importCredentialSecret(payload.credentialSecret);
  dropSimLifecycleTriggers();

  const restore = sqlite.transaction(() => {
    for (const table of DELETE_ORDER) {
      sqlite.prepare(`DELETE FROM ${quoteIdentifier(table)}`).run();
    }

    for (const table of BACKUP_TABLES) {
      const allowedColumns = new Set(getCurrentColumns(table));
      for (const row of payload.tables[table]) {
        const columns = Object.keys(row).filter((column) =>
          allowedColumns.has(column),
        );
        if (!columns.length) continue;
        const sql =
          `INSERT INTO ${quoteIdentifier(table)} (${columns
            .map(quoteIdentifier)
            .join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
        sqlite.prepare(sql).run(...columns.map((column) => row[column] as never));
      }
    }

    const violations = sqlite.prepare("PRAGMA foreign_key_check").all();
    if (violations.length) {
      throw new Error("恢复后的数据未通过外键完整性检查，已自动回滚");
    }

    const integrityRows = sqlite.prepare("PRAGMA integrity_check").all() as Array<{
      integrity_check?: string;
    }>;
    if (
      integrityRows.length !== 1
      || integrityRows[0]?.integrity_check?.toLowerCase() !== "ok"
    ) {
      throw new Error("恢复后的数据库未通过 SQLite 完整性检查，已自动回滚");
    }
  });

  try {
    restore();
    ensureSimLifecycleTables();
  } catch (error) {
    importCredentialSecret(previousCredentialSecret);
    ensureSimLifecycleTables();
    throw error;
  }

  return { payload, safetyBackup: safetyBackup.name };
}

export function restoreBackupPayload(value: unknown) {
  return restoreParsedBackup(parseBackupPayload(value));
}

export function restoreBackupInput(value: unknown, passphrase?: string) {
  const parsed = parseBackupInput(value, passphrase);
  const restored = restoreParsedBackup(parsed.payload);
  return { ...restored, encrypted: parsed.encrypted };
}

export function getBackupSummary(payload: BackupPayload, encrypted = false): BackupSummary {
  const warnings: string[] = [];
  if (!payload.integrity) {
    warnings.push("这是旧版备份，不包含 SHA-256 完整性校验；恢复前已完成结构兼容检查。");
  }
  if (payload.formatVersion < BACKUP_FORMAT_VERSION) {
    warnings.push(
      `备份格式为 v${payload.formatVersion}，当前格式为 v${BACKUP_FORMAT_VERSION}；将按向后兼容模式恢复。`,
    );
  }
  if (payload.schemaVersion < BACKUP_SCHEMA_VERSION) {
    warnings.push(
      `备份 Schema 为 v${payload.schemaVersion}，当前为 v${BACKUP_SCHEMA_VERSION}；缺失的新字段会使用当前默认值。`,
    );
  }

  return {
    formatVersion: payload.formatVersion,
    schemaVersion: payload.schemaVersion,
    appVersion: payload.appVersion,
    createdAt: payload.createdAt,
    reason: payload.reason,
    counts: Object.fromEntries(
      BACKUP_TABLES.map((table) => [table, payload.tables[table].length]),
    ),
    validation: payload.integrity ? "verified" : "legacy",
    compatible: true,
    encrypted,
    warnings,
  };
}
