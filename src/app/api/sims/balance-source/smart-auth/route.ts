import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getCarrierConnectorStoredCredentials } from "@/lib/carrier-connectors/credentials";
import {
  closeInteractiveBrowserSession,
  dispatchInteractiveBrowserInput,
  getInteractiveBrowserSession,
} from "@/lib/carrier-connectors/interactive-browser-runtime";
import { startSmartInteractiveAuthentication } from "@/lib/carrier-connectors/providers/smart-interactive-auth";
import { getCarrierConnector, getSimSyncSummary } from "@/lib/carrier-connectors/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const startSchema = z.object({
  action: z.literal("start"),
  simId: z.coerce.number().int().positive(),
});

const clickSchema = z.object({
  action: z.literal("input"),
  simId: z.coerce.number().int().positive(),
  sessionId: z.string().uuid(),
  kind: z.literal("click"),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

const scrollSchema = z.object({
  action: z.literal("input"),
  simId: z.coerce.number().int().positive(),
  sessionId: z.string().uuid(),
  kind: z.literal("scroll"),
  deltaY: z.number().finite().min(-1800).max(1800),
});

const pressSchema = z.object({
  action: z.literal("input"),
  simId: z.coerce.number().int().positive(),
  sessionId: z.string().uuid(),
  kind: z.literal("press"),
  key: z.string().min(1).max(24),
});

const reloadSchema = z.object({
  action: z.literal("input"),
  simId: z.coerce.number().int().positive(),
  sessionId: z.string().uuid(),
  kind: z.literal("reload"),
});

const closeSchema = z.object({
  action: z.literal("close"),
  simId: z.coerce.number().int().positive(),
  sessionId: z.string().uuid(),
});

const requestSchema = z.union([
  startSchema,
  clickSchema,
  scrollSchema,
  pressSchema,
  reloadSchema,
  closeSchema,
]);

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  }
  return null;
}

function smartConnectorForSim(simId: number) {
  const summary = getSimSyncSummary(simId);
  if (!summary.connector) return null;
  const connector = getCarrierConnector(summary.connector.id);
  if (!connector || connector.provider !== "smart") return null;
  return connector;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const simId = Number(request.nextUrl.searchParams.get("simId"));
  const sessionId = request.nextUrl.searchParams.get("sessionId") ?? "";
  if (!Number.isInteger(simId) || simId <= 0 || !sessionId) {
    return NextResponse.json({ error: "人工认证会话参数无效" }, { status: 400 });
  }

  const connector = smartConnectorForSim(simId);
  if (!connector) return NextResponse.json({ error: "这张号码没有 Smart My Smart 连接" }, { status: 404 });
  const session = getInteractiveBrowserSession(sessionId, "smart", connector.id);
  if (!session) return NextResponse.json({ error: "人工认证会话已经结束" }, { status: 404 });
  return NextResponse.json({ session }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "人工认证请求格式不正确" }, { status: 400 });
  }

  const connector = smartConnectorForSim(parsed.data.simId);
  if (!connector) return NextResponse.json({ error: "这张号码没有 Smart My Smart 连接" }, { status: 404 });

  try {
    if (parsed.data.action === "start") {
      const credentials = getCarrierConnectorStoredCredentials(connector.id);
      const username = credentials.username?.trim() ?? "";
      const password = credentials.password ?? "";
      if (!username || !password) {
        return NextResponse.json(
          { error: "请先在 Smart My Smart 中保存登录账号和密码，再开始人工认证" },
          { status: 409 },
        );
      }
      const session = await startSmartInteractiveAuthentication({
        connectorId: connector.id,
        username,
        password,
      });
      return NextResponse.json({ session }, { headers: { "Cache-Control": "no-store" } });
    }

    if (parsed.data.action === "close") {
      await closeInteractiveBrowserSession(parsed.data.sessionId, "smart", connector.id);
      return NextResponse.json({ ok: true });
    }

    const session = getInteractiveBrowserSession(parsed.data.sessionId, "smart", connector.id);
    if (!session) return NextResponse.json({ error: "人工认证会话已经结束" }, { status: 404 });

    if (parsed.data.kind === "click") {
      await dispatchInteractiveBrowserInput(parsed.data.sessionId, "smart", connector.id, {
        kind: "click",
        x: parsed.data.x,
        y: parsed.data.y,
      });
    } else if (parsed.data.kind === "scroll") {
      await dispatchInteractiveBrowserInput(parsed.data.sessionId, "smart", connector.id, {
        kind: "scroll",
        deltaY: parsed.data.deltaY,
      });
    } else if (parsed.data.kind === "press") {
      await dispatchInteractiveBrowserInput(parsed.data.sessionId, "smart", connector.id, {
        kind: "press",
        key: parsed.data.key,
      });
    } else {
      await dispatchInteractiveBrowserInput(parsed.data.sessionId, "smart", connector.id, { kind: "reload" });
    }

    const next = getInteractiveBrowserSession(parsed.data.sessionId, "smart", connector.id);
    return NextResponse.json({ session: next }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Smart 人工认证操作失败" },
      { status: 500 },
    );
  }
}
