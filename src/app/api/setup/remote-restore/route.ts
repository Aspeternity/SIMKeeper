import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasAdmin, rotateSessionSecret } from "@/lib/auth";
import { deleteLocalBackup } from "@/lib/backups";
import {
  inspectRemoteBackupFromInput,
  listRemoteBackupsFromInput,
  restoreRemoteBackupFromInput,
} from "@/lib/remote-backups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const connectionSchema = z.object({
  endpoint: z.string().trim().min(1, "请输入 WebDAV 地址").max(2048),
  remotePath: z.string().trim().max(512),
  username: z.string().trim().max(512),
  password: z.string().max(4096).optional(),
});

const listSchema = z.object({
  action: z.literal("list"),
  connection: connectionSchema,
});

const inspectSchema = z.object({
  action: z.literal("inspect"),
  connection: connectionSchema,
  name: z.string().min(1).max(512),
  passphrase: z.string().min(1).max(1024),
});

const restoreSchema = z.object({
  action: z.literal("restore"),
  connection: connectionSchema,
  name: z.string().min(1).max(512),
  passphrase: z.string().min(1).max(1024),
  confirm: z.literal("RESTORE"),
});

function errorResponse(error: unknown, fallback: string, status = 400) {
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status });
}

export async function POST(request: NextRequest) {
  if (hasAdmin()) {
    return NextResponse.json({ error: "当前实例已经存在管理员账户，请登录后从“设置 → 备份与恢复”执行恢复" }, { status: 409 });
  }

  const body = await request.json().catch(() => null);

  const list = listSchema.safeParse(body);
  if (list.success) {
    try {
      return NextResponse.json({ ok: true, backups: await listRemoteBackupsFromInput(list.data.connection) });
    } catch (error) {
      return errorResponse(error, "远端备份库读取失败", 502);
    }
  }

  const inspect = inspectSchema.safeParse(body);
  if (inspect.success) {
    try {
      const inspection = await inspectRemoteBackupFromInput(
        inspect.data.connection,
        inspect.data.name,
        inspect.data.passphrase,
      );
      return NextResponse.json({ ok: true, inspection });
    } catch (error) {
      return errorResponse(error, "远端备份验证失败", 400);
    }
  }

  const restore = restoreSchema.safeParse(body);
  if (restore.success) {
    try {
      const result = await restoreRemoteBackupFromInput(
        restore.data.connection,
        restore.data.name,
        restore.data.passphrase,
      );
      // An uninitialized fresh instance has nothing useful to roll back to. Avoid
      // leaving its empty pre-restore safety JSON in the restored backup library.
      try {
        deleteLocalBackup(result.safetyBackup);
      } catch {
        // Best effort only; restore has already passed database integrity checks.
      }
      rotateSessionSecret();
      return NextResponse.json({ ok: true, result, loginRequired: true });
    } catch (error) {
      return errorResponse(error, "灾难恢复失败", 400);
    }
  }

  return NextResponse.json({ error: "不支持的灾难恢复操作" }, { status: 400 });
}
