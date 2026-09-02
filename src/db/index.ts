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

  CREATE TABLE IF NOT EXISTS sim_tariffs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sim_id INTEGER NOT NULL UNIQUE,
    plan_name TEXT,
    plan_type TEXT NOT NULL DEFAULT 'unknown',
    currency_code TEXT,
    purchase_cost REAL,
    recurring_fee REAL,
    recurring_period_value INTEGER,
    recurring_period_unit TEXT,
    administration_fee REAL,
    auto_renew TEXT NOT NULL DEFAULT 'unknown',
    local_outgoing_call TEXT,
    local_incoming_call TEXT,
    local_outgoing_sms TEXT,
    local_incoming_sms TEXT,
    local_data TEXT,
    international_outgoing_call TEXT,
    international_outgoing_sms TEXT,
    roaming_outgoing_call TEXT,
    roaming_incoming_call TEXT,
    roaming_outgoing_sms TEXT,
    roaming_incoming_sms TEXT,
    roaming_data TEXT,
    local_incoming_sms_policy TEXT NOT NULL DEFAULT 'unknown',
    roaming_incoming_sms_policy TEXT NOT NULL DEFAULT 'unknown',
    roaming_available TEXT NOT NULL DEFAULT 'unknown',
    usage_summary TEXT,
    source_url TEXT,
    verified_at TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (sim_id) REFERENCES sim_cards(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_tariffs_sim_id ON sim_tariffs(sim_id);
  CREATE INDEX IF NOT EXISTS idx_sim_tariffs_verified_at ON sim_tariffs(verified_at);

  CREATE TABLE IF NOT EXISTS sim_tariff_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tariff_id INTEGER NOT NULL,
    service_code TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'unknown',
    amount REAL,
    billing_unit TEXT,
    legacy_text TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (tariff_id) REFERENCES sim_tariffs(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_tariff_rates_tariff_service
    ON sim_tariff_rates(tariff_id, service_code);

  CREATE TABLE IF NOT EXISTS sim_tariff_rate_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tariff_id INTEGER NOT NULL,
    service_code TEXT NOT NULL,
    label TEXT,
    mode TEXT NOT NULL,
    amount REAL,
    billing_unit TEXT,
    package_price REAL,
    package_allowance_amount REAL,
    package_allowance_unit TEXT,
    validity_value INTEGER,
    validity_unit TEXT,
    auto_renew TEXT NOT NULL DEFAULT 'unknown',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (tariff_id) REFERENCES sim_tariffs(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sim_tariff_rate_rules_tariff_id ON sim_tariff_rate_rules(tariff_id);
  CREATE INDEX IF NOT EXISTS idx_sim_tariff_rate_rules_tariff_service ON sim_tariff_rate_rules(tariff_id, service_code);

  CREATE TABLE IF NOT EXISTS sim_tariff_rule_conditions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id INTEGER NOT NULL,
    condition_type TEXT NOT NULL,
    value TEXT NOT NULL,
    value_2 TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (rule_id) REFERENCES sim_tariff_rate_rules(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sim_tariff_rule_conditions_rule_id ON sim_tariff_rule_conditions(rule_id);

  CREATE TABLE IF NOT EXISTS sim_tariff_custom_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tariff_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    kind TEXT NOT NULL,
    mode TEXT NOT NULL,
    amount REAL,
    billing_unit TEXT,
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (tariff_id) REFERENCES sim_tariffs(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sim_tariff_custom_items_tariff_id ON sim_tariff_custom_items(tariff_id);

  UPDATE sim_cards SET sim_type = 'esim' WHERE sim_type = 'esim_adapter';
`);

const tariffColumns = sqlite.prepare("PRAGMA table_info(sim_tariffs)").all() as Array<{ name: string }>;
const tariffColumnNames = new Set(tariffColumns.map((column) => column.name));
const tariffMigrations = [
  ["currency_code", "ALTER TABLE sim_tariffs ADD COLUMN currency_code TEXT"],
  ["plan_type", "ALTER TABLE sim_tariffs ADD COLUMN plan_type TEXT NOT NULL DEFAULT 'unknown'"],
  ["purchase_cost", "ALTER TABLE sim_tariffs ADD COLUMN purchase_cost REAL"],
  ["recurring_fee", "ALTER TABLE sim_tariffs ADD COLUMN recurring_fee REAL"],
  ["recurring_period_value", "ALTER TABLE sim_tariffs ADD COLUMN recurring_period_value INTEGER"],
  ["recurring_period_unit", "ALTER TABLE sim_tariffs ADD COLUMN recurring_period_unit TEXT"],
  ["administration_fee", "ALTER TABLE sim_tariffs ADD COLUMN administration_fee REAL"],
  ["auto_renew", "ALTER TABLE sim_tariffs ADD COLUMN auto_renew TEXT NOT NULL DEFAULT 'unknown'"],
] as const;

for (const [column, sql] of tariffMigrations) {
  if (!tariffColumnNames.has(column)) sqlite.exec(sql);
}

export const db = drizzle(sqlite, { schema });
export { sqlite, dbPath, dataDir };
