import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { simCards, simTariffs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const shortRate = z.string().trim().max(160, "单项资费说明不能超过 160 个字符").optional().default("");
const dateField = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "确认日期格式不正确")
  .optional()
  .default("");
const urlField = z
  .string()
  .trim()
  .max(500, "来源链接不能超过 500 个字符")
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "请输入有效的 http/https 来源链接")
  .optional()
  .default("");

const tariffSchema = z.object({
  simId: z.coerce.number().int().positive("无效的号码 ID"),
  planName: z.string().trim().max(120, "套餐/资费名称不能超过 120 个字符").optional().default(""),
  localOutgoingCall: shortRate,
  localIncomingCall: shortRate,
  localOutgoingSms: shortRate,
  localIncomingSms: shortRate,
  localData: shortRate,
  internationalOutgoingCall: shortRate,
  internationalOutgoingSms: shortRate,
  roamingOutgoingCall: shortRate,
  roamingIncomingCall: shortRate,
  roamingOutgoingSms: shortRate,
  roamingIncomingSms: shortRate,
  roamingData: shortRate,
  localIncomingSmsPolicy: z.enum(["free", "charged", "unavailable", "unknown"]),
  roamingIncomingSmsPolicy: z.enum(["free", "charged", "unavailable", "unknown"]),
  roamingAvailable: z.enum(["yes", "no", "unknown"]),
  usageSummary: z.string().trim().max(300, "使用结论不能超过 300 个字符").optional().default(""),
  sourceUrl: urlField,
  verifiedAt: dateField,
  notes: z.string().trim().max(1000, "资费备注不能超过 1000 个字符").optional().default(""),
});

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  }
  return null;
}

function nullable(value: string) {
  return value || null;
}

function normalize(data: z.infer<typeof tariffSchema>) {
  return {
    simId: data.simId,
    planName: nullable(data.planName),
    localOutgoingCall: nullable(data.localOutgoingCall),
    localIncomingCall: nullable(data.localIncomingCall),
    localOutgoingSms: nullable(data.localOutgoingSms),
    localIncomingSms: nullable(data.localIncomingSms),
    localData: nullable(data.localData),
    internationalOutgoingCall: nullable(data.internationalOutgoingCall),
    internationalOutgoingSms: nullable(data.internationalOutgoingSms),
    roamingOutgoingCall: nullable(data.roamingOutgoingCall),
    roamingIncomingCall: nullable(data.roamingIncomingCall),
    roamingOutgoingSms: nullable(data.roamingOutgoingSms),
    roamingIncomingSms: nullable(data.roamingIncomingSms),
    roamingData: nullable(data.roamingData),
    localIncomingSmsPolicy: data.localIncomingSmsPolicy,
    roamingIncomingSmsPolicy: data.roamingIncomingSmsPolicy,
    roamingAvailable: data.roamingAvailable,
    usageSummary: nullable(data.usageSummary),
    sourceUrl: nullable(data.sourceUrl),
    verifiedAt: nullable(data.verifiedAt),
    notes: nullable(data.notes),
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const simId = Number(request.nextUrl.searchParams.get("simId"));
  if (!Number.isInteger(simId) || simId <= 0) {
    return NextResponse.json({ error: "无效的号码 ID" }, { status: 400 });
  }

  const sim = db.select({ id: simCards.id }).from(simCards).where(eq(simCards.id, simId)).get();
  if (!sim) return NextResponse.json({ error: "号码不存在" }, { status: 404 });

  const tariff = db.select().from(simTariffs).where(eq(simTariffs.simId, simId)).get() ?? null;
  return NextResponse.json({ tariff });
}

export async function PUT(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const parsed = tariffSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "提交的资费数据不正确" }, { status: 400 });
  }

  const sim = db.select({ id: simCards.id }).from(simCards).where(eq(simCards.id, parsed.data.simId)).get();
  if (!sim) return NextResponse.json({ error: "号码不存在" }, { status: 404 });

  const now = new Date().toISOString();
  const existing = db.select({ id: simTariffs.id }).from(simTariffs).where(eq(simTariffs.simId, parsed.data.simId)).get();
  const values = normalize(parsed.data);

  if (existing) {
    db.update(simTariffs)
      .set({ ...values, updatedAt: now })
      .where(eq(simTariffs.id, existing.id))
      .run();
  } else {
    db.insert(simTariffs)
      .values({ ...values, createdAt: now, updatedAt: now })
      .run();
  }

  const tariff = db.select().from(simTariffs).where(eq(simTariffs.simId, parsed.data.simId)).get();
  return NextResponse.json({ tariff });
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const simId = Number(request.nextUrl.searchParams.get("simId"));
  if (!Number.isInteger(simId) || simId <= 0) {
    return NextResponse.json({ error: "无效的号码 ID" }, { status: 400 });
  }

  db.delete(simTariffs).where(eq(simTariffs.simId, simId)).run();
  return NextResponse.json({ ok: true });
}
