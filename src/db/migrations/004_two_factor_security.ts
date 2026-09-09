import type { DatabaseMigration } from "./types";

function userColumns(database: Parameters<DatabaseMigration["up"]>[0]) {
  return new Set(
    database
      .prepare("PRAGMA table_info(users)")
      .all()
      .map((row) => String((row as { name?: unknown }).name ?? "")),
  );
}

export const twoFactorSecurityMigration: DatabaseMigration = {
  version: 4,
  name: "two_factor_security",
  up(database) {
    const columns = userColumns(database);

    if (!columns.has("totp_secret_ciphertext")) {
      database.exec("ALTER TABLE users ADD COLUMN totp_secret_ciphertext TEXT;");
    }
    if (!columns.has("totp_enabled_at")) {
      database.exec("ALTER TABLE users ADD COLUMN totp_enabled_at TEXT;");
    }
    if (!columns.has("totp_recovery_hashes")) {
      database.exec("ALTER TABLE users ADD COLUMN totp_recovery_hashes TEXT;");
    }

    database.exec(`
      CREATE TABLE IF NOT EXISTS security_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('success', 'failure', 'info')),
        detail TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_security_events_created_at
        ON security_events(created_at DESC, id DESC);
    `);
  },
};
