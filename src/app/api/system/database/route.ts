import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDatabaseHealth } from "@/db/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  }

  return NextResponse.json({ database: getDatabaseHealth() });
}
