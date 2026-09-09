import "server-only";

import fs from "node:fs";
import path from "node:path";
import { dataDir, dbPath, sqlite } from "@/db";
import { DATABASE_SCHEMA_VERSION, getDatabaseMigrationStatus } from "@/db/migrations";

const IMPORTANT_TABLES = [
  "users",
  "carriers",
  "devices",
  "sim_cards",
  "sim_bound_services",
  "sim_keep_alive_events",
  "sim_sync_snapshots",
  "carrier_connector_attempts",
  "sim_lifecycle_events",
  "condition_episodes",
  "reminder_actions",
  "notification_deliveries",
] as const;

function fileSize(filePath: string) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function pragmaSimple<T>(statement: string, fallback: T): T {
  try {
    const value = sqlite.pragma(statement, { simple: true }) as T;
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function quickCheck() {
  try {
    const rows = sqlite.pragma("quick_check") as Array<Record<string, unknown>>;
    const values = rows.map((row) => String(Object.values(row)[0] ?? ""));
    return values.length === 1 && values[0] === "ok"
      ? { status: "ok" as const, messages: [] as string[] }
      : { status: "error" as const, messages: values };
  } catch (error) {
    return {
      status: "error" as const,
      messages: [error instanceof Error ? error.message : String(error)],
    };
  }
}

function foreignKeyCheck() {
  try {
    const rows = sqlite.pragma("foreign_key_check") as Array<Record<string, unknown>>;
    return rows.length;
  } catch {
    return -1;
  }
}

function tableCounts() {
  return Object.fromEntries(
    IMPORTANT_TABLES.map((table) => {
      const row = sqlite.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get() as { count: number };
      return [table, Number(row.count) || 0];
    }),
  ) as Record<(typeof IMPORTANT_TABLES)[number], number>;
}

function migrationBackups() {
  const backupDir = path.join(dataDir, "backups");
  try {
    const names = fs
      .readdirSync(backupDir)
      .filter((name) => name.startsWith("simkeeper-pre-migration-") && name.endsWith(".db"))
      .sort()
      .reverse();
    return {
      count: names.length,
      latest: names[0] ?? null,
    };
  } catch {
    return { count: 0, latest: null };
  }
}

export function getDatabaseHealth() {
  const migration = getDatabaseMigrationStatus(sqlite);
  const check = quickCheck();
  const foreignKeyViolations = foreignKeyCheck();
  const pageCount = Number(pragmaSimple("page_count", 0)) || 0;
  const pageSize = Number(pragmaSimple("page_size", 0)) || 0;
  const freePages = Number(pragmaSimple("freelist_count", 0)) || 0;
  const journalMode = String(pragmaSimple("journal_mode", "unknown"));
  const foreignKeysEnabled = Number(pragmaSimple("foreign_keys", 0)) === 1;
  const sqliteVersionRow = sqlite.prepare("SELECT sqlite_version() AS version").get() as { version: string };
  const backups = migrationBackups();

  return {
    status:
      check.status === "ok"
      && foreignKeyViolations === 0
      && migration.pendingVersions.length === 0
        ? "healthy" as const
        : "attention" as const,
    sqliteVersion: sqliteVersionRow.version,
    schemaVersion: migration.currentVersion,
    expectedSchemaVersion: DATABASE_SCHEMA_VERSION,
    pendingMigrations: migration.pendingVersions,
    migrations: [...migration.applied].reverse(),
    quickCheck: check,
    foreignKeyViolations,
    foreignKeysEnabled,
    journalMode,
    databaseBytes: fileSize(dbPath),
    walBytes: fileSize(`${dbPath}-wal`),
    shmBytes: fileSize(`${dbPath}-shm`),
    pageCount,
    pageSize,
    freePages,
    freePageRatio: pageCount > 0 ? freePages / pageCount : 0,
    tableCounts: tableCounts(),
    preMigrationBackups: backups,
  };
}
