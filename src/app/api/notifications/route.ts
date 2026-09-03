import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { NOTIFICATION_CHANNEL_TYPES, type NotificationChannelType } from "@/lib/notification-options";
import type { ReminderKind, ReminderStatus } from "@/lib/reminders";
import {
  createNotificationChannel,
  deleteNotificationChannel,
  dispatchNotifications,
  getNotificationChannel,
  getNotificationSettings,
  listNotificationChannels,
  listNotificationDeliveries,
  setNotificationSchedule,
  setNotificationSettings,
  setNotificationTemplates,
  testNotificationChannel,
  updateNotificationChannel,
  type NotificationChannel,
  type NotificationChannelConfig,
} from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const channelTypeValues = NOTIFICATION_CHANNEL_TYPES.map((item) => item.value) as [NotificationChannelType, ...NotificationChannelType[]];
const reminderKindValues = ["sim_validity", "keep_alive"] as const;
const reminderStatusValues = ["upcoming", "today", "grace", "overdue", "unscheduled"] as const;

const httpUrl = z
  .string()
  .trim()
  .min(1, "请填写地址")
  .max(1000, "地址不能超过 1000 个字符")
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "地址必须是有效的 http:// 或 https:// URL");

const channelBaseSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1, "请输入渠道名称").max(80, "渠道名称不能超过 80 个字符"),
  type: z.enum(channelTypeValues),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).default({}),
});

const filterSchema = z.object({
  kinds: z.array(z.enum(reminderKindValues)).min(1, "至少选择一种提醒来源"),
  statuses: z.array(z.enum(reminderStatusValues)).min(1, "至少选择一种提醒状态"),
});

const scheduleSchema = z.object({
  enabled: z.boolean(),
  dailyTime: z.string().trim().regex(/^\d{2}:\d{2}$/).optional(),
  dailyHour: z.coerce.number().int().min(0).max(23).optional(),
  milestoneDays: z.array(z.coerce.number().int().min(0).max(365)).min(1).optional(),
  catchUpEnabled: z.boolean().optional(),
});

const templateSchema = z.object({
  titleTemplate: z.string().max(300),
  bodyTemplate: z.string().max(4000),
  itemTemplate: z.string().max(2000),
});

const defaultFilters = {
  kinds: [...reminderKindValues] as ReminderKind[],
  statuses: [...reminderStatusValues] as ReminderStatus[],
};

function configString(config: NotificationChannelConfig | undefined, key: string) {
  const value = config?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizedFilters(raw: Record<string, unknown>, existing?: NotificationChannelConfig) {
  const source = raw.filters ?? existing?.filters ?? defaultFilters;
  return filterSchema.parse(source);
}

function preservedSecret(
  raw: Record<string, unknown>,
  existing: NotificationChannelConfig | undefined,
  key: string,
  label: string,
  required: boolean,
) {
  const value = typeof raw[key] === "string" ? raw[key].trim() : "";
  if (value) return value;
  const stored = configString(existing, key);
  if (stored) return stored;
  if (required) throw new Error(`请填写 ${label}`);
  return "";
}

function normalizedConfig(type: NotificationChannelType, raw: Record<string, unknown>, existing?: NotificationChannelConfig) {
  const filters = normalizedFilters(raw, existing);

  if (type === "webhook") {
    const base = z
      .object({
        url: httpUrl,
        method: z.enum(["POST", "GET"]).default("POST"),
      })
      .parse(raw);
    return {
      ...base,
      bearerToken: preservedSecret(raw, existing, "bearerToken", "Bearer Token", false),
      filters,
    };
  }

  if (type === "bark") {
    const base = z
      .object({
        serverUrl: httpUrl.default("https://api.day.app"),
        group: z.string().trim().max(100).optional().default("SIMKeeper"),
      })
      .parse(raw);
    return {
      ...base,
      deviceKey: preservedSecret(raw, existing, "deviceKey", "Bark Device Key", true),
      filters,
    };
  }

  if (type === "gotify") {
    const base = z
      .object({
        serverUrl: httpUrl,
        priority: z.coerce.number().int().min(-10).max(10).default(5),
      })
      .parse(raw);
    return {
      ...base,
      token: preservedSecret(raw, existing, "token", "Gotify Application Token", true),
      filters,
    };
  }

  const base = z
    .object({
      apiBaseUrl: httpUrl.default("https://api.telegram.org"),
      chatId: z.string().trim().min(1, "请填写 Telegram Chat ID").max(200),
    })
    .parse(raw);
  return {
    ...base,
    botToken: preservedSecret(raw, existing, "botToken", "Telegram Bot Token", true),
    filters,
  };
}

function secretKeys(type: NotificationChannelType) {
  if (type === "webhook") return ["bearerToken"];
  if (type === "bark") return ["deviceKey"];
  if (type === "gotify") return ["token"];
  return ["botToken"];
}

function channelForClient(channel: NotificationChannel) {
  const config = { ...channel.config };
  const secrets: Record<string, boolean> = {};
  for (const key of secretKeys(channel.type)) {
    secrets[key] = Boolean(configString(channel.config, key));
    delete config[key];
  }
  return { ...channel, config, secrets };
}

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  return null;
}

