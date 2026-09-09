import { NextRequest, NextResponse } from "next/server";
import { sqlite } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { listSimLifecycleTimeline } from "@/lib/sim-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  return null;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const simId = Number(request.nextUrl.searchParams.get("simId"));
  if (!Number.isInteger(simId) || simId <= 0) {
    return NextResponse.json({ error: "无效的号码 ID" }, { status: 400 });
  }

  const sim = sqlite.prepare("SELECT id FROM sim_cards WHERE id = ?").get(simId) as { id: number } | undefined;
  if (!sim) return NextResponse.json({ error: "号码不存在" }, { status: 404 });

  const rawLimit = Number(request.nextUrl.searchParams.get("limit") || 80);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, Math.floor(rawLimit))) : 80;
  const events = listSimLifecycleTimeline(simId, limit);

  return NextResponse.json({ simId, events });
}
