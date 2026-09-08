import { NextResponse } from "next/server";
import { buildAttentionItems, getAttentionSummary } from "@/lib/attention-items";
import { getCurrentUser } from "@/lib/auth";
import { getUnifiedReminderItems } from "@/lib/current-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  }

  const items = buildAttentionItems(getUnifiedReminderItems());
  return NextResponse.json({ items, summary: getAttentionSummary(items) });
}