function responseData() {
  return {
    settings: getNotificationSettings(),
    channels: listNotificationChannels().map(channelForClient),
    deliveries: listNotificationDeliveries(80),
  };
}

function resolveSchedule(raw: unknown) {
  const parsed = scheduleSchema.parse(raw);
  const current = getNotificationSettings();
  const dailyTime = parsed.dailyTime
    ?? (parsed.dailyHour !== undefined ? `${String(parsed.dailyHour).padStart(2, "0")}:00` : current.dailyTime);
  return {
    enabled: parsed.enabled,
    dailyTime,
    milestoneDays: parsed.milestoneDays ?? current.milestoneDays,
    catchUpEnabled: parsed.catchUpEnabled ?? current.catchUpEnabled,
  };
}

export async function GET() {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;
  return NextResponse.json(responseData());
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";

  try {
    if (action === "create") {
      const parsed = channelBaseSchema.parse(body?.channel);
      const channel = createNotificationChannel({
        name: parsed.name,
        type: parsed.type,
        enabled: parsed.enabled,
        config: normalizedConfig(parsed.type, parsed.config),
      });
      if (!channel) throw new Error("通知渠道创建失败");
      return NextResponse.json({ channel: channelForClient(channel), ...responseData() }, { status: 201 });
    }

    if (action === "test") {
      const id = z.coerce.number().int().positive().parse(body?.id);
      await testNotificationChannel(id);
      return NextResponse.json({ ok: true, ...responseData() });
    }

    if (action === "dispatch") {
      const result = await dispatchNotifications({ force: true, respectSchedule: false });
      return NextResponse.json({ result, ...responseData() });
    }

    if (action === "dispatchDue") {
      const result = await dispatchNotifications({ force: false, respectSchedule: true });
      return NextResponse.json({ result, ...responseData() });
    }

    return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "通知渠道数据不正确" }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "通知操作失败" }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";

  try {
    if (action === "schedule") {
      setNotificationSchedule(resolveSchedule(body?.schedule));
      return NextResponse.json(responseData());
    }

    if (action === "templates") {
      const templates = templateSchema.parse(body?.templates);
      setNotificationTemplates(templates);
      return NextResponse.json(responseData());
    }

    // Backward compatibility for clients created before alpha.8.4.
    if (action === "settings") {
      const parsed = scheduleSchema.extend({
        titleTemplate: z.string().max(300).optional(),
        bodyTemplate: z.string().max(4000).optional(),
        itemTemplate: z.string().max(2000).optional(),
      }).parse(body?.settings);
      const current = getNotificationSettings();
      const dailyTime = parsed.dailyTime
        ?? (parsed.dailyHour !== undefined ? `${String(parsed.dailyHour).padStart(2, "0")}:00` : current.dailyTime);
      setNotificationSettings({
        enabled: parsed.enabled,
        dailyTime,
        milestoneDays: parsed.milestoneDays ?? current.milestoneDays,
        catchUpEnabled: parsed.catchUpEnabled ?? current.catchUpEnabled,
        titleTemplate: parsed.titleTemplate ?? current.titleTemplate,
        bodyTemplate: parsed.bodyTemplate ?? current.bodyTemplate,
        itemTemplate: parsed.itemTemplate ?? current.itemTemplate,
      });
      return NextResponse.json(responseData());
    }

    if (action === "channel") {
      const parsed = channelBaseSchema.extend({ id: z.coerce.number().int().positive() }).parse(body?.channel);
      const existing = getNotificationChannel(parsed.id);
      if (!existing) throw new Error("通知渠道不存在");
      const channel = updateNotificationChannel({
        id: parsed.id,
        name: parsed.name,
        type: parsed.type,
        enabled: parsed.enabled,
        config: normalizedConfig(parsed.type, parsed.config, existing.type === parsed.type ? existing.config : undefined),
      });
      if (!channel) throw new Error("通知渠道更新失败");
      return NextResponse.json({ channel: channelForClient(channel), ...responseData() });
    }

    return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "通知渠道数据不正确" }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "通知设置保存失败" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  try {
    const id = z.coerce.number().int().positive().parse(request.nextUrl.searchParams.get("id"));
    deleteNotificationChannel(id);
    return NextResponse.json({ ok: true, ...responseData() });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "无效的通知渠道 ID" }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除通知渠道失败" }, { status: 400 });
  }
}
