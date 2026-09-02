import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { NOTIFICATION_CHANNEL_TYPES, type NotificationChannelType } from "@/lib/notification-options";
import {
  createNotificationChannel,
  deleteNotificationChannel,
  dispatchNotifications,
  getNotificationSettings,
  listNotificationChannels,
  listNotificationDeliveries,
  setNotificationSettings,
  testNotificationChannel,
  updateNotificationChannel,
} from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const channelTypeValues = NOTIFICATION_CHANNEL_TYPES.map((item) => item.value) as [NotificationChannelType, ...NotificationChannelType[]];

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

function normalizedConfig(type: NotificationChannelType, raw: Record<string, unknown>) {
  if (type === "webhook") {
    return z
      .object({
        url: httpUrl,
        method: z.enum(["POST", "GET"]).default("POST"),
        bearerToken: z.string().trim().max(1000).optional().default(""),
      })
      .parse(raw);
  }
  if (type === "bark") {
    return z
      .object({
        serverUrl: httpUrl.default("https://api.day.app"),
        deviceKey: z.string().trim().min(1, "请填写 Bark Device Key").max(500),
        group: z.string().trim().max(100).optional().default("SIMKeeper"),
      })
      .parse(raw);
  }
  if (type === "gotify") {
    return z
      .object({
        serverUrl: httpUrl,
        token: z.string().trim().min(1, "请填写 Gotify Application Token").max(1000),
        priority: z.coerce.number().int().min(-10).max(10).default(5),
      })
      .parse(raw);
  }
  return z
    .object({
      apiBaseUrl: httpUrl.default("https://api.telegram.org"),
      botToken: z.string().trim().min(1, "请填写 Telegram Bot Token").max(1000),
      chatId: z.string().trim().min(1, "请填写 Telegram Chat ID").max(200),
    })
    .parse(raw);
}

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  return null;
}

function responseData() {
  return {
    settings: getNotificationSettings(),
    channels: listNotificationChannels(),
    deliveries: listNotificationDeliveries(80),
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
      return NextResponse.json({ channel, ...responseData() }, { status: 201 });
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
    if (action === "settings") {
      const parsed = z
        .object({ enabled: z.boolean(), dailyHour: z.coerce.number().int().min(0).max(23) })
        .parse(body?.settings);
      setNotificationSettings(parsed);
      return NextResponse.json(responseData());
    }

    if (action === "channel") {
      const parsed = channelBaseSchema.extend({ id: z.coerce.number().int().positive() }).parse(body?.channel);
      const channel = updateNotificationChannel({
        id: parsed.id,
        name: parsed.name,
        type: parsed.type,
        enabled: parsed.enabled,
        config: normalizedConfig(parsed.type, parsed.config),
      });
      return NextResponse.json({ channel, ...responseData() });
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
