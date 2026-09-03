import "server-only";

import { eq } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { carriers, simCards, simKeepAliveRules } from "@/db/schema";
import { daysBetweenDates } from "@/lib/keep-alive";
import type { NotificationChannelType } from "@/lib/notification-options";
import {
  DEFAULT_NOTIFICATION_BODY_TEMPLATE,
  DEFAULT_NOTIFICATION_ITEM_TEMPLATE,
  DEFAULT_NOTIFICATION_TITLE_TEMPLATE,
  renderNotificationTemplate,
} from "@/lib/notification-templates";
import { filterReminderItems } from "@/lib/reminder-actions";
import {
  buildReminderItems,
  getReminderKindLabel,
  getReminderRelativeLabel,
  getReminderStatusLabel,
  type ReminderItem,
  type ReminderKind,
  type ReminderStatus,
} from "@/lib/reminders";

export const NOTIFICATION_TIME_ZONE = "Asia/Shanghai";
export const DEFAULT_NOTIFICATION_TIME = "09:00";
export const DEFAULT_NOTIFICATION_MILESTONES = [30, 14, 7, 3, 1, 0] as const;
export const OVERDUE_INITIAL_MILESTONES = [1, 3] as const;
export const OVERDUE_REPEAT_INTERVAL_DAYS = 7;

const ALL_NOTIFICATION_KINDS: ReminderKind[] = ["sim_validity", "keep_alive"];
const ALL_NOTIFICATION_STATUSES: ReminderStatus[] = ["upcoming", "today", "grace", "overdue", "unscheduled"];
const MAX_TIMER_DELAY_MS = 2_147_000_000;
const SCHEDULE_START_TOLERANCE_MS = 60_000;

export type NotificationChannelFilter = {
  kinds: ReminderKind[];
  statuses: ReminderStatus[];
};

export type NotificationChannelConfig = Record<string, unknown>;

export type NotificationChannel = {
  id: number;
  name: string;
  type: NotificationChannelType;
  enabled: boolean;
  config: NotificationChannelConfig;
  createdAt: string;
  updatedAt: string;
};

export type NotificationDelivery = {
  id: number;
  channelId: number | null;
  channelName: string;
  kind: "test" | "reminder";
  reminderKey: string | null;
  reminderStatus: string | null;
  dueDate: string | null;
  deliveredOn: string;
  status: "success" | "failed";
  error: string | null;
  createdAt: string;
};

export type NotificationSettings = {
  enabled: boolean;
  dailyTime: string;
  dailyHour: number;
  milestoneDays: number[];
  catchUpEnabled: boolean;
  titleTemplate: string;
  bodyTemplate: string;
  itemTemplate: string;
  lastDispatchAt: string | null;
  lastScheduledDate: string | null;
  nextDispatchAt: string | null;
  timeZone: string;
  scheduleMode: "daily_exact";
};

type DispatchPlan = {
  instant: Date;
  scheduledDate: string;
  catchUp: boolean;
};

