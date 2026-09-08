import "server-only";

import { sqlite } from "@/db";
import type { ReminderItem } from "@/lib/reminders";

export type ConditionEpisodeStatus = "open" | "resolved";

export type ConditionEpisodeRecord = {
  id: number;
  conditionKey: string;
  conditionType: string;
  subjectType: string;
  subjectId: number;
  episodeNo: number;
  status: ConditionEpisodeStatus;
  openedAt: string;
  resolvedAt: string | null;
  lastObservedAt: string;
  snapshot: Record<string, unknown>;
};

type RawEpisode = {
  id: number;
  condition_key: string;
  condition_type: string;
  subject_type: string;
  subject_id: number;
  episode_no: number;
  status: string;
  opened_at: string;
  resolved_at: string | null;
  last_observed_at: string;
  snapshot_json: string | null;
};

type LowBalanceSimRow = {
  id: number;
  label: string;
  phone_number: string | null;
  status: string;
  balance: number | null;
  currency_code: string | null;
  balance_updated_at: string | null;
  low_balance_enabled: number;
  low_balance_threshold: number | null;
  carrier_name: string;
  country: string;
};

export function ensureConditionEpisodeTables() {
  sqlite.exec(`
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

    CREATE UNIQUE INDEX IF NOT EXISTS idx_condition_episodes_occurrence
      ON condition_episodes(condition_key, episode_no);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_condition_episodes_open
      ON condition_episodes(condition_key)
      WHERE status = 'open';
    CREATE INDEX IF NOT EXISTS idx_condition_episodes_subject
      ON condition_episodes(subject_type, subject_id, status);
    CREATE INDEX IF NOT EXISTS idx_condition_episodes_type_status
      ON condition_episodes(condition_type, status);
  `);
}

function parseSnapshot(value: string | null) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function mapEpisode(row: RawEpisode): ConditionEpisodeRecord {
  return {
    id: row.id,
    conditionKey: row.condition_key,
    conditionType: row.condition_type,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    episodeNo: row.episode_no,
    status: row.status === "resolved" ? "resolved" : "open",
    openedAt: row.opened_at,
    resolvedAt: row.resolved_at,
    lastObservedAt: row.last_observed_at,
    snapshot: parseSnapshot(row.snapshot_json),
  };
}

function getOpenEpisode(conditionKey: string) {
  ensureConditionEpisodeTables();
  const row = sqlite
    .prepare(
      `SELECT id, condition_key, condition_type, subject_type, subject_id, episode_no,
              status, opened_at, resolved_at, last_observed_at, snapshot_json
       FROM condition_episodes
       WHERE condition_key = ? AND status = 'open'
       LIMIT 1`,
    )
    .get(conditionKey) as RawEpisode | undefined;
  return row ? mapEpisode(row) : null;
}

function nextEpisodeNo(conditionKey: string) {
  const row = sqlite
    .prepare("SELECT MAX(episode_no) AS value FROM condition_episodes WHERE condition_key = ?")
    .get(conditionKey) as { value?: number | null } | undefined;
  return Math.max(0, Number(row?.value) || 0) + 1;
}

function openEpisode(input: {
  conditionKey: string;
  conditionType: string;
  subjectType: string;
  subjectId: number;
  snapshot: Record<string, unknown>;
  observedAt: string;
}) {
  const episodeNo = nextEpisodeNo(input.conditionKey);
  const result = sqlite
    .prepare(
      `INSERT INTO condition_episodes (
         condition_key, condition_type, subject_type, subject_id, episode_no, status,
         opened_at, resolved_at, last_observed_at, snapshot_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'open', ?, NULL, ?, ?, ?, ?)`,
    )
    .run(
      input.conditionKey,
      input.conditionType,
      input.subjectType,
      input.subjectId,
      episodeNo,
      input.observedAt,
      input.observedAt,
      JSON.stringify(input.snapshot),
      input.observedAt,
      input.observedAt,
    );

  const row = sqlite
    .prepare(
      `SELECT id, condition_key, condition_type, subject_type, subject_id, episode_no,
              status, opened_at, resolved_at, last_observed_at, snapshot_json
       FROM condition_episodes WHERE id = ?`,
    )
    .get(Number(result.lastInsertRowid)) as RawEpisode;
  return mapEpisode(row);
}

