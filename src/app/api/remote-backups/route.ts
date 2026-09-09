import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  getRemoteBackupOverview,
  rescheduleRemoteBackupScheduler,
  runRemoteBackup,
  saveRemoteBackupConfig,
  testRemoteBackupConnection,
} from "@/lib/remote-backups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const configSchema = z.object({
  enabled: z.boolean(),
  endpoint: z.string().trim().max(2048, "WebDAV 地址过长"),
  remotePath: z.string().trim().max(512, "远端目录过长"),
  username: z.string().trim().max(512, "WebDAV 用户名过长"),
  password: z.string().max(4096, "WebDAV 密码过长").optional(),
  backupPassphrase: z.string().max(1024, "备份口令过长").optional(),
  scheduleFrequency: z.enum(["daily", "weekly"]),
  scheduleWeekday: z.coerce.number().int().min(0).max(6),
  scheduleHour: z.coerce.number().int().min(0).max(23),
  scheduleMinute: z.coerce.number().int().min(0).max(59),
  scheduleTimezone: z.string().trim().min(1, "请输入时区").max(100, "时区名称过长"),
  retentionCount: z.coerce.number().int().min(1, "至少保留 1 份远端备份").max(100, "最多保留 100 份远端备份"),
});

const testSchema = z.object({
  action: z.literal("test"),
  endpoint: z.string().trim().min(1, "请输入 WebDAV 地址").max(2048),
  remotePath: z.string().trim().max(512),
  username: z.string().trim().max(512),
  password: z.string().max(4096).optional(),
});

const runSchema = z.object({
  action: z.literal("run"),
});

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  return null;
}

function errorResponse(error: unknown, fallback: string, status = 400) {
  return NextResponse.json({
    error: error instanceof Error ? error.message : fallback,
  }, { status });
}

export async function GET() {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  try {
    return NextResponse.json(getRemoteBackupOverview());
  } catch (error) {
    return errorResponse(error, "异地备份状态加载失败", 500);
  }
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const parsed = configSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "异地备份设置不正确" }, { status: 400 });
  }

  try {
    const config = saveRemoteBackupConfig(parsed.data);
    rescheduleRemoteBackupScheduler();
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    return errorResponse(error, "异地备份设置保存失败");
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const test = testSchema.safeParse(body);
  if (test.success) {
    try {
      const result = await testRemoteBackupConnection(test.data);
      return NextResponse.json(result);
    } catch (error) {
      return errorResponse(error, "WebDAV 连接测试失败", 502);
    }
  }

  const run = runSchema.safeParse(body);
  if (run.success) {
    try {
      const result = await runRemoteBackup("manual");
      return NextResponse.json({ ok: true, result });
    } catch (error) {
      return errorResponse(error, "异地备份失败", 502);
    }
  }

  return NextResponse.json({ error: "不支持的异地备份操作" }, { status: 400 });
}
