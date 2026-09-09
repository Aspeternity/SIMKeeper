import "server-only";

import { sqlite } from "@/db";

export type SecurityEventStatus = "success" | "failure" | "info";

export type SecurityEvent = {
  id: number;
  eventType: string;
  status: SecurityEventStatus;
  detail: string | null;
  createdAt: string;
};

const MAX_SECURITY_EVENTS = 500;

export function recordSecurityEvent(
  eventType: string,
  status: SecurityEventStatus = "success",
  detail?: string | null,
) {
  const createdAt = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO security_events (event_type, status, detail, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(eventType, status, detail?.trim() || null, createdAt);

  sqlite
    .prepare(
      `DELETE FROM security_events
       WHERE id NOT IN (
         SELECT id FROM security_events
         ORDER BY created_at DESC, id DESC
         LIMIT ?
       )`,
    )
    .run(MAX_SECURITY_EVENTS);
}

export function listSecurityEvents(limit = 12): SecurityEvent[] {
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit) || 12));
  return sqlite
    .prepare(
      `SELECT id, event_type, status, detail, created_at
       FROM security_events
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .all(safeLimit)
    .map((row) => {
      const value = row as {
        id: number;
        event_type: string;
        status: SecurityEventStatus;
        detail: string | null;
        created_at: string;
      };
      return {
        id: value.id,
        eventType: value.event_type,
        status: value.status,
        detail: value.detail,
        createdAt: value.created_at,
      };
    });
}
