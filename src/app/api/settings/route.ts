import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getBackupRetention, setBackupRetention } from "@/lib/backups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const settingsSchema = z.object({
  backupRetention: z.coerce.number().int().min(1, "至少保留 1 份本地备份").max(100, "最多保留 100 份本地备份"),
});

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  return null;
}

export async function GET() {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;
  return NextResponse.json({ backupRetention: getBackupRetention() });
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "设置数据不正确" }, { status: 400 });
  }

  try {
    return NextResponse.json({ backupRetention: setBackupRetention(parsed.data.backupRetention) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "设置保存失败" }, { status: 400 });
  }
}
