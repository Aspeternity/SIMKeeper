import "server-only";

import { sqlite } from "@/db";
import {
  ensureNotificationTables,
  listNotificationChannels,
  type NotificationChannel,
  type NotificationChannelConfig,
} from "@/lib/notifications";

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
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label}必须使用 http:// 或 https://`);
  }
  return url;
}

async function request(url: string | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
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

async function sendSystemMessage(channel: NotificationChannel, title: string, message: string, eventKey: string) {
  const config = channel.config;

  if (channel.type === "webhook") {
    const url = validateHttpUrl(stringConfig(config, "url"), "Webhook URL");
    const method = stringConfig(config, "method").toUpperCase() === "GET" ? "GET" : "POST";
    const bearerToken = stringConfig(config, "bearerToken");
    if (method === "GET") {
      url.searchParams.set("event", "system_alert");
      url.searchParams.set("eventKey", eventKey);
      url.searchParams.set("title", title);
      url.searchParams.set("message", message);
      await request(url, {
        method: "GET",
        headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : undefined,
      });
      return;
    }
    await request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      },
      body: JSON.stringify({ source: "SIMKeeper", event: "system_alert", eventKey, title, message }),
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

function alreadyDelivered(channelId: number, eventKey: string) {
  return Boolean(
    sqlite.prepare(
      `SELECT id FROM notification_deliveries
       WHERE channel_id = ? AND kind = 'system' AND reminder_key = ? AND status = 'success'
       LIMIT 1`,
    ).get(channelId, eventKey),
  );
}

function insertDelivery(input: {
  channel: NotificationChannel;
  eventKey: string;
  status: "success" | "failed";
  error?: string | null;
}) {
  const now = new Date();
  sqlite.prepare(
    `INSERT INTO notification_deliveries
     (channel_id, channel_name, kind, reminder_key, reminder_status, due_date, delivered_on, status, error, created_at)
     VALUES (?, ?, 'system', ?, 'system', NULL, ?, ?, ?, ?)`,
  ).run(
    input.channel.id,
    input.channel.name,
    input.eventKey,
    now.toISOString().slice(0, 10),
    input.status,
    input.error ?? null,
    now.toISOString(),
  );
}

export async function dispatchSystemNotification(input: {
  eventKey: string;
  title: string;
  message: string;
}) {
  ensureNotificationTables();
  const eventKey = input.eventKey.trim().slice(0, 300);
  if (!eventKey) throw new Error("系统通知事件标识不能为空");
  const channels = listNotificationChannels().filter((channel) => channel.enabled);
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const channel of channels) {
    if (alreadyDelivered(channel.id, eventKey)) {
      skipped += 1;
      continue;
    }
    try {
      await sendSystemMessage(channel, input.title, input.message, eventKey);
      insertDelivery({ channel, eventKey, status: "success" });
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "发送失败";
      insertDelivery({ channel, eventKey, status: "failed", error: message });
      failed += 1;
    }
  }

  return { sent, failed, skipped, channels: channels.length };
}