export function ensureNotificationTables() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS notification_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      config_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notification_channels_enabled ON notification_channels(enabled);
    CREATE INDEX IF NOT EXISTS idx_notification_channels_type ON notification_channels(type);

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

    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_channel_id ON notification_deliveries(channel_id);
    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_reminder ON notification_deliveries(reminder_key, reminder_status, delivered_on);
    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_created_at ON notification_deliveries(created_at);
  `);
}

function readSetting(key: string) {
  return (sqlite.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value?: string } | undefined)?.value;
}

function writeSetting(key: string, value: string) {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, value, now);
}

function normalizeDailyTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error("每日通知时间格式不正确");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error("每日通知时间格式不正确");
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeMilestoneDays(values: readonly number[]) {
  const normalized = [...new Set(values.map((value) => Math.trunc(Number(value))).filter((value) => Number.isInteger(value) && value >= 0 && value <= 365))]
    .sort((a, b) => b - a);
  if (!normalized.length) throw new Error("至少需要保留一个通知里程碑");
  return normalized;
}

function readMilestoneDays() {
  const raw = readSetting("notification_milestone_days");
  if (!raw) return [...DEFAULT_NOTIFICATION_MILESTONES];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_NOTIFICATION_MILESTONES];
    return normalizeMilestoneDays(parsed.map(Number));
  } catch {
    return [...DEFAULT_NOTIFICATION_MILESTONES];
  }
}

function normalizeTemplate(value: string, fallback: string, maxLength: number, label: string) {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized) return fallback;
  if (normalized.length > maxLength) throw new Error(`${label}不能超过 ${maxLength} 个字符`);
  return normalized;
}

type ZonedDateTimeParts = {
  date: string;
  hour: number;
  minute: number;
  second: number;
};

function datePartsInTimeZone(date = new Date()): ZonedDateTimeParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: NOTIFICATION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function addDaysToDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

function localDateTimeToInstant(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = normalizeDailyTime(time).split(":").map(Number);
  const desiredUtcLike = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = new Date(desiredUtcLike);

  for (let index = 0; index < 3; index += 1) {
    const actual = datePartsInTimeZone(guess);
    const [actualYear, actualMonth, actualDay] = actual.date.split("-").map(Number);
    const actualUtcLike = Date.UTC(actualYear, actualMonth - 1, actualDay, actual.hour, actual.minute, actual.second);
    const delta = desiredUtcLike - actualUtcLike;
    if (Math.abs(delta) < 1000) break;
    guess = new Date(guess.getTime() + delta);
  }

  return guess;
}

function getNextDispatchPlan(
  settings: Pick<NotificationSettings, "enabled" | "dailyTime" | "lastScheduledDate" | "catchUpEnabled">,
  now = new Date(),
): DispatchPlan | null {
  if (!settings.enabled) return null;
  const parts = datePartsInTimeZone(now);
  const todayTarget = localDateTimeToInstant(parts.date, settings.dailyTime);
  const delta = now.getTime() - todayTarget.getTime();

  if (now.getTime() < todayTarget.getTime()) {
    return { instant: todayTarget, scheduledDate: parts.date, catchUp: false };
  }

  if (settings.lastScheduledDate === parts.date) {
    const tomorrow = addDaysToDate(parts.date, 1);
    return { instant: localDateTimeToInstant(tomorrow, settings.dailyTime), scheduledDate: tomorrow, catchUp: false };
  }

  if (delta <= SCHEDULE_START_TOLERANCE_MS || settings.catchUpEnabled) {
    return { instant: new Date(now.getTime() + 1000), scheduledDate: parts.date, catchUp: delta > SCHEDULE_START_TOLERANCE_MS };
  }

  const tomorrow = addDaysToDate(parts.date, 1);
  return { instant: localDateTimeToInstant(tomorrow, settings.dailyTime), scheduledDate: tomorrow, catchUp: false };
}

export function getNotificationSettings(): NotificationSettings {
  ensureNotificationTables();
  const legacyHour = Number(readSetting("notification_daily_hour"));
  const rawDailyTime = readSetting("notification_daily_time");
  const fallbackTime = Number.isInteger(legacyHour) && legacyHour >= 0 && legacyHour <= 23
    ? `${String(legacyHour).padStart(2, "0")}:00`
    : DEFAULT_NOTIFICATION_TIME;
  let dailyTime = fallbackTime;
  try {
    dailyTime = normalizeDailyTime(rawDailyTime || fallbackTime);
  } catch {
    dailyTime = DEFAULT_NOTIFICATION_TIME;
  }

  const rawCatchUp = readSetting("notification_catch_up_enabled");
  const base = {
    enabled: readSetting("notification_enabled") === "1",
    dailyTime,
    dailyHour: Number(dailyTime.slice(0, 2)),
    milestoneDays: readMilestoneDays(),
    catchUpEnabled: rawCatchUp === undefined ? true : rawCatchUp !== "0",
    titleTemplate: readSetting("notification_title_template") || DEFAULT_NOTIFICATION_TITLE_TEMPLATE,
    bodyTemplate: readSetting("notification_body_template") || DEFAULT_NOTIFICATION_BODY_TEMPLATE,
    itemTemplate: readSetting("notification_item_template") || DEFAULT_NOTIFICATION_ITEM_TEMPLATE,
    lastDispatchAt: readSetting("notification_last_dispatch_at") || null,
    lastScheduledDate: readSetting("notification_last_scheduled_date") || null,
    timeZone: NOTIFICATION_TIME_ZONE,
    scheduleMode: "daily_exact" as const,
  };

  return {
    ...base,
    nextDispatchAt: getNextDispatchPlan(base)?.instant.toISOString() ?? null,
  };
}

export function setNotificationSchedule(input: {
  enabled: boolean;
  dailyTime: string;
  milestoneDays: number[];
  catchUpEnabled: boolean;
}) {
  const dailyTime = normalizeDailyTime(input.dailyTime);
  const milestoneDays = normalizeMilestoneDays(input.milestoneDays);

  writeSetting("notification_enabled", input.enabled ? "1" : "0");
  writeSetting("notification_daily_time", dailyTime);
  writeSetting("notification_daily_hour", String(Number(dailyTime.slice(0, 2))));
  writeSetting("notification_milestone_days", JSON.stringify(milestoneDays));
  writeSetting("notification_catch_up_enabled", input.catchUpEnabled ? "1" : "0");
  rescheduleNotificationScheduler();
  return getNotificationSettings();
}

export function setNotificationTemplates(input: {
  titleTemplate: string;
  bodyTemplate: string;
  itemTemplate: string;
}) {
  const titleTemplate = normalizeTemplate(input.titleTemplate, DEFAULT_NOTIFICATION_TITLE_TEMPLATE, 300, "通知标题模板");
  const bodyTemplate = normalizeTemplate(input.bodyTemplate, DEFAULT_NOTIFICATION_BODY_TEMPLATE, 4000, "摘要正文模板");
  const itemTemplate = normalizeTemplate(input.itemTemplate, DEFAULT_NOTIFICATION_ITEM_TEMPLATE, 2000, "单条提醒模板");

  writeSetting("notification_title_template", titleTemplate);
  writeSetting("notification_body_template", bodyTemplate);
  writeSetting("notification_item_template", itemTemplate);
  return getNotificationSettings();
}

export function setNotificationSettings(input: {
  enabled: boolean;
  dailyTime: string;
  milestoneDays: number[];
  catchUpEnabled: boolean;
  titleTemplate: string;
  bodyTemplate: string;
  itemTemplate: string;
}) {
  setNotificationSchedule(input);
  return setNotificationTemplates(input);
}

function parseConfig(value: string): NotificationChannelConfig {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as NotificationChannelConfig) : {};
  } catch {
    return {};
  }
}

function mapChannel(row: {
  id: number;
  name: string;
  type: string;
  enabled: number;
  config_json: string;
  created_at: string;
  updated_at: string;
}): NotificationChannel {
  return {
    id: row.id,
    name: row.name,
    type: row.type as NotificationChannelType,
    enabled: Boolean(row.enabled),
    config: parseConfig(row.config_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listNotificationChannels() {
  ensureNotificationTables();
  const rows = sqlite
    .prepare("SELECT id, name, type, enabled, config_json, created_at, updated_at FROM notification_channels ORDER BY id ASC")
    .all() as Array<Parameters<typeof mapChannel>[0]>;
  return rows.map(mapChannel);
}

export function getNotificationChannel(id: number) {
  ensureNotificationTables();
  const row = sqlite
    .prepare("SELECT id, name, type, enabled, config_json, created_at, updated_at FROM notification_channels WHERE id = ?")
    .get(id) as Parameters<typeof mapChannel>[0] | undefined;
  return row ? mapChannel(row) : null;
}

export function createNotificationChannel(input: {
  name: string;
  type: NotificationChannelType;
  enabled: boolean;
  config: NotificationChannelConfig;
}) {
  ensureNotificationTables();
  const now = new Date().toISOString();
  const result = sqlite
    .prepare("INSERT INTO notification_channels (name, type, enabled, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(input.name, input.type, input.enabled ? 1 : 0, JSON.stringify(input.config), now, now);
  return getNotificationChannel(Number(result.lastInsertRowid));
}

export function updateNotificationChannel(input: {
  id: number;
  name: string;
  type: NotificationChannelType;
  enabled: boolean;
  config: NotificationChannelConfig;
}) {
  ensureNotificationTables();
  const result = sqlite
    .prepare("UPDATE notification_channels SET name = ?, type = ?, enabled = ?, config_json = ?, updated_at = ? WHERE id = ?")
    .run(input.name, input.type, input.enabled ? 1 : 0, JSON.stringify(input.config), new Date().toISOString(), input.id);
  if (!result.changes) throw new Error("通知渠道不存在");
  return getNotificationChannel(input.id);
}

export function deleteNotificationChannel(id: number) {
  ensureNotificationTables();
  const result = sqlite.prepare("DELETE FROM notification_channels WHERE id = ?").run(id);
  if (!result.changes) throw new Error("通知渠道不存在");
}

function mapDelivery(row: {
  id: number;
  channel_id: number | null;
  channel_name: string;
  kind: string;
  reminder_key: string | null;
  reminder_status: string | null;
  due_date: string | null;
  delivered_on: string;
  status: string;
  error: string | null;
  created_at: string;
}): NotificationDelivery {
  return {
    id: row.id,
    channelId: row.channel_id,
    channelName: row.channel_name,
    kind: row.kind as "test" | "reminder",
    reminderKey: row.reminder_key,
    reminderStatus: row.reminder_status,
    dueDate: row.due_date,
    deliveredOn: row.delivered_on,
    status: row.status as "success" | "failed",
    error: row.error,
    createdAt: row.created_at,
  };
}

export function listNotificationDeliveries(limit = 50) {
  ensureNotificationTables();
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
  const rows = sqlite
    .prepare(
      `SELECT id, channel_id, channel_name, kind, reminder_key, reminder_status, due_date, delivered_on, status, error, created_at
       FROM notification_deliveries ORDER BY id DESC LIMIT ?`,
    )
    .all(safeLimit) as Array<Parameters<typeof mapDelivery>[0]>;
  return rows.map(mapDelivery);
}

export function getRawCurrentReminderItems(today = datePartsInTimeZone().date) {
  const sims = db
    .select({
      id: simCards.id,
      label: simCards.label,
      phoneNumber: simCards.phoneNumber,
      status: simCards.status,
      validUntil: simCards.validUntil,
      carrierName: carriers.name,
      country: carriers.country,
    })
    .from(simCards)
    .innerJoin(carriers, eq(simCards.carrierId, carriers.id))
    .all();

  const rules = db
    .select({
      id: simKeepAliveRules.id,
      simId: simKeepAliveRules.simId,
      name: simKeepAliveRules.name,
      dueDateSource: simKeepAliveRules.dueDateSource,
      nextDueDate: simKeepAliveRules.nextDueDate,
      warningDays: simKeepAliveRules.warningDays,
      gracePeriodDays: simKeepAliveRules.gracePeriodDays,
      enabled: simKeepAliveRules.enabled,
      minimumRechargeAmount: simKeepAliveRules.minimumRechargeAmount,
      rechargeCurrencyCode: simKeepAliveRules.rechargeCurrencyCode,
    })
    .from(simKeepAliveRules)
    .all();

  return buildReminderItems({ sims, rules, today });
}

export function getCurrentReminderItems() {
  const today = datePartsInTimeZone().date;
  return filterReminderItems(getRawCurrentReminderItems(today), today);
}

function stringConfig(config: NotificationChannelConfig, key: string) {
  const value = config[key];
  return typeof value === "string" ? value.trim() : "";
}

function numberConfig(config: NotificationChannelConfig, key: string, fallback: number) {
  const value = Number(config[key]);
  return Number.isFinite(value) ? value : fallback;
}

function channelFilter(config: NotificationChannelConfig): NotificationChannelFilter {
  const raw = config.filters;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { kinds: [...ALL_NOTIFICATION_KINDS], statuses: [...ALL_NOTIFICATION_STATUSES] };
  }
  const record = raw as Record<string, unknown>;
  const kinds = Array.isArray(record.kinds)
    ? record.kinds.filter((value): value is ReminderKind => typeof value === "string" && ALL_NOTIFICATION_KINDS.includes(value as ReminderKind))
    : [];
  const statuses = Array.isArray(record.statuses)
    ? record.statuses.filter((value): value is ReminderStatus => typeof value === "string" && ALL_NOTIFICATION_STATUSES.includes(value as ReminderStatus))
    : [];
  return {
    kinds: kinds.length ? [...new Set(kinds)] : [...ALL_NOTIFICATION_KINDS],
    statuses: statuses.length ? [...new Set(statuses)] : [...ALL_NOTIFICATION_STATUSES],
  };
}

function channelAcceptsReminder(channel: NotificationChannel, reminder: ReminderItem) {
  const filter = channelFilter(channel.config);
  return filter.kinds.includes(reminder.kind) && filter.statuses.includes(reminder.status);
}

function validateHttpUrl(value: string, label: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label}格式不正确`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`${label}必须使用 http:// 或 https://`);
  return url;
}

