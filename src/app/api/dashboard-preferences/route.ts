import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  getDashboardPreferences,
  resetDashboardPreferences,
  saveDashboardPreferences,
} from "@/lib/dashboard-preferences";
import { DASHBOARD_MODULE_IDS } from "@/lib/dashboard-preferences-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const preferencesSchema = z.object({
  version: z.literal(1).optional(),
  modules: z
    .array(
      z.object({
        id: z.enum(DASHBOARD_MODULE_IDS),
        visible: z.boolean(),
      }),
    )
    .length(DASHBOARD_MODULE_IDS.length)
    .refine((items) => new Set(items.map((item) => item.id)).size === DASHBOARD_MODULE_IDS.length, "Dashboard 模块顺序不完整"),
  horizonDays: z.union([z.literal(7), z.literal(30), z.literal(60)]),
  distributionLimit: z.union([z.literal(3), z.literal(6), z.literal(10)]),
  focusedSimIds: z.array(z.number().int().positive()).max(6, "重点号码最多选择 6 张"),
});

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  return null;
}

export async function GET() {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;
  return NextResponse.json({ preferences: getDashboardPreferences() });
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const parsed = preferencesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dashboard 个性化设置不正确" }, { status: 400 });
  }

  return NextResponse.json({ preferences: saveDashboardPreferences({ ...parsed.data, version: 1 }) });
}

export async function DELETE() {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;
  return NextResponse.json({ preferences: resetDashboardPreferences() });
}
