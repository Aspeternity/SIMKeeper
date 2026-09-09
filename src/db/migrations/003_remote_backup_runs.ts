import type { DatabaseMigration } from "./types";

export const remoteBackupRunsMigration: DatabaseMigration = {
  version: 3,
  name: "remote_backup_runs",
  up(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS remote_backup_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'scheduled')),
        status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
        started_at TEXT NOT NULL,
        completed_at TEXT,
        local_backup_name TEXT,
        remote_name TEXT,
        size INTEGER,
        error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_remote_backup_runs_started_at
        ON remote_backup_runs(started_at DESC, id DESC);

      CREATE INDEX IF NOT EXISTS idx_remote_backup_runs_status_started
        ON remote_backup_runs(status, started_at DESC);
    `);
  },
};
