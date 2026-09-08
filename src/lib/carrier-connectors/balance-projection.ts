import "server-only";

import { sqlite } from "@/db";

const TRIGGER_NAME = "simkeeper_project_carrier_balance";

export function ensureCarrierBalanceProjection() {
  // Recreate the trigger so existing installations also pick up new projection
  // fields introduced after the trigger was first installed.
  sqlite.exec(`DROP TRIGGER IF EXISTS ${TRIGGER_NAME};`);
  sqlite.exec(`
    CREATE TRIGGER ${TRIGGER_NAME}
    AFTER INSERT ON sim_sync_snapshots
    WHEN NEW.source_provider <> 'mock'
      AND EXISTS (
        SELECT 1
        FROM carrier_connector_sims l
        WHERE l.sim_id = NEW.sim_id
          AND l.connector_id = NEW.connector_id
      )
    BEGIN
      UPDATE sim_cards
      SET balance = NEW.balance,
          currency_code = NEW.currency_code,
          balance_updated_at = NEW.synced_at,
          updated_at = NEW.synced_at
      WHERE id = NEW.sim_id;
    END;
  `);

  // Existing installations may already have successful carrier snapshots from
  // before balance projection became the default. Bring the canonical SIM
  // balance up to date once on startup, but only for a currently linked real
  // provider. Balance-valid-until remains snapshot metadata and is deliberately
  // not copied into the SIM lifecycle valid_until field.
  sqlite.exec(`
    UPDATE sim_cards
    SET balance = (
          SELECT ss.balance
          FROM sim_sync_snapshots ss
          JOIN carrier_connector_sims l
            ON l.sim_id = ss.sim_id
           AND l.connector_id = ss.connector_id
          WHERE ss.sim_id = sim_cards.id
            AND ss.source_provider <> 'mock'
          ORDER BY ss.synced_at DESC, ss.id DESC
          LIMIT 1
        ),
        currency_code = (
          SELECT ss.currency_code
          FROM sim_sync_snapshots ss
          JOIN carrier_connector_sims l
            ON l.sim_id = ss.sim_id
           AND l.connector_id = ss.connector_id
          WHERE ss.sim_id = sim_cards.id
            AND ss.source_provider <> 'mock'
          ORDER BY ss.synced_at DESC, ss.id DESC
          LIMIT 1
        ),
        balance_updated_at = COALESCE((
          SELECT ss.synced_at
          FROM sim_sync_snapshots ss
          JOIN carrier_connector_sims l
            ON l.sim_id = ss.sim_id
           AND l.connector_id = ss.connector_id
          WHERE ss.sim_id = sim_cards.id
            AND ss.source_provider <> 'mock'
          ORDER BY ss.synced_at DESC, ss.id DESC
          LIMIT 1
        ), balance_updated_at),
        updated_at = COALESCE((
          SELECT ss.synced_at
          FROM sim_sync_snapshots ss
          JOIN carrier_connector_sims l
            ON l.sim_id = ss.sim_id
           AND l.connector_id = ss.connector_id
          WHERE ss.sim_id = sim_cards.id
            AND ss.source_provider <> 'mock'
          ORDER BY ss.synced_at DESC, ss.id DESC
          LIMIT 1
        ), updated_at)
    WHERE EXISTS (
      SELECT 1
      FROM sim_sync_snapshots ss
      JOIN carrier_connector_sims l
        ON l.sim_id = ss.sim_id
       AND l.connector_id = ss.connector_id
      WHERE ss.sim_id = sim_cards.id
        AND ss.source_provider <> 'mock'
    );
  `);
}
