import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteSimArchive, listSimArchives } from "@/lib/sim-archives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  return null;
}

export async function GET() {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  return NextResponse.json(
    { records: listSimArchives() },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "删除记录 ID 无效" }, { status: 400 });
  }

  if (!deleteSimArchive(id)) {
    return NextResponse.json({ error: "删除记录不存在" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
