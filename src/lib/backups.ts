import "server-only";

import fs from "node:fs";
import path from "node:path";
import { dataDir, sqlite } from "@/db";
import { ensureNotificationTables } from "@/lib/notifications";

export const BACKUP_FORMAT = "simkeeper-portable-backup";
export const BACKUP_FORMAT_VERSION = 1;
export const DEFAULT_BACKUP_RETENTION = 20;
export const MIN_BACKUP_RETENTION = 1;
export const MAX_BACKUP_RETENTION = 100;

export const BACKUP_TABLES = [
  "users",
  "settings",
  "carriers",
  "sim_cards",
  "sim_tariffs",
  "sim_tariff_rates",
  "sim_tariff_rate_rules",
  "sim_tariff_rule_conditions",
  "sim_tariff_custom_items",
  "sim_keep_alive_rules",
  "sim_keep_alive_events",
  "sim_bound_services",
  "notification_channels",
  "notification_deliveries",
] as const;

const DELETE_ORDER = [...BACKUP_TABLES].reverse();
const backupDir = path.join(dataDir, "backups");

ensureNotificationTables();

export type BackupTableName = (typeof BACKUP_TABLES)[number];
export type BackupRow = Record<string, unknown>;
export type BackupPayload = {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  appVersion: string;
  createdAt: string;
  reason: string;
  tables: Record<BackupTableName, BackupRow[]>;
};

export type BackupListItem = {
  name: string;
  createdAt: string;
  appVersion: string;
  reason: string;
  size: number;
  counts: Record<string, number>;
};

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function getAppVersion() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version?: unknown };
    return typeof packageJson.version === "string" ? packageJson.version : "unknown";
  } catch {
    return "unknown";
  }
}

function getCurrentColumns(table: BackupTableName) {
  return (sqlite.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string }>).map((column) => column.name);
}

export function getBackupRetention() {
  const row = sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("backup_retention") as { value?: string } | undefined;
  const parsed = Number(row?.value);
  if (!Number.isInteger(parsed) || parsed < MIN_BACKUP_RETENTION || parsed > MAX_BACKUP_RETENTION) {
    return DEFAULT_BACKUP_RETENTION;
  }
  return parsed;
}

export function setBackupRetention(value: number) {
  if (!Number.isInteger(value) || value < MIN_BACKUP_RETENTION || value > MAX_BACKUP_RETENTION) {
    throw new Error(`本地备份保留数量需要在 ${MIN_BACKUP_RETENTION}-${MAX_BACKUP_RETENTION} 之间`);
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
  ensureNotificationTables();
  const tables = Object.fromEntries(
    BACKUP_TABLES.map((table) => [table, sqlite.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all() as BackupRow[]]),
  ) as Record<BackupTableName, BackupRow[]>;

  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: getAppVersion(),
    createdAt: new Date().toISOString(),
    reason,
    tables,
  };
}

function backupFilename(payload: BackupPayload) {
  const stamp = payload.createdAt.replace(/[-:]/g, "").replace(".", "-");
  const reason = payload.reason.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 32) || "manual";
  return `simkeeper-backup-${reason}-${stamp}.json`;
}

function resolveBackupPath(name: string) {
  if (path.basename(name) !== name || !name.startsWith("simkeeper-backup-") || !name.endsWith(".json")) {
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
  if (prune) pruneLocalBackups(getBackupRetention());
  return { name, payload, size: fs.statSync(destination).size };
}

export function parseBackupPayload(value: unknown): BackupPayload {
  ensureNotificationTables();
  if (!value || typeof value !== "object") throw new Error("备份文件格式不正确");
  const raw = value as Partial<BackupPayload> & { tables?: unknown };
  if (raw.format !== BACKUP_FORMAT) throw new Error("这不是 SIMKeeper 可移植备份文件");
  if (!Number.isInteger(raw.formatVersion) || Number(raw.formatVersion) < 1) throw new Error("备份格式版本无效");
  if (!raw.tables || typeof raw.tables !== "object" || Array.isArray(raw.tables)) throw new Error("备份数据表结构不正确");

  const rawTables = raw.tables as Record<string, unknown>;
  const users = rawTables.users;
  if (!Array.isArray(users) || users.length === 0) throw new Error("完整备份必须包含至少一个管理员账户");

  const tables = Object.fromEntries(
    BACKUP_TABLES.map((table) => {
      const rows = rawTables[table];
      if (rows === undefined) return [table, []];
      if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
        throw new Error(`备份中的 ${table} 数据不正确`);
      }
      return [table, rows as BackupRow[]];
    }),
  ) as Record<BackupTableName, BackupRow[]>;

  return {
    format: BACKUP_FORMAT,
    formatVersion: Number(raw.formatVersion),
    appVersion: typeof raw.appVersion === "string" ? raw.appVersion : "unknown",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
    reason: typeof raw.reason === "string" ? raw.reason : "imported",
    tables,
  };
}

export function readLocalBackup(name: string) {
  const filePath = resolveBackupPath(name);
  if (!fs.existsSync(filePath)) throw new Error("备份文件不存在");
  return parseBackupPayload(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

export function listLocalBackups(): BackupListItem[] {
  ensureNotificationTables();
  fs.mkdirSync(backupDir, { recursive: true });
  return fs
    .readdirSync(backupDir)
    .filter((name) => name.startsWith("simkeeper-backup-") && name.endsWith(".json"))
    .flatMap((name) => {
      try {
        const filePath = resolveBackupPath(name);
        const payload = readLocalBackup(name);
        return [
          {
            name,
            createdAt: payload.createdAt,
            appVersion: payload.appVersion,
            reason: payload.reason,
            size: fs.statSync(filePath).size,
            counts: Object.fromEntries(BACKUP_TABLES.map((table) => [table, payload.tables[table].length])),
          },
        ];
      } catch {
        return [];
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
  const items = listLocalBackups();
  for (const item of items.slice(retention)) {
    try {
      fs.unlinkSync(resolveBackupPath(item.name));
    } catch {
      // Keep pruning best-effort; a failed removal should not break backup creation.
    }
  }
}

export function restoreBackupPayload(value: unknown) {
  ensureNotificationTables();
  const payload = parseBackupPayload(value);
  const safetyBackup = createLocalBackup("pre-restore", false);

  const restore = sqlite.transaction(() => {
    for (const table of DELETE_ORDER) {
      sqlite.prepare(`DELETE FROM ${quoteIdentifier(table)}`).run();
    }

    for (const table of BACKUP_TABLES) {
      const allowedColumns = new Set(getCurrentColumns(table));
      for (const row of payload.tables[table]) {
        const columns = Object.keys(row).filter((column) => allowedColumns.has(column));
        if (!columns.length) continue;
        const sql = `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
        sqlite.prepare(sql).run(...columns.map((column) => row[column] as never));
      }
    }

    const violations = sqlite.prepare("PRAGMA foreign_key_check").all();
    if (violations.length) throw new Error("恢复后的数据未通过外键完整性检查，已自动回滚");
  });

  restore();
  return { payload, safetyBackup: safetyBackup.name };
}

export function getBackupSummary(payload: BackupPayload) {
  return {
    formatVersion: payload.formatVersion,
    appVersion: payload.appVersion,
    createdAt: payload.createdAt,
    reason: payload.reason,
    counts: Object.fromEntries(BACKUP_TABLES.map((table) => [table, payload.tables[table].length])),
  };
}
