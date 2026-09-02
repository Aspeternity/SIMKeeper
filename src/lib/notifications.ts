import "server-only";

import { eq } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { carriers, simCards, simKeepAliveRules } from "@/db/schema";
import type { NotificationChannelType } from "@/lib/notification-options";
import {
  buildReminderItems,
  getReminderRelativeLabel,
  getReminderStatusLabel,
  type ReminderItem,
} from "@/lib/reminders";

export const NOTIFICATION_TIME_ZONE = "Asia/Shanghai";
export const DEFAULT_NOTIFICATION_HOUR = 9;
export const NOTIFICATION_CHECK_INTERVAL_MS = 15 * 60 * 1000;

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
  dailyHour: number;
  lastDispatchAt: string | null;
  timeZone: string;
  checkIntervalMinutes: number;
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

export function getNotificationSettings(): NotificationSettings {
  ensureNotificationTables();
  const rawHour = Number(readSetting("notification_daily_hour"));
  return {
    enabled: readSetting("notification_enabled") === "1",
    dailyHour: Number.isInteger(rawHour) && rawHour >= 0 && rawHour <= 23 ? rawHour : DEFAULT_NOTIFICATION_HOUR,
    lastDispatchAt: readSetting("notification_last_dispatch_at") || null,
    timeZone: NOTIFICATION_TIME_ZONE,
    checkIntervalMinutes: NOTIFICATION_CHECK_INTERVAL_MS / 60000,
  };
}

export function setNotificationSettings(input: { enabled: boolean; dailyHour: number }) {
  if (!Number.isInteger(input.dailyHour) || input.dailyHour < 0 || input.dailyHour > 23) {
    throw new Error("每日通知时间需要在 0-23 点之间");
  }
  writeSetting("notification_enabled", input.enabled ? "1" : "0");
  writeSetting("notification_daily_hour", String(input.dailyHour));
  return getNotificationSettings();
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
    .prepare(
      "INSERT INTO notification_channels (name, type, enabled, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
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

function datePartsInTimeZone(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: NOTIFICATION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour),
  };
}

export function getCurrentReminderItems() {
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
    })
    .from(simKeepAliveRules)
    .all();

  return buildReminderItems({ sims, rules, today: datePartsInTimeZone().date });
}

function stringConfig(config: NotificationChannelConfig, key: string) {
  const value = config[key];
  return typeof value === "string" ? value.trim() : "";
}

function numberConfig(config: NotificationChannelConfig, key: string, fallback: number) {
  const value = Number(config[key]);
  return Number.isFinite(value) ? value : fallback;
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

async function sendChannelMessage(channel: NotificationChannel, title: string, message: string, reminder?: ReminderItem) {
  const config = channel.config;

  if (channel.type === "webhook") {
    const url = validateHttpUrl(stringConfig(config, "url"), "Webhook URL");
    const method = stringConfig(config, "method").toUpperCase() === "GET" ? "GET" : "POST";
    const bearerToken = stringConfig(config, "bearerToken");
    if (method === "GET") {
      url.searchParams.set("title", title);
      url.searchParams.set("message", message);
      if (reminder) {
        url.searchParams.set("reminderKey", reminder.key);
        url.searchParams.set("status", reminder.status);
      }
      await request(url, { method: "GET", headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : undefined });
      return;
    }
    await request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}) },
      body: JSON.stringify({ source: "SIMKeeper", event: reminder ? "reminder" : "test", title, message, reminder: reminder ?? null }),
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

function reminderMessage(item: ReminderItem) {
  const lines = [
    `${item.simLabel}${item.phoneNumber ? ` · ${item.phoneNumber}` : ""}`,
    `${item.carrierName} · ${item.country}`,
    `${item.title} · ${getReminderStatusLabel(item.status)} · ${getReminderRelativeLabel(item)}`,
    item.detail,
  ];
  return lines.join("\n");
}

export async function testNotificationChannel(id: number) {
  const channel = getNotificationChannel(id);
  if (!channel) throw new Error("通知渠道不存在");
  const deliveredOn = datePartsInTimeZone().date;
  try {
    await sendChannelMessage(channel, "SIMKeeper 测试通知", "如果你看到这条消息，说明这个通知渠道已经配置成功。\n\n这是一条测试消息，不代表号码存在待处理事项。");
    insertDelivery({ channel, kind: "test", deliveredOn, status: "success" });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "发送失败";
    insertDelivery({ channel, kind: "test", deliveredOn, status: "failed", error: message });
    throw new Error(message);
  }
}

export async function dispatchNotifications(options: { force?: boolean; respectSchedule?: boolean } = {}) {
  ensureNotificationTables();
  const settings = getNotificationSettings();
  const force = Boolean(options.force);
  const respectSchedule = options.respectSchedule !== false;
  const nowParts = datePartsInTimeZone();

  if (!force && !settings.enabled) {
    return { sent: 0, failed: 0, skipped: 0, reminders: 0, channels: 0, reason: "disabled" as const };
  }
  if (!force && respectSchedule && nowParts.hour < settings.dailyHour) {
    return { sent: 0, failed: 0, skipped: 0, reminders: 0, channels: 0, reason: "before_schedule" as const };
  }

  const channels = listNotificationChannels().filter((channel) => channel.enabled);
  const reminders = getCurrentReminderItems();
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const channel of channels) {
    for (const reminder of reminders) {
      if (!force && alreadyAttemptedToday(channel.id, reminder, nowParts.date)) {
        skipped += 1;
        continue;
      }

      const title = `[SIMKeeper] ${reminder.simLabel} · ${getReminderStatusLabel(reminder.status)}`;
      try {
        await sendChannelMessage(channel, title, reminderMessage(reminder), reminder);
        insertDelivery({ channel, kind: "reminder", reminder, deliveredOn: nowParts.date, status: "success" });
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "发送失败";
        insertDelivery({ channel, kind: "reminder", reminder, deliveredOn: nowParts.date, status: "failed", error: message });
        failed += 1;
      }
    }
  }

  writeSetting("notification_last_dispatch_at", new Date().toISOString());
  return { sent, failed, skipped, reminders: reminders.length, channels: channels.length, reason: "completed" as const };
}

export function startNotificationScheduler() {
  const run = () => {
    void dispatchNotifications({ force: false, respectSchedule: true }).catch((error) => {
      console.error("[SIMKeeper] notification scheduler failed", error);
    });
  };

  const firstTimer = setTimeout(run, 30_000);
  const interval = setInterval(run, NOTIFICATION_CHECK_INTERVAL_MS);
  firstTimer.unref?.();
  interval.unref?.();
}