import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { captureInteractiveBrowserFrame } from "@/lib/carrier-connectors/interactive-browser-runtime";
import { getCarrierConnector, getSimSyncSummary } from "@/lib/carrier-connectors/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function smartConnectorForSim(simId: number) {
  const summary = getSimSyncSummary(simId);
  if (!summary.connector) return null;
  const connector = getCarrierConnector(summary.connector.id);
  if (!connector || connector.provider !== "smart") return null;
  return connector;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });

  const simId = Number(request.nextUrl.searchParams.get("simId"));
  const sessionId = request.nextUrl.searchParams.get("sessionId") ?? "";
  if (!Number.isInteger(simId) || simId <= 0 || !sessionId) {
    return NextResponse.json({ error: "人工认证会话参数无效" }, { status: 400 });
  }

  const connector = smartConnectorForSim(simId);
  if (!connector) return NextResponse.json({ error: "这张号码没有 Smart My Smart 连接" }, { status: 404 });

  const frame = await captureInteractiveBrowserFrame(sessionId, "smart", connector.id).catch(() => null);
  if (!frame) return NextResponse.json({ error: "人工认证画面已经结束" }, { status: 404 });

  return new Response(new Uint8Array(frame), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
