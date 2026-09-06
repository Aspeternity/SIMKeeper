import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  getCarrierConnector,
  syncCarrierConnector,
} from "@/lib/carrier-connectors/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  connectorId: z.coerce.number().int().positive("无效的连接 ID"),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "提交的数据不正确" },
      { status: 400 },
    );
  }

  if (!getCarrierConnector(parsed.data.connectorId)) {
    return NextResponse.json({ error: "运营商连接不存在" }, { status: 404 });
  }

  try {
    const result = await syncCarrierConnector(parsed.data.connectorId);
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.errors[0]?.error || "部分号码同步失败",
          result,
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "同步失败" },
      { status: 500 },
    );
  }
}
