import "server-only";

import { sqlite } from "@/db";
import type { CarrierProviderErrorType } from "@/lib/carrier-connectors/types";

export type CarrierConnectorAttempt = {
  id: number;
  connectorId: number;
  attemptedAt: string;
  completedAt: string;
  status: "success" | "error";
  errorType: CarrierProviderErrorType | null;
  errorMessage: string | null;
  failureCount: number;
  retryAt: string | null;
};

type RawAttempt = {
  id: number;
  connector_id: number;
  attempted_at: string;
  completed_at: string;
  status: "success" | "error";
  error_type: CarrierProviderErrorType | null;
  error_message: string | null;
  failure_count: number;
  retry_at: string | null;
};

export function ensureCarrierConnectorDiagnosticTables() {
  sqlite.exec(`
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

    CREATE INDEX IF NOT EXISTS idx_carrier_connector_attempts_connector_time
      ON carrier_connector_attempts(connector_id, attempted_at DESC, id DESC);

    CREATE TRIGGER IF NOT EXISTS trg_carrier_connector_attempt_history
    AFTER UPDATE OF last_success_at, last_error_at, failure_count ON carrier_connectors
    WHEN NEW.last_attempt_at IS NOT NULL
      AND (
        NEW.last_success_at IS NOT OLD.last_success_at
        OR NEW.last_error_at IS NOT OLD.last_error_at
        OR NEW.failure_count <> OLD.failure_count
      )
    BEGIN
      INSERT OR REPLACE INTO carrier_connector_attempts (
        connector_id,
        attempted_at,
        completed_at,
        status,
        error_type,
        error_message,
        failure_count,
        retry_at
      ) VALUES (
        NEW.id,
        NEW.last_attempt_at,
        NEW.updated_at,
        CASE WHEN NEW.status = 'connected' AND NEW.last_error IS NULL THEN 'success' ELSE 'error' END,
        NEW.last_error_type,
        NEW.last_error,
        COALESCE(NEW.failure_count, 0),
        (SELECT retry_at FROM carrier_connector_retries WHERE connector_id = NEW.id)
      );

      DELETE FROM carrier_connector_attempts
      WHERE connector_id = NEW.id
        AND id NOT IN (
          SELECT id
          FROM carrier_connector_attempts
          WHERE connector_id = NEW.id
          ORDER BY attempted_at DESC, id DESC
          LIMIT 200
        );
    END;
  `);
}

export function listCarrierConnectorAttempts(connectorId: number, limit = 8): CarrierConnectorAttempt[] {
  ensureCarrierConnectorDiagnosticTables();
  const normalizedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = sqlite
    .prepare(
      `SELECT id, connector_id, attempted_at, completed_at, status, error_type,
              error_message, failure_count, retry_at
       FROM carrier_connector_attempts
       WHERE connector_id = ?
       ORDER BY attempted_at DESC, id DESC
       LIMIT ?`,
    )
    .all(connectorId, normalizedLimit) as RawAttempt[];

  return rows.map((row) => ({
    id: row.id,
    connectorId: row.connector_id,
    attemptedAt: row.attempted_at,
    completedAt: row.completed_at,
    status: row.status,
    errorType: row.error_type,
    errorMessage: row.error_message,
    failureCount: row.failure_count,
    retryAt: row.retry_at,
  }));
}
