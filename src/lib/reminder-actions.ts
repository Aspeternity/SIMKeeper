import "server-only";

import { sqlite } from "@/db";
import type { ReminderActionRecord, ReminderActionType } from "@/lib/reminder-action-types";
import type { ReminderItem } from "@/lib/reminders";

export function ensureReminderActionTables() {
  sqlite.exec(`
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

    CREATE INDEX IF NOT EXISTS idx_reminder_actions_occurrence
      ON reminder_actions(reminder_key, due_date, id);
    CREATE INDEX IF NOT EXISTS idx_reminder_actions_sim_id
      ON reminder_actions(sim_id, id);
    CREATE INDEX IF NOT EXISTS idx_reminder_actions_acted_at
      ON reminder_actions(acted_at);
  `);

  const columns = sqlite.prepare("PRAGMA table_info(reminder_actions)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "verified")) {
    sqlite.exec("ALTER TABLE reminder_actions ADD COLUMN verified INTEGER NOT NULL DEFAULT 0");
  }
}

type ReminderActionRow = {
  id: number;
  reminder_key: string;
  sim_id: number;
  sim_label: string;
  kind: string;
  title: string;
  due_date: string | null;
  action: string;
  snooze_until: string | null;
  acted_at: string;
  verified: number;
};

function mapAction(row: ReminderActionRow): ReminderActionRecord {
  return {
    id: row.id,
    reminderKey: row.reminder_key,
    simId: row.sim_id,
    simLabel: row.sim_label,
    kind: row.kind as ReminderActionRecord["kind"],
    title: row.title,
    dueDate: row.due_date,
    action: row.action as ReminderActionType,
    snoozeUntil: row.snooze_until,
    actedAt: row.acted_at,
    verified: Boolean(row.verified),
  };
}

export function getReminderOccurrenceKey(reminderKey: string, dueDate: string | null) {
  return `${reminderKey}\u0000${dueDate ?? ""}`;
}

export function getReminderToday(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function listReminderActions(limit = 100) {
  ensureReminderActionTables();
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const rows = sqlite
    .prepare(
      `SELECT id, reminder_key, sim_id, sim_label, kind, title, due_date, action, snooze_until, acted_at, verified
       FROM reminder_actions
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(safeLimit) as ReminderActionRow[];
  return rows.map(mapAction);
}

function listLatestOccurrenceActions() {
  ensureReminderActionTables();
  const rows = sqlite
    .prepare(
      `SELECT ra.id, ra.reminder_key, ra.sim_id, ra.sim_label, ra.kind, ra.title,
              ra.due_date, ra.action, ra.snooze_until, ra.acted_at, ra.verified
       FROM reminder_actions ra
       INNER JOIN (
         SELECT reminder_key, COALESCE(due_date, '') AS due_key, MAX(id) AS max_id
         FROM reminder_actions
         GROUP BY reminder_key, COALESCE(due_date, '')
       ) latest ON latest.max_id = ra.id`,
    )
    .all() as ReminderActionRow[];
  return rows.map(mapAction);
}

export function getCurrentReminderActionMap(today = getReminderToday()) {
  const map = new Map<string, ReminderActionRecord>();
  for (const action of listLatestOccurrenceActions()) {
    if (action.action === "snoozed" && action.snoozeUntil && today >= action.snoozeUntil) continue;
    map.set(getReminderOccurrenceKey(action.reminderKey, action.dueDate), action);
  }
  return map;
}

export function getReminderOccurrenceAction(reminderKey: string, dueDate: string | null, today = getReminderToday()) {
  return getCurrentReminderActionMap(today).get(getReminderOccurrenceKey(reminderKey, dueDate)) ?? null;
}

export function filterReminderItems(reminders: ReminderItem[], today: string) {
  if (!reminders.length) return reminders;
  const latest = getCurrentReminderActionMap(today);

  return reminders.filter((reminder) => {
    const action = latest.get(getReminderOccurrenceKey(reminder.key, reminder.dueDate));
    if (!action) return true;
    if (action.action === "ignored") return false;
    if (action.action === "snoozed") return false;

    // `completed` is audit history only. The real lifecycle data must move forward
    // before an occurrence disappears. This also re-opens alpha.11 one-click
    // "completed" records that were never backed by an actual keep-alive event.
    return true;
  });
}

export function createReminderAction(input: {
  reminder: ReminderItem;
  action: ReminderActionType;
  today: string;
  snoozeDays?: number | null;
  verified?: boolean;
}) {
  ensureReminderActionTables();
  const snoozeDays = input.action === "snoozed" ? Number(input.snoozeDays) : 0;
  if (input.action === "snoozed" && ![1, 3, 7, 14].includes(snoozeDays)) {
    throw new Error("稍后提醒时间不正确");
  }
  if (input.action === "completed" && !input.verified) {
    throw new Error("完成提醒必须先记录真实的生命周期操作");
  }

  const snoozeUntil = input.action === "snoozed" ? addDays(input.today, snoozeDays) : null;
  const actedAt = new Date().toISOString();
  const verified = input.action === "completed" && input.verified ? 1 : 0;
  const result = sqlite
    .prepare(
      `INSERT INTO reminder_actions
       (reminder_key, sim_id, sim_label, kind, title, due_date, action, snooze_until, acted_at, verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.reminder.key,
      input.reminder.simId,
      input.reminder.simLabel,
      input.reminder.kind,
      input.reminder.title,
      input.reminder.dueDate,
      input.action,
      snoozeUntil,
      actedAt,
      verified,
    );

  const row = sqlite
    .prepare(
      `SELECT id, reminder_key, sim_id, sim_label, kind, title, due_date, action, snooze_until, acted_at, verified
       FROM reminder_actions WHERE id = ?`,
    )
    .get(Number(result.lastInsertRowid)) as ReminderActionRow;
  return mapAction(row);
}

export function deleteReminderAction(id: number) {
  ensureReminderActionTables();
  const row = sqlite
    .prepare(
      `SELECT id, reminder_key, sim_id, sim_label, kind, title, due_date, action, snooze_until, acted_at, verified
       FROM reminder_actions WHERE id = ?`,
    )
    .get(id) as ReminderActionRow | undefined;
  if (!row) return null;

  sqlite.prepare("DELETE FROM reminder_actions WHERE id = ?").run(id);
  return mapAction(row);
}
