import type { DatabaseMigration, MigrationDatabase } from "./types";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function tableColumns(database: MigrationDatabase, table: string) {
  const rows = database.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function addColumnIfMissing(
  database: MigrationDatabase,
  table: string,
  column: string,
  definition: string,
) {
  const columns = tableColumns(database, table);
  if (columns.has(column)) return false;
  database.exec(`ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${quoteIdentifier(column)} ${definition}`);
  return true;
}

function createCurrentTables(database: MigrationDatabase) {
  database.exec(`
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

    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      brand TEXT,
      model TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sim_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      phone_number TEXT,
      carrier_id INTEGER NOT NULL,
      device_id INTEGER,
      sim_type TEXT NOT NULL,
      iccid TEXT,
      balance REAL,
      currency_code TEXT,
      balance_updated_at TEXT,
      low_balance_enabled INTEGER NOT NULL DEFAULT 0,
      low_balance_threshold REAL,
      status TEXT NOT NULL,
      activation_date TEXT,
      valid_until TEXT,
      identity_status TEXT NOT NULL DEFAULT 'unknown',
      identity_name TEXT,
      identity_document_type TEXT,
      identity_document_type_custom TEXT,
      identity_document_number TEXT,
      identity_country_code TEXT,
      identity_notes TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (carrier_id) REFERENCES carriers(id) ON DELETE RESTRICT,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
    );

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

    CREATE TABLE IF NOT EXISTS sim_keep_alive_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sim_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      interval_value INTEGER NOT NULL,
      interval_unit TEXT NOT NULL,
      qualifying_actions TEXT NOT NULL,
      minimum_recharge_amount REAL,
      recharge_currency_code TEXT,
      due_date_source TEXT NOT NULL DEFAULT 'independent',
      next_due_date TEXT,
      warning_days INTEGER NOT NULL DEFAULT 30,
      grace_period_days INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (sim_id) REFERENCES sim_cards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sim_keep_alive_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sim_id INTEGER NOT NULL,
      activity_type TEXT NOT NULL,
      activity_date TEXT NOT NULL,
      amount REAL,
      currency_code TEXT,
      balance_after REAL,
      valid_until_after TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (sim_id) REFERENCES sim_cards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sim_bound_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sim_id INTEGER NOT NULL,
      service_name TEXT NOT NULL,
      category TEXT NOT NULL,
      binding_type TEXT NOT NULL,
      account_identifier TEXT,
      importance TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'active',
      website TEXT,
      bound_at TEXT,
      verified_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (sim_id) REFERENCES sim_cards(id) ON DELETE CASCADE
    );

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

    CREATE TABLE IF NOT EXISTS carrier_connector_sims (
      connector_id INTEGER NOT NULL,
      sim_id INTEGER NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (connector_id, sim_id),
      FOREIGN KEY (connector_id) REFERENCES carrier_connectors(id) ON DELETE CASCADE,
      FOREIGN KEY (sim_id) REFERENCES sim_cards(id) ON DELETE CASCADE
    );

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

    CREATE TABLE IF NOT EXISTS carrier_connector_retries (
      connector_id INTEGER PRIMARY KEY,
      retry_at TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (connector_id) REFERENCES carrier_connectors(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS carrier_connector_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      connector_id INTEGER NOT NULL,
      attempted_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      status TEXT NOT NULL,
      error_type TEXT,
      error_message TEXT,
      failure_count INTEGER NOT NULL DEFAULT 0,
      retry_at TEXT,
      FOREIGN KEY (connector_id) REFERENCES carrier_connectors(id) ON DELETE CASCADE,
      UNIQUE (connector_id, attempted_at)
    );

    CREATE TABLE IF NOT EXISTS sim_deleted_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_sim_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      phone_number TEXT,
      country TEXT NOT NULL,
      country_code TEXT NOT NULL,
      carrier_name TEXT NOT NULL,
      sim_type TEXT NOT NULL,
      iccid TEXT,
      balance REAL,
      currency_code TEXT,
      activation_date TEXT,
      valid_until TEXT,
      tariff_plan_name TEXT,
      identity_status TEXT NOT NULL DEFAULT 'unknown',
      identity_name TEXT,
      identity_document_type TEXT,
      identity_country TEXT,
      identity_country_code TEXT,
      notes TEXT,
      binding_summary TEXT NOT NULL DEFAULT '[]',
      deleted_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sim_esim_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sim_id INTEGER NOT NULL UNIQUE,
      profile_status TEXT NOT NULL DEFAULT 'unknown',
      source TEXT,
      reuse_policy TEXT NOT NULL DEFAULT 'unknown',
      notes TEXT,
      smdp_address_encrypted TEXT,
      activation_code_encrypted TEXT,
      confirmation_code_encrypted TEXT,
      lpa_string_encrypted TEXT,
      original_qr_encrypted TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (sim_id) REFERENCES sim_cards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS condition_episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      condition_key TEXT NOT NULL,
      condition_type TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id INTEGER NOT NULL,
      episode_no INTEGER NOT NULL,
      status TEXT NOT NULL,
      opened_at TEXT NOT NULL,
      resolved_at TEXT,
      last_observed_at TEXT NOT NULL,
      snapshot_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reminder_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reminder_key TEXT NOT NULL,
      sim_id INTEGER NOT NULL,
      sim_label TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      due_date TEXT,
      action TEXT NOT NULL,
      snooze_until TEXT,
      acted_at TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (sim_id) REFERENCES sim_cards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notification_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      config_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER,
      channel_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      reminder_key TEXT,
      reminder_status TEXT,
      due_date TEXT,
      delivered_on TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (channel_id) REFERENCES notification_channels(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sim_lifecycle_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sim_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      category TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      metadata_json TEXT,
      dedupe_key TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (sim_id) REFERENCES sim_cards(id) ON DELETE CASCADE
    );
  `);
}

function ensureLegacyColumns(database: MigrationDatabase) {
  addColumnIfMissing(database, "sim_cards", "device_id", "INTEGER REFERENCES devices(id) ON DELETE SET NULL");
  addColumnIfMissing(database, "sim_cards", "balance_updated_at", "TEXT");
  addColumnIfMissing(database, "sim_cards", "low_balance_enabled", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(database, "sim_cards", "low_balance_threshold", "REAL");
  addColumnIfMissing(database, "sim_cards", "identity_status", "TEXT NOT NULL DEFAULT 'unknown'");
  addColumnIfMissing(database, "sim_cards", "identity_name", "TEXT");
  addColumnIfMissing(database, "sim_cards", "identity_document_type", "TEXT");
  addColumnIfMissing(database, "sim_cards", "identity_document_type_custom", "TEXT");
  addColumnIfMissing(database, "sim_cards", "identity_document_number", "TEXT");
  addColumnIfMissing(database, "sim_cards", "identity_country_code", "TEXT");
  addColumnIfMissing(database, "sim_cards", "identity_notes", "TEXT");

  addColumnIfMissing(database, "sim_tariffs", "currency_code", "TEXT");
  addColumnIfMissing(database, "sim_tariffs", "plan_type", "TEXT NOT NULL DEFAULT 'unknown'");
  addColumnIfMissing(database, "sim_tariffs", "purchase_cost", "REAL");
  addColumnIfMissing(database, "sim_tariffs", "recurring_fee", "REAL");
  addColumnIfMissing(database, "sim_tariffs", "recurring_period_value", "INTEGER");
  addColumnIfMissing(database, "sim_tariffs", "recurring_period_unit", "TEXT");
  addColumnIfMissing(database, "sim_tariffs", "administration_fee", "REAL");
  addColumnIfMissing(database, "sim_tariffs", "auto_renew", "TEXT NOT NULL DEFAULT 'unknown'");

  const dueDateSourceAdded = addColumnIfMissing(
    database,
    "sim_keep_alive_rules",
    "due_date_source",
    "TEXT NOT NULL DEFAULT 'independent'",
  );
  addColumnIfMissing(database, "sim_keep_alive_rules", "minimum_recharge_amount", "REAL");
  addColumnIfMissing(database, "sim_keep_alive_rules", "recharge_currency_code", "TEXT");
  if (dueDateSourceAdded) {
    database.exec(`
      UPDATE sim_keep_alive_rules
      SET due_date_source = 'sim_validity', next_due_date = NULL
      WHERE lower(trim(name)) IN ('号码有效期', 'sim有效期', 'sim 卡有效期', '储值卡有效期', '有效期');
    `);
  }

  addColumnIfMissing(database, "carrier_connectors", "last_attempt_at", "TEXT");
  addColumnIfMissing(database, "carrier_connectors", "last_error_type", "TEXT");
  addColumnIfMissing(database, "carrier_connectors", "last_error_at", "TEXT");
  addColumnIfMissing(database, "carrier_connectors", "failure_count", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(database, "reminder_actions", "verified", "INTEGER NOT NULL DEFAULT 0");
}

function createCurrentIndexes(database: MigrationDatabase) {
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_carriers_country_code ON carriers(country_code);
    CREATE INDEX IF NOT EXISTS idx_carriers_name ON carriers(name);
    CREATE INDEX IF NOT EXISTS idx_devices_name ON devices(name);
    CREATE INDEX IF NOT EXISTS idx_devices_type ON devices(type);
    CREATE INDEX IF NOT EXISTS idx_sim_cards_carrier_id ON sim_cards(carrier_id);
    CREATE INDEX IF NOT EXISTS idx_sim_cards_device_id ON sim_cards(device_id);
    CREATE INDEX IF NOT EXISTS idx_sim_cards_phone_number ON sim_cards(phone_number);
    CREATE INDEX IF NOT EXISTS idx_sim_cards_status ON sim_cards(status);
    CREATE INDEX IF NOT EXISTS idx_sim_cards_valid_until ON sim_cards(valid_until);
    CREATE INDEX IF NOT EXISTS idx_sim_cards_low_balance_enabled ON sim_cards(low_balance_enabled);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_tariffs_sim_id ON sim_tariffs(sim_id);
    CREATE INDEX IF NOT EXISTS idx_sim_tariffs_verified_at ON sim_tariffs(verified_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_tariff_rates_tariff_service ON sim_tariff_rates(tariff_id, service_code);
    CREATE INDEX IF NOT EXISTS idx_sim_tariff_rate_rules_tariff_id ON sim_tariff_rate_rules(tariff_id);
    CREATE INDEX IF NOT EXISTS idx_sim_tariff_rate_rules_tariff_service ON sim_tariff_rate_rules(tariff_id, service_code);
    CREATE INDEX IF NOT EXISTS idx_sim_tariff_rule_conditions_rule_id ON sim_tariff_rule_conditions(rule_id);
    CREATE INDEX IF NOT EXISTS idx_sim_tariff_custom_items_tariff_id ON sim_tariff_custom_items(tariff_id);
    CREATE INDEX IF NOT EXISTS idx_sim_keep_alive_rules_sim_id ON sim_keep_alive_rules(sim_id);
    CREATE INDEX IF NOT EXISTS idx_sim_keep_alive_rules_due ON sim_keep_alive_rules(next_due_date);
    CREATE INDEX IF NOT EXISTS idx_sim_keep_alive_events_sim_id ON sim_keep_alive_events(sim_id);
    CREATE INDEX IF NOT EXISTS idx_sim_keep_alive_events_date ON sim_keep_alive_events(sim_id, activity_date);
    CREATE INDEX IF NOT EXISTS idx_sim_bound_services_sim_id ON sim_bound_services(sim_id);
    CREATE INDEX IF NOT EXISTS idx_sim_bound_services_category ON sim_bound_services(category);
    CREATE INDEX IF NOT EXISTS idx_sim_bound_services_status ON sim_bound_services(status);
    CREATE INDEX IF NOT EXISTS idx_sim_bound_services_importance ON sim_bound_services(importance);
    CREATE INDEX IF NOT EXISTS idx_carrier_connectors_provider ON carrier_connectors(provider);
    CREATE INDEX IF NOT EXISTS idx_carrier_connectors_status ON carrier_connectors(status);
    CREATE INDEX IF NOT EXISTS idx_carrier_connector_sims_connector ON carrier_connector_sims(connector_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_carrier_connector_sims_sim ON carrier_connector_sims(sim_id);
    CREATE INDEX IF NOT EXISTS idx_sim_sync_snapshots_sim_time ON sim_sync_snapshots(sim_id, synced_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_sim_sync_snapshots_connector ON sim_sync_snapshots(connector_id);
    CREATE INDEX IF NOT EXISTS idx_carrier_connector_retries_at ON carrier_connector_retries(retry_at);
    CREATE INDEX IF NOT EXISTS idx_carrier_connector_attempts_connector_time ON carrier_connector_attempts(connector_id, attempted_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_sim_deleted_records_deleted_at ON sim_deleted_records(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_sim_deleted_records_phone_number ON sim_deleted_records(phone_number);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_esim_profiles_sim_id ON sim_esim_profiles(sim_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_condition_episodes_occurrence ON condition_episodes(condition_key, episode_no);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_condition_episodes_open ON condition_episodes(condition_key) WHERE status = 'open';
    CREATE INDEX IF NOT EXISTS idx_condition_episodes_subject ON condition_episodes(subject_type, subject_id, status);
    CREATE INDEX IF NOT EXISTS idx_condition_episodes_type_status ON condition_episodes(condition_type, status);
    CREATE INDEX IF NOT EXISTS idx_reminder_actions_occurrence ON reminder_actions(reminder_key, due_date, id);
    CREATE INDEX IF NOT EXISTS idx_reminder_actions_sim_id ON reminder_actions(sim_id, id);
    CREATE INDEX IF NOT EXISTS idx_reminder_actions_acted_at ON reminder_actions(acted_at);
    CREATE INDEX IF NOT EXISTS idx_notification_channels_enabled ON notification_channels(enabled);
    CREATE INDEX IF NOT EXISTS idx_notification_channels_type ON notification_channels(type);
    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_channel_id ON notification_deliveries(channel_id);
    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_reminder ON notification_deliveries(reminder_key, reminder_status, delivered_on);
    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_created_at ON notification_deliveries(created_at);
    CREATE INDEX IF NOT EXISTS idx_sim_lifecycle_events_sim_time ON sim_lifecycle_events(sim_id, occurred_at DESC, id DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_lifecycle_events_dedupe ON sim_lifecycle_events(dedupe_key) WHERE dedupe_key IS NOT NULL;
  `);
}

function normalizeLegacyData(database: MigrationDatabase) {
  database.exec(`
    UPDATE sim_cards SET sim_type = 'esim' WHERE sim_type = 'esim_adapter';
    UPDATE carrier_connectors
    SET last_attempt_at = last_synced_at
    WHERE last_attempt_at IS NULL AND last_synced_at IS NOT NULL;
    UPDATE carrier_connectors
    SET failure_count = 0
    WHERE failure_count IS NULL;
  `);
}

export const alpha46BaselineMigration: DatabaseMigration = {
  version: 1,
  name: "alpha46_baseline",
  up(database) {
    createCurrentTables(database);
    ensureLegacyColumns(database);
    createCurrentIndexes(database);
    normalizeLegacyData(database);
  },
};
