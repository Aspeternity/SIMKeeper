import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sqlite } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import {
  completeGlobeOneOtpAuthentication,
  startGlobeOneOtpAuthentication,
} from "@/lib/carrier-connectors/providers/globe";
import { syncCarrierConnector } from "@/lib/carrier-connectors/store";
import { decryptCarrierConnectorCredential } from "@/lib/credential-crypto";
import type { CarrierConnectorSimContext } from "@/lib/carrier-connectors/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    simId: z.coerce.number().int().positive("无效的号码 ID"),
  }),
  z.object({
    action: z.literal("verify"),
    simId: z.coerce.number().int().positive("无效的号码 ID"),
    code: z.string().trim().regex(/^\d{4,8}$/, "请输入短信中的 GlobeOne 验证码"),
  }),
]);

type GlobeAuthRow = {
  connector_id: number;
  provider: string;
  credentials_encrypted: string | null;
  id: number;
  label: string;
  phone_number: string | null;
  carrier_name: string;
  country_code: string;
  balance: number | null;
  currency_code: string | null;
};

function getGlobeAuthRow(simId: number) {
  return sqlite
    .prepare(
      `SELECT cc.id AS connector_id, cc.provider, cc.credentials_encrypted,
              s.id, s.label, s.phone_number, c.name AS carrier_name, c.country_code,
              s.balance, s.currency_code
       FROM carrier_connector_sims l
       JOIN carrier_connectors cc ON cc.id = l.connector_id
       JOIN sim_cards s ON s.id = l.sim_id
       JOIN carriers c ON c.id = s.carrier_id
       WHERE s.id = ?
       LIMIT 1`,
    )
    .get(simId) as GlobeAuthRow | undefined;
}

function parseCredentials(encrypted: string | null) {
  if (!encrypted) return {} as Record<string, string>;
  const plaintext = decryptCarrierConnectorCredential(encrypted);
  try {
    const parsed = JSON.parse(plaintext) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch {
    return {} as Record<string, string>;
  }
}

function toSimContext(row: GlobeAuthRow): CarrierConnectorSimContext {
  return {
    id: row.id,
    label: row.label,
    phoneNumber: row.phone_number,
    carrierName: row.carrier_name,
    countryCode: row.country_code,
    balance: row.balance,
    currencyCode: row.currency_code,
  };
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "提交的数据不正确" },
      { status: 400 },
    );
  }

  const row = getGlobeAuthRow(parsed.data.simId);
  if (!row) {
    return NextResponse.json({ error: "这张号码尚未启用 GlobeOne 自动同步" }, { status: 404 });
  }
  if (row.provider !== "globe") {
    return NextResponse.json({ error: "当前号码的自动余额来源不是 GlobeOne" }, { status: 409 });
  }

  const sim = toSimContext(row);

  try {
    if (parsed.data.action === "start") {
      const result = await startGlobeOneOtpAuthentication(row.connector_id, sim);
      return NextResponse.json({
        ok: true,
        expiresAt: result.expiresAt,
        message: "GlobeOne 验证码已发送，请输入短信中的验证码",
      });
    }

    const credentials = parseCredentials(row.credentials_encrypted);
    const pin = credentials.pin?.trim() ?? "";
    if (!pin) {
      return NextResponse.json(
        { error: "未保存 GlobeOne PIN，请先编辑号码并填写 6 位 PIN" },
        { status: 409 },
      );
    }

    await completeGlobeOneOtpAuthentication(
      row.connector_id,
      sim,
      pin,
      parsed.data.code,
    );

    const sync = await syncCarrierConnector(row.connector_id);
    return NextResponse.json({
      ok: true,
      authenticated: true,
      sync,
      message: sync.ok
        ? "GlobeOne 验证完成，余额已同步"
        : "GlobeOne 验证完成，但余额同步仍返回错误",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "GlobeOne 验证失败" },
      { status: 502 },
    );
  }
}
