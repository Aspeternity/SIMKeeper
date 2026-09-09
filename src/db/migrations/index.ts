import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { alpha46BaselineMigration } from "./001_alpha46_baseline";
import { queryIndexAuditMigration } from "./002_query_indexes";
import { remoteBackupRunsMigration } from "./003_remote_backup_runs";
import { twoFactorSecurityMigration } from "./004_two_factor_security";
import type { DatabaseMigration } from "./types";

const MIGRATION_BACKUP_PREFIX = "simkeeper-pre-migration-";
const MAX_MIGRATION_BACKUPS = 8;

export const DATABASE_MIGRATIONS: DatabaseMigration[] = [
  alpha46BaselineMigration,
  queryIndexAuditMigration,
  remoteBackupRunsMigration,
  twoFactorSecurityMigration,
];

export const DATABASE_SCHEMA_VERSION = DATABASE_MIGRATIONS.at(-1)?.version ?? 0;

export type AppliedDatabaseMigration = {
  version: number;
  name: string;
  appliedAt: string;
  durationMs: number;
};

export type DatabaseMigrationStatus = {
  currentVersion: number;
  expectedVersion: number;
  pendingVersions: number[];
  applied: AppliedDatabaseMigration[];
};

export type DatabaseMigrationRunResult = DatabaseMigrationStatus & {
  backupPath: string | null;
  appliedNow: number[];
};

function migrationTableExists(database: Database.Database) {
  return Boolean(
    database
      .prepare(
        "SELECT 1 AS value FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations' LIMIT 1",
      )
      .get(),
  );
}

function hasApplicationSchema(database: Database.Database) {
  return Boolean(
    database
      .prepare(
        `SELECT 1 AS value
         FROM sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE 'sqlite_%'
           AND name <> 'schema_migrations'
         LIMIT 1`,
      )
      .get(),
  );
}

function createMigrationTable(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0
    );
  `);
}

function readApplied(database: Database.Database): AppliedDatabaseMigration[] {
  if (!migrationTableExists(database)) return [];
  return database
    .prepare(
      `SELECT version, name, applied_at, duration_ms
       FROM schema_migrations
       ORDER BY version ASC`,
    )
    .all()
    .map((row) => {
      const value = row as {
        version: number;
        name: string;
        applied_at: string;
        duration_ms: number;
      };
      return {
        version: value.version,
        name: value.name,
        appliedAt: value.applied_at,
        durationMs: value.duration_ms,
      };
    });
}

function validateAppliedMigrations(applied: AppliedDatabaseMigration[]) {
  for (let index = 0; index < applied.length; index += 1) {
    const row = applied[index];
    const expected = DATABASE_MIGRATIONS[index];
    if (!expected || row.version !== expected.version || row.name !== expected.name) {
      throw new Error(
        `数据库迁移历史与当前程序不兼容：检测到 v${row.version} ${row.name}，请先确认 SIMKeeper 版本后再启动`,
      );
    }
  }
}

export function getDatabaseMigrationStatus(database: Database.Database): DatabaseMigrationStatus {
  const applied = readApplied(database);
  validateAppliedMigrations(applied);
  const appliedVersions = new Set(applied.map((item) => item.version));
  const pendingVersions = DATABASE_MIGRATIONS
    .filter((migration) => !appliedVersions.has(migration.version))
    .map((migration) => migration.version);
  return {
    currentVersion: applied.at(-1)?.version ?? 0,
    expectedVersion: DATABASE_SCHEMA_VERSION,
    pendingVersions,
    applied,
  };
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function backupTimestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function pruneMigrationBackups(backupDir: string) {
  const files = fs
    .readdirSync(backupDir)
    .filter((name) => name.startsWith(MIGRATION_BACKUP_PREFIX) && name.endsWith(".db"))
    .sort()
    .reverse();
  for (const name of files.slice(MAX_MIGRATION_BACKUPS)) {
    try {
      fs.unlinkSync(path.join(backupDir, name));
    } catch {
      // Retention is best effort. A failed prune must never block a successful migration.
    }
  }
}

function createPreMigrationBackup(
  database: Database.Database,
  backupDir: string,
  fromVersion: number,
  toVersion: number,
) {
  fs.mkdirSync(backupDir, { recursive: true });
  const name = `${MIGRATION_BACKUP_PREFIX}v${fromVersion}-to-v${toVersion}-${backupTimestamp()}.db`;
  const destination = path.join(backupDir, name);

  database.pragma("wal_checkpoint(FULL)");
  database.exec(`VACUUM INTO ${sqlString(destination)}`);
  try {
    fs.chmodSync(destination, 0o600);
  } catch {
    // Best effort on filesystems without POSIX permissions.
  }
  pruneMigrationBackups(backupDir);
  return destination;
}

export function runDatabaseMigrations(
  database: Database.Database,
  options: {
    dataDir: string;
    databaseExisted: boolean;
    buildTime: boolean;
  },
): DatabaseMigrationRunResult {
  const before = getDatabaseMigrationStatus(database);
  const pending = DATABASE_MIGRATIONS.filter((migration) =>
    before.pendingVersions.includes(migration.version),
  );

  if (!pending.length) {
    createMigrationTable(database);
    return { ...getDatabaseMigrationStatus(database), backupPath: null, appliedNow: [] };
  }

  let backupPath: string | null = null;
  if (
    !options.buildTime
    && options.databaseExisted
    && hasApplicationSchema(database)
  ) {
    backupPath = createPreMigrationBackup(
      database,
      path.join(options.dataDir, "backups"),
      before.currentVersion,
      pending.at(-1)?.version ?? DATABASE_SCHEMA_VERSION,
    );
  }

  createMigrationTable(database);
  const appliedNow: number[] = [];

  for (const migration of pending) {
    const startedAt = Date.now();
    try {
      const apply = database.transaction(() => {
        migration.up(database);
        const durationMs = Math.max(0, Date.now() - startedAt);
        database
          .prepare(
            `INSERT INTO schema_migrations (version, name, applied_at, duration_ms)
             VALUES (?, ?, ?, ?)`,
          )
          .run(migration.version, migration.name, new Date().toISOString(), durationMs);
      });
      apply();
      appliedNow.push(migration.version);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const backupHint = backupPath ? `；升级前数据库已保存在 ${path.basename(backupPath)}` : "";
      throw new Error(
        `数据库迁移 v${migration.version} (${migration.name}) 失败，事务已回滚${backupHint}：${message}`,
      );
    }
  }

  try {
    database.pragma("optimize");
  } catch {
    // Optimization is advisory and must not turn a completed migration into a failure.
  }

  return {
    ...getDatabaseMigrationStatus(database),
    backupPath,
    appliedNow,
  };
}
