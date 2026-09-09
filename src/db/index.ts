import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { runDatabaseMigrations } from "./migrations";
import * as schema from "./schema";

const isBuildTime = process.env.SIMKEEPER_BUILD_TIME === "true";
const dataDir = process.env.SIMKEEPER_DATA_DIR || path.join(process.cwd(), "data");

if (!isBuildTime) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, "backups"), { recursive: true });
}

const dbPath = isBuildTime ? ":memory:" : path.join(dataDir, "simkeeper.db");
const databaseExisted = !isBuildTime && fs.existsSync(dbPath);
const sqlite = new Database(dbPath);

sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("foreign_keys = ON");

if (!isBuildTime) {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
}

export const migrationState = runDatabaseMigrations(sqlite, {
  dataDir,
  databaseExisted,
  buildTime: isBuildTime,
});

export const db = drizzle(sqlite, { schema });
export { sqlite, dbPath, dataDir };
