import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const isBuildTime = process.env.SIMKEEPER_BUILD_TIME === "true";
const dataDir = process.env.SIMKEEPER_DATA_DIR || path.join(process.cwd(), "data");

if (!isBuildTime) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, "backups"), { recursive: true });
}

const dbPath = isBuildTime ? ":memory:" : path.join(dataDir, "simkeeper.db");
const sqlite = new Database(dbPath);

// Give concurrent requests time to wait for short SQLite write locks instead of
// immediately failing with SQLITE_BUSY. During `next build` every worker gets
// its own in-memory database, so build-time module evaluation never touches the
// persistent runtime database.
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("foreign_keys = ON");

if (!isBuildTime) {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
}

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS carriers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    country_code TEXT NOT NULL,
    website TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_carriers_country_code ON carriers(country_code);
  CREATE INDEX IF NOT EXISTS idx_carriers_name ON carriers(name);

  CREATE TABLE IF NOT EXISTS sim_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    phone_number TEXT,
    carrier_id INTEGER NOT NULL,
    sim_type TEXT NOT NULL,
    iccid TEXT,
    balance REAL,
    currency_code TEXT,
    status TEXT NOT NULL,
    activation_date TEXT,
    valid_until TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (carrier_id) REFERENCES carriers(id) ON DELETE RESTRICT
  );

  CREATE INDEX IF NOT EXISTS idx_sim_cards_carrier_id ON sim_cards(carrier_id);
  CREATE INDEX IF NOT EXISTS idx_sim_cards_phone_number ON sim_cards(phone_number);
  CREATE INDEX IF NOT EXISTS idx_sim_cards_status ON sim_cards(status);
  CREATE INDEX IF NOT EXISTS idx_sim_cards_valid_until ON sim_cards(valid_until);
`);

export const db = drizzle(sqlite, { schema });
export { sqlite, dbPath, dataDir };
