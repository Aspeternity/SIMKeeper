import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { simCards } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getEsimProfileSummary, revealEsimProfile } from "@/lib/esim-profiles";

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

  const sim = db.select({ id: simCards.id, simType: simCards.simType }).from(simCards).where(eq(simCards.id, simId)).get();
  if (!sim) return NextResponse.json({ error: "号码不存在" }, { status: 404 });
  if (sim.simType !== "esim") return NextResponse.json({ error: "该号码不是 eSIM" }, { status: 400 });

  const reveal = request.nextUrl.searchParams.get("reveal") === "1";
  const profile = reveal ? revealEsimProfile(simId) : getEsimProfileSummary(simId);

  return NextResponse.json(
    { profile },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