function observeEpisode(episode: ConditionEpisodeRecord, snapshot: Record<string, unknown>, observedAt: string) {
  sqlite
    .prepare(
      `UPDATE condition_episodes
       SET last_observed_at = ?, snapshot_json = ?, updated_at = ?
       WHERE id = ? AND status = 'open'`,
    )
    .run(observedAt, JSON.stringify(snapshot), observedAt, episode.id);
  return { ...episode, lastObservedAt: observedAt, snapshot };
}

function resolveEpisode(episode: ConditionEpisodeRecord, observedAt: string) {
  sqlite
    .prepare(
      `UPDATE condition_episodes
       SET status = 'resolved', resolved_at = ?, last_observed_at = ?, updated_at = ?
       WHERE id = ? AND status = 'open'`,
    )
    .run(observedAt, observedAt, observedAt, episode.id);
}

function lowBalanceConditionKey(simId: number) {
  return `low_balance:sim:${simId}`;
}

function balanceConditionEligibleStatus(status: string) {
  return status === "active" || status === "paused";
}

function formatAmount(value: number) {
  return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 6 });
}

export function getLowBalanceReminderItems(): ReminderItem[] {
  ensureConditionEpisodeTables();
  const observedAt = new Date().toISOString();
  const sims = sqlite
    .prepare(
      `SELECT s.id, s.label, s.phone_number, s.status, s.balance, s.currency_code,
              s.balance_updated_at, s.low_balance_enabled, s.low_balance_threshold,
              c.name AS carrier_name, c.country
       FROM sim_cards s
       JOIN carriers c ON c.id = s.carrier_id
       ORDER BY s.id`,
    )
    .all() as LowBalanceSimRow[];

  const activeItems: ReminderItem[] = [];

  sqlite.transaction(() => {
    for (const sim of sims) {
      const conditionKey = lowBalanceConditionKey(sim.id);
      const currentEpisode = getOpenEpisode(conditionKey);
      const enabled = Boolean(sim.low_balance_enabled)
        && sim.low_balance_threshold !== null
        && Number.isFinite(sim.low_balance_threshold)
        && sim.low_balance_threshold >= 0
        && balanceConditionEligibleStatus(sim.status);
      const active = enabled
        && sim.balance !== null
        && Number.isFinite(sim.balance)
        && sim.balance <= (sim.low_balance_threshold as number);

      if (!active) {
        if (currentEpisode) resolveEpisode(currentEpisode, observedAt);
        continue;
      }

      const currencyCode = sim.currency_code || "";
      const snapshot = {
        balance: sim.balance,
        threshold: sim.low_balance_threshold,
        currencyCode: currencyCode || null,
        balanceUpdatedAt: sim.balance_updated_at,
      };
      const episode = currentEpisode
        ? observeEpisode(currentEpisode, snapshot, observedAt)
        : openEpisode({
            conditionKey,
            conditionType: "low_balance",
            subjectType: "sim",
            subjectId: sim.id,
            snapshot,
            observedAt,
          });
      const balanceLabel = `${formatAmount(sim.balance as number)}${currencyCode ? ` ${currencyCode}` : ""}`;
      const thresholdLabel = `${formatAmount(sim.low_balance_threshold as number)}${currencyCode ? ` ${currencyCode}` : ""}`;

      activeItems.push({
        key: `low-balance-${sim.id}-episode-${episode.episodeNo}`,
        simId: sim.id,
        simLabel: sim.label,
        phoneNumber: sim.phone_number,
        carrierName: sim.carrier_name,
        country: sim.country,
        kind: "low_balance",
        title: "余额不足",
        dueDate: null,
        status: "condition",
        days: null,
        href: "/sims",
        detail: `当前余额 ${balanceLabel} · 提醒阈值 ${thresholdLabel}${sim.balance_updated_at ? ` · 余额更新时间 ${sim.balance_updated_at}` : ""}`,
        requirement: `余额需高于 ${thresholdLabel}`,
      });
    }
  })();

  return activeItems;
}