async function request(url: string | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    if (!response.ok) {
      const text = (await response.text().catch(() => "")).slice(0, 300);
      throw new Error(`HTTP ${response.status}${text ? ` · ${text}` : ""}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function sendChannelMessage(channel: NotificationChannel, title: string, message: string, reminders: ReminderItem[] = []) {
  const config = channel.config;

  if (channel.type === "webhook") {
    const url = validateHttpUrl(stringConfig(config, "url"), "Webhook URL");
    const method = stringConfig(config, "method").toUpperCase() === "GET" ? "GET" : "POST";
    const bearerToken = stringConfig(config, "bearerToken");
    if (method === "GET") {
      url.searchParams.set("title", title);
      url.searchParams.set("message", message);
      url.searchParams.set("count", String(reminders.length));
      if (reminders.length) url.searchParams.set("reminderKeys", reminders.map((item) => item.key).join(","));
      await request(url, { method: "GET", headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : undefined });
      return;
    }
    await request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}) },
      body: JSON.stringify({ source: "SIMKeeper", event: reminders.length ? "reminder_digest" : "test", title, message, reminders }),
    });
    return;
  }

  if (channel.type === "bark") {
    const serverUrl = validateHttpUrl(stringConfig(config, "serverUrl") || "https://api.day.app", "Bark 服务器地址");
    const deviceKey = stringConfig(config, "deviceKey");
    if (!deviceKey) throw new Error("请填写 Bark Device Key");
    const endpoint = new URL(`${serverUrl.toString().replace(/\/$/, "")}/${encodeURIComponent(deviceKey)}/${encodeURIComponent(title)}/${encodeURIComponent(message)}`);
    const group = stringConfig(config, "group");
    if (group) endpoint.searchParams.set("group", group);
    await request(endpoint);
    return;
  }

  if (channel.type === "gotify") {
    const serverUrl = validateHttpUrl(stringConfig(config, "serverUrl"), "Gotify 服务器地址");
    const token = stringConfig(config, "token");
    if (!token) throw new Error("请填写 Gotify Application Token");
    const endpoint = new URL(`${serverUrl.toString().replace(/\/$/, "")}/message`);
    endpoint.searchParams.set("token", token);
    await request(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, message, priority: numberConfig(config, "priority", 5) }),
    });
    return;
  }

  if (channel.type === "telegram") {
    const botToken = stringConfig(config, "botToken");
    const chatId = stringConfig(config, "chatId");
    const apiBaseUrl = validateHttpUrl(stringConfig(config, "apiBaseUrl") || "https://api.telegram.org", "Telegram API 地址");
    if (!botToken) throw new Error("请填写 Telegram Bot Token");
    if (!chatId) throw new Error("请填写 Telegram Chat ID");
    const endpoint = `${apiBaseUrl.toString().replace(/\/$/, "")}/bot${botToken}/sendMessage`;
    await request(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: `${title}\n\n${message}`, disable_web_page_preview: true }),
    });
    return;
  }

  throw new Error("不支持的通知渠道类型");
}

function insertDelivery(input: {
  channel: NotificationChannel;
  kind: "test" | "reminder";
  reminder?: ReminderItem;
  deliveredOn: string;
  status: "success" | "failed";
  error?: string | null;
}) {
  sqlite
    .prepare(
      `INSERT INTO notification_deliveries
       (channel_id, channel_name, kind, reminder_key, reminder_status, due_date, delivered_on, status, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.channel.id,
      input.channel.name,
      input.kind,
      input.reminder?.key ?? null,
      input.reminder?.status ?? null,
      input.reminder?.dueDate ?? null,
      input.deliveredOn,
      input.status,
      input.error ?? null,
      new Date().toISOString(),
    );
}

function alreadyAttemptedToday(channelId: number, reminder: ReminderItem, deliveredOn: string) {
  const row = sqlite
    .prepare(
      `SELECT id FROM notification_deliveries
       WHERE channel_id = ? AND kind = 'reminder' AND reminder_key = ? AND reminder_status = ?
         AND COALESCE(due_date, '') = COALESCE(?, '') AND delivered_on = ?
       LIMIT 1`,
    )
    .get(channelId, reminder.key, reminder.status, reminder.dueDate, deliveredOn);
  return Boolean(row);
}

function lastReminderDeliveryDate(channelId: number, reminderKey: string) {
  const row = sqlite
    .prepare(
      `SELECT delivered_on FROM notification_deliveries
       WHERE channel_id = ? AND kind = 'reminder' AND reminder_key = ?
       ORDER BY delivered_on DESC, id DESC LIMIT 1`,
    )
    .get(channelId, reminderKey) as { delivered_on?: string } | undefined;
  return row?.delivered_on || null;
}

function automaticReminderIsDue(channel: NotificationChannel, reminder: ReminderItem, settings: NotificationSettings, today: string) {
  if (!channelAcceptsReminder(channel, reminder)) return false;

  if (reminder.status === "upcoming" || reminder.status === "today") {
    return reminder.days !== null && settings.milestoneDays.includes(reminder.days);
  }

  if (reminder.status === "grace" || reminder.status === "overdue") {
    if (reminder.days === null) return false;
    const overdueDays = Math.abs(reminder.days);
    return OVERDUE_INITIAL_MILESTONES.includes(overdueDays as 1 | 3)
      || (overdueDays >= OVERDUE_REPEAT_INTERVAL_DAYS && overdueDays % OVERDUE_REPEAT_INTERVAL_DAYS === 0);
  }

  if (reminder.status === "unscheduled") {
    const lastDate = lastReminderDeliveryDate(channel.id, reminder.key);
    return !lastDate || daysBetweenDates(lastDate, today) >= OVERDUE_REPEAT_INTERVAL_DAYS;
  }

  return false;
}

function digestSharedVariables(channel: NotificationChannel, heading: string, count: number, date: string) {
  return {
    app: "SIMKeeper",
    heading,
    count,
    date,
    channelName: channel.name,
  };
}

function renderReminderItem(settings: NotificationSettings, channel: NotificationChannel, item: ReminderItem, index: number, heading: string, date: string, count: number) {
  const shared = digestSharedVariables(channel, heading, count, date);
  return renderNotificationTemplate(settings.itemTemplate, {
    ...shared,
    index: index + 1,
    simLabel: item.simLabel,
    phoneNumber: item.phoneNumber || "",
    carrierName: item.carrierName,
    country: item.country,
    title: item.title,
    kind: getReminderKindLabel(item.kind),
    status: getReminderStatusLabel(item.status),
    relative: getReminderRelativeLabel(item),
    dueDate: item.dueDate || "",
    dueSuffix: item.dueDate ? ` · ${item.dueDate}` : "",
    detail: item.detail,
    requirement: item.requirement || "",
  });
}

function renderReminderDigest(settings: NotificationSettings, channel: NotificationChannel, items: ReminderItem[], heading: string, date: string) {
  const shared = digestSharedVariables(channel, heading, items.length, date);
  const renderedItems = items.map((item, index) => renderReminderItem(settings, channel, item, index, heading, date, items.length)).join("\n\n");
  const title = renderNotificationTemplate(settings.titleTemplate, shared);
  const message = renderNotificationTemplate(settings.bodyTemplate, { ...shared, items: renderedItems });
  return { title, message };
}

function sampleReminder(date: string): ReminderItem {
  const dueDate = addDaysToDate(date, 7);
  return {
    key: "test-preview",
    simId: 0,
    simLabel: "示例号码",
    phoneNumber: "+852 5123 4567",
    carrierName: "示例运营商",
    country: "香港",
    kind: "sim_validity",
    title: "号码有效期",
    dueDate,
    status: "upcoming",
    days: 7,
    href: "/sims",
    detail: `号码有效期将在 ${dueDate} 到期`,
  };
}

export async function testNotificationChannel(id: number) {
  const channel = getNotificationChannel(id);
  if (!channel) throw new Error("通知渠道不存在");
  const settings = getNotificationSettings();
  const deliveredOn = datePartsInTimeZone().date;
  const sample = sampleReminder(deliveredOn);
  const rendered = renderReminderDigest(settings, channel, [sample], "测试通知", deliveredOn);
  try {
    await sendChannelMessage(channel, rendered.title, rendered.message);
    insertDelivery({ channel, kind: "test", deliveredOn, status: "success" });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "发送失败";
    insertDelivery({ channel, kind: "test", deliveredOn, status: "failed", error: message });
    throw new Error(message);
  }
}

export async function dispatchNotifications(options: { force?: boolean; respectSchedule?: boolean; scheduledDate?: string } = {}) {
  ensureNotificationTables();
  const settings = getNotificationSettings();
  const force = Boolean(options.force);
  const respectSchedule = options.respectSchedule !== false;
  const now = new Date();
  const nowParts = datePartsInTimeZone(now);

  if (!force && !settings.enabled) {
    return { sent: 0, failed: 0, skipped: 0, suppressed: 0, reminders: 0, deliveredReminders: 0, channels: 0, reason: "disabled" as const };
  }

  if (!force && respectSchedule) {
    const scheduledInstant = localDateTimeToInstant(nowParts.date, settings.dailyTime);
    if (settings.lastScheduledDate === nowParts.date) {
      return { sent: 0, failed: 0, skipped: 0, suppressed: 0, reminders: 0, deliveredReminders: 0, channels: 0, reason: "already_scheduled" as const };
    }

    if (options.scheduledDate) {
      if (options.scheduledDate > nowParts.date || now.getTime() < scheduledInstant.getTime()) {
        return { sent: 0, failed: 0, skipped: 0, suppressed: 0, reminders: 0, deliveredReminders: 0, channels: 0, reason: "before_schedule" as const };
      }
      if (options.scheduledDate < nowParts.date && !settings.catchUpEnabled) {
        return { sent: 0, failed: 0, skipped: 0, suppressed: 0, reminders: 0, deliveredReminders: 0, channels: 0, reason: "catch_up_disabled" as const };
      }
    } else {
      if (now.getTime() < scheduledInstant.getTime()) {
        return { sent: 0, failed: 0, skipped: 0, suppressed: 0, reminders: 0, deliveredReminders: 0, channels: 0, reason: "before_schedule" as const };
      }
      if (!settings.catchUpEnabled && now.getTime() - scheduledInstant.getTime() > SCHEDULE_START_TOLERANCE_MS) {
        return { sent: 0, failed: 0, skipped: 0, suppressed: 0, reminders: 0, deliveredReminders: 0, channels: 0, reason: "catch_up_disabled" as const };
      }
    }
  }

  const channels = listNotificationChannels().filter((channel) => channel.enabled);
  const reminders = getCurrentReminderItems();
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let suppressed = 0;
  let deliveredReminders = 0;

  for (const channel of channels) {
    const eligible: ReminderItem[] = [];
    for (const reminder of reminders) {
      if (!channelAcceptsReminder(channel, reminder)) {
        suppressed += 1;
        continue;
      }
      if (!force && !automaticReminderIsDue(channel, reminder, settings, nowParts.date)) {
        suppressed += 1;
        continue;
      }
      if (!force && alreadyAttemptedToday(channel.id, reminder, nowParts.date)) {
        skipped += 1;
        continue;
      }
      eligible.push(reminder);
    }

    if (!eligible.length) continue;

    const rendered = renderReminderDigest(settings, channel, eligible, force ? "当前提醒" : "今日提醒", nowParts.date);
    try {
      await sendChannelMessage(channel, rendered.title, rendered.message, eligible);
      for (const reminder of eligible) {
        insertDelivery({ channel, kind: "reminder", reminder, deliveredOn: nowParts.date, status: "success" });
      }
      sent += 1;
      deliveredReminders += eligible.length;
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "发送失败";
      for (const reminder of eligible) {
        insertDelivery({ channel, kind: "reminder", reminder, deliveredOn: nowParts.date, status: "failed", error: messageText });
      }
      failed += 1;
      deliveredReminders += eligible.length;
    }
  }

  writeSetting("notification_last_dispatch_at", new Date().toISOString());
  if (!force) writeSetting("notification_last_scheduled_date", nowParts.date);

  return {
    sent,
    failed,
    skipped,
    suppressed,
    reminders: reminders.length,
    deliveredReminders,
    channels: channels.length,
    reason: "completed" as const,
  };
}

let schedulerStarted = false;
let schedulerTimer: ReturnType<typeof setTimeout> | null = null;

function armNotificationScheduler() {
  if (!schedulerStarted) return;
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }

  const settings = getNotificationSettings();
  const plan = getNextDispatchPlan(settings);
  if (!plan) return;

  const delay = Math.max(1000, plan.instant.getTime() - Date.now());
  schedulerTimer = setTimeout(() => {
    void dispatchNotifications({ force: false, respectSchedule: true, scheduledDate: plan.scheduledDate })
      .catch((error) => {
        console.error("[SIMKeeper] notification scheduler failed", error);
      })
      .finally(() => {
        armNotificationScheduler();
      });
  }, Math.min(delay, MAX_TIMER_DELAY_MS));
  schedulerTimer.unref?.();
}

export function rescheduleNotificationScheduler() {
  armNotificationScheduler();
}

export function startNotificationScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  armNotificationScheduler();
}
