import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { simCards, simTariffRates, simTariffs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getBillingUnitsForService, smsPolicyFromRateMode, TARIFF_SERVICES } from "@/lib/tariff-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

const serviceCodes = new Set<string>(TARIFF_SERVICES.map((item) => item.code));

const rateSchema = z.object({
  mode: z.enum(["unknown", "free", "charged", "included", "unavailable"]),
  amount: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
    z.number().finite().nonnegative("资费金额不能小于 0").nullable(),
  ),
  billingUnit: z
    .union([
      z.enum([
        "per_second",
        "per_6_seconds",
        "per_10_seconds",
        "per_15_seconds",
        "per_30_seconds",
        "per_minute",
        "per_call",
        "per_sms",
        "per_kb",
        "per_mb",
        "per_gb",
        "per_day",
        "per_session",
      ]),
      z.literal(""),
    ])
    .optional()
    .default(""),
});

const tariffSchema = z
  .object({
    simId: z.coerce.number().int().positive("无效的号码 ID"),
    planName: z.string().trim().max(120, "套餐/资费名称不能超过 120 个字符").optional().default(""),
    currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "请选择资费币种"),
    roamingAvailable: z.enum(["yes", "no", "unknown"]),
    rates: z.record(z.string(), rateSchema).optional().default({}),
    usageSummary: z.string().trim().max(300, "使用结论不能超过 300 个字符").optional().default(""),
    sourceUrl: urlField,
    verifiedAt: dateField,
    notes: z.string().trim().max(1000, "资费备注不能超过 1000 个字符").optional().default(""),
  })
  .superRefine((value, context) => {
    for (const [serviceCode, rate] of Object.entries(value.rates)) {
      if (!serviceCodes.has(serviceCode)) {
        context.addIssue({ code: "custom", path: ["rates", serviceCode], message: "存在未知资费项目" });
        continue;
      }
      if (rate.mode === "charged") {
        if (rate.amount === null) {
          context.addIssue({ code: "custom", path: ["rates", serviceCode, "amount"], message: "收费项目请输入金额" });
        }
        if (!rate.billingUnit) {
          context.addIssue({ code: "custom", path: ["rates", serviceCode, "billingUnit"], message: "收费项目请选择计费单位" });
        } else {
          const allowedUnits = getBillingUnitsForService(serviceCode).map((item) => item.value);
          if (!allowedUnits.some((unit) => unit === rate.billingUnit)) {
            context.addIssue({ code: "custom", path: ["rates", serviceCode, "billingUnit"], message: "该计费单位不适用于此资费项目" });
          }
        }
      }
    }
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

function inferLegacyMode(value: string | null) {
  if (!value) return "unknown";
  if (/免费|\bfree\b/i.test(value)) return "free";
  if (/不可用|不支持|unavailable|not available/i.test(value)) return "unavailable";
  return "unknown";
}

function buildTariffResponse(tariff: typeof simTariffs.$inferSelect | null) {
  if (!tariff) return null;

  const rows = db.select().from(simTariffRates).where(eq(simTariffRates.tariffId, tariff.id)).all();
  const rowMap = new Map(rows.map((row) => [row.serviceCode, row]));
  const legacyValues = tariff as typeof tariff & Record<string, string | null>;

  const rates = Object.fromEntries(
    TARIFF_SERVICES.map((service) => {
      const row = rowMap.get(service.code);
      if (row) {
        return [
          service.code,
          {
            mode: row.mode,
            amount: row.amount,
            billingUnit: row.billingUnit || service.defaultUnit,
            legacyText: row.legacyText,
          },
        ];
      }

      const legacyText = legacyValues[service.code] || null;
      return [
        service.code,
        {
          mode: inferLegacyMode(legacyText),
          amount: null,
          billingUnit: service.defaultUnit,
          legacyText,
        },
      ];
    }),
  );

  return { ...tariff, rates };
}

function normalizeRate(serviceCode: string, rate: z.infer<typeof rateSchema> | undefined) {
  const service = TARIFF_SERVICES.find((item) => item.code === serviceCode)!;
  const mode = rate?.mode ?? "unknown";
  return {
    mode,
    amount: mode === "charged" ? (rate?.amount ?? null) : null,
    billingUnit: mode === "charged" ? (rate?.billingUnit || service.defaultUnit) : null,
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
  return NextResponse.json({ tariff: buildTariffResponse(tariff) });
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
  const normalizedRates = Object.fromEntries(
    TARIFF_SERVICES.map((service) => [service.code, normalizeRate(service.code, parsed.data.rates[service.code])]),
  );
  const localIncomingSmsPolicy = smsPolicyFromRateMode(normalizedRates.localIncomingSms.mode);
  const roamingIncomingSmsPolicy = smsPolicyFromRateMode(normalizedRates.roamingIncomingSms.mode);

  db.transaction((tx) => {
    const existing = tx.select({ id: simTariffs.id }).from(simTariffs).where(eq(simTariffs.simId, parsed.data.simId)).get();
    const values = {
      simId: parsed.data.simId,
      planName: nullable(parsed.data.planName),
      currencyCode: parsed.data.currencyCode,
      localIncomingSmsPolicy,
      roamingIncomingSmsPolicy,
      roamingAvailable: parsed.data.roamingAvailable,
      usageSummary: nullable(parsed.data.usageSummary),
      sourceUrl: nullable(parsed.data.sourceUrl),
      verifiedAt: nullable(parsed.data.verifiedAt),
      notes: nullable(parsed.data.notes),
    };

    let tariffId: number;
    if (existing) {
      tariffId = existing.id;
      tx.update(simTariffs).set({ ...values, updatedAt: now }).where(eq(simTariffs.id, tariffId)).run();
    } else {
      tariffId = tx
        .insert(simTariffs)
        .values({ ...values, createdAt: now, updatedAt: now })
        .returning({ id: simTariffs.id })
        .get().id;
    }

    tx.delete(simTariffRates).where(eq(simTariffRates.tariffId, tariffId)).run();
    tx.insert(simTariffRates)
      .values(
        TARIFF_SERVICES.map((service) => {
          const rate = normalizedRates[service.code];
          return {
            tariffId,
            serviceCode: service.code,
            mode: rate.mode,
            amount: rate.amount,
            billingUnit: rate.billingUnit,
            legacyText: null,
            createdAt: now,
            updatedAt: now,
          };
        }),
      )
      .run();
  });

  const tariff = db.select().from(simTariffs).where(eq(simTariffs.simId, parsed.data.simId)).get() ?? null;
  return NextResponse.json({ tariff: buildTariffResponse(tariff) });
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
