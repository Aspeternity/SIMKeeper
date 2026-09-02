import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  createBackupPayload,
  createLocalBackup,
  deleteLocalBackup,
  getBackupSummary,
  listLocalBackups,
  readLocalBackup,
  restoreBackupPayload,
} from "@/lib/backups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  return null;
}

function jsonDownload(payload: unknown, filename: string) {
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const download = request.nextUrl.searchParams.get("download");
  if (download) {
    try {
      return jsonDownload(readLocalBackup(download), download);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "备份下载失败" }, { status: 404 });
    }
  }

  if (request.nextUrl.searchParams.get("export") === "1") {
    const payload = createBackupPayload("export");
    const stamp = payload.createdAt.replace(/[-:]/g, "").replace(".", "-");
    return jsonDownload(payload, `simkeeper-export-${stamp}.json`);
  }

  const current = createBackupPayload("preview");
  return NextResponse.json({ backups: listLocalBackups(), current: getBackupSummary(current) });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null) as { action?: unknown; name?: unknown; backup?: unknown } | null;
  if (!body || typeof body.action !== "string") {
    return NextResponse.json({ error: "缺少备份操作" }, { status: 400 });
  }

  try {
    if (body.action === "create") {
      const created = createLocalBackup("manual");
      return NextResponse.json({ ok: true, backup: { name: created.name, ...getBackupSummary(created.payload), size: created.size } }, { status: 201 });
    }

    if (body.action === "restoreLocal") {
      if (typeof body.name !== "string") return NextResponse.json({ error: "请选择要恢复的备份" }, { status: 400 });
      const restored = restoreBackupPayload(readLocalBackup(body.name));
      return NextResponse.json({ ok: true, restored: getBackupSummary(restored.payload), safetyBackup: restored.safetyBackup });
    }

    if (body.action === "restoreImported") {
      const restored = restoreBackupPayload(body.backup);
      return NextResponse.json({ ok: true, restored: getBackupSummary(restored.payload), safetyBackup: restored.safetyBackup });
    }

    return NextResponse.json({ error: "不支持的备份操作" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "备份操作失败" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const name = request.nextUrl.searchParams.get("name");
  if (!name) return NextResponse.json({ error: "请选择要删除的备份" }, { status: 400 });

  try {
    deleteLocalBackup(name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除备份失败" }, { status: 400 });
  }
}
