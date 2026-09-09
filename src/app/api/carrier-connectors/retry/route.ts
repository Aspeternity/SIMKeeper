import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  getCarrierConnector,
  rescheduleCarrierConnectorScheduler,
  syncCarrierConnector,
} from "@/lib/carrier-connectors/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const retrySchema = z.object({
  connectorId: z.coerce.number().int().positive("无效的连接 ID"),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  }

  try {
    const input = retrySchema.parse(await request.json());
    const connector = getCarrierConnector(input.connectorId);
    if (!connector) {
      return NextResponse.json({ error: "运营商连接不存在" }, { status: 404 });
    }

    const run = await syncCarrierConnector(connector.id);
    rescheduleCarrierConnectorScheduler();
    const updated = getCarrierConnector(connector.id);

    return NextResponse.json({
      ok: run.ok,
      run,
      connector: updated,
      message: run.ok
        ? `${connector.providerLabel} 同步成功`
        : run.errors.map((item) => item.error).join("；") || `${connector.providerLabel} 同步失败`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "请求参数无效" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "同步重试失败" },
      { status: 500 },
    );
  }
}
