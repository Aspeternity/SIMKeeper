import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  createReminderAction,
  getReminderToday,
  listReminderActions,
} from "@/lib/reminder-actions";
import { getCurrentReminderItems, getRawCurrentReminderItems } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.object({
  reminderKey: z.string().trim().min(1, "提醒标识不能为空").max(200, "提醒标识过长"),
  dueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "提醒日期格式不正确").nullable(),
  action: z.enum(["snoozed", "ignored"]),
  snoozeDays: z.coerce.number().int().optional(),
});

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  return null;
}

export async function GET() {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;
  return NextResponse.json({ reminders: getCurrentReminderItems(), history: listReminderActions(100) });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  if (body?.action === "completed") {
    return NextResponse.json(
      { error: "“完成处理”必须先记录真实的充值、短信、续期或其他生命周期操作，不能直接隐藏提醒" },
      { status: 400 },
    );
  }

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "提醒处理数据不正确" }, { status: 400 });
  }

  const rawReminders = getRawCurrentReminderItems();
  const reminder = rawReminders.find(
    (item) => item.key === parsed.data.reminderKey && item.dueDate === parsed.data.dueDate,
  );
  if (!reminder) {
    return NextResponse.json({ error: "这条提醒已发生变化，请刷新后再处理" }, { status: 409 });
  }

  try {
    const action = createReminderAction({
      reminder,
      action: parsed.data.action,
      today: getReminderToday(),
      snoozeDays: parsed.data.snoozeDays,
    });
    return NextResponse.json({ action, reminders: getCurrentReminderItems() }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "提醒处理失败" }, { status: 400 });
  }
}
