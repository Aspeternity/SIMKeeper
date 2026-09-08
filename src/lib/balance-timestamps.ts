import "server-only";

import { sqlite } from "@/db";

const KEEP_ALIVE_TRIGGER = "simkeeper_timestamp_keep_alive_balance";

export function ensureBalanceTimestampTriggers() {
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS ${KEEP_ALIVE_TRIGGER}
    AFTER INSERT ON sim_keep_alive_events
    WHEN NEW.balance_after IS NOT NULL
    BEGIN
      UPDATE sim_cards
      SET balance_updated_at = NEW.created_at
      WHERE id = NEW.sim_id;
    END;
  `);
}
