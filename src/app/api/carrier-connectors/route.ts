import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { listCarrierConnectorProviders } from "@/lib/carrier-connectors/registry";
import {
  createCarrierConnector,
  deleteCarrierConnector,
  ensureCarrierConnectorTables,
  getCarrierConnector,
  getSimSyncSummary,
  listCarrierConnectors,
  listSimSyncHistory,
  rescheduleCarrierConnectorScheduler,
  updateCarrierConnector,
} from "@/lib/carrier-connectors/store";
import { CONNECTOR_SYNC_INTERVAL_OPTIONS } from "@/lib/carrier-connectors/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedIntervals = new Set<number>(
  CONNECTOR_SYNC_INTERVAL_OPTIONS.map((item) => item.value),
);

const mutationSchema = z.object({
  name: z.string().trim().min(1, "请输入连接名称").max(100, "连接名称不能超过 100 个字符"),
  provider: z.string().trim().min(1, "请选择 Provider").max(80),
  syncIntervalMinutes: z.coerce
    .number()
    .int()
    .refine((value) => allowedIntervals.has(value), "不支持的自动同步间隔"),
  simIds: z.array(z.coerce.number().int().positive()).max(500).default([]),
  providerConfig: z.record(z.string(), z.unknown()).optional().default({}),
  credentials: z.record(z.string(), z.string().max(16000, "连接凭据内容过长")).optional(),
  clearCredentials: z.boolean().optional().default(false),
});

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  }
  return null;
}

function positiveId(value: string | null) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  ensureCarrierConnectorTables();
  const simIdRaw = request.nextUrl.searchParams.get("simId");
  if (simIdRaw !== null) {
    const simId = positiveId(simIdRaw);
    if (!simId) return NextResponse.json({ error: "无效的号码 ID" }, { status: 400 });
    const historyLimit = Number(request.nextUrl.searchParams.get("history") || 0);
    return NextResponse.json({
      sync: getSimSyncSummary(simId),
      history: historyLimit > 0 ? listSimSyncHistory(simId, historyLimit) : undefined,
    });
  }

  return NextResponse.json({
    connectors: listCarrierConnectors(),
    providers: listCarrierConnectorProviders(),
  });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const parsed = mutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "提交的数据不正确" },
      { status: 400 },
    );
  }

  try {
    const connector = createCarrierConnector(parsed.data);
    rescheduleCarrierConnectorScheduler();
    return NextResponse.json({ connector }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建运营商连接失败" },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "无效的连接 ID" }, { status: 400 });
  }

  const parsed = mutationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "提交的数据不正确" },
      { status: 400 },
    );
  }

  try {
    if (!getCarrierConnector(id)) {
      return NextResponse.json({ error: "运营商连接不存在" }, { status: 404 });
    }
    const connector = updateCarrierConnector(id, parsed.data);
    rescheduleCarrierConnectorScheduler();
    return NextResponse.json({ connector });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新运营商连接失败" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const id = positiveId(request.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "无效的连接 ID" }, { status: 400 });
  if (!getCarrierConnector(id)) {
    return NextResponse.json({ error: "运营商连接不存在" }, { status: 404 });
  }

  try {
    await deleteCarrierConnector(id);
    rescheduleCarrierConnectorScheduler();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除运营商连接失败" },
      { status: 400 },
    );
  }
}
