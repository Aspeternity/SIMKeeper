import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { simCards, simTariffRates, simTariffs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import {
  getAllowanceUnitsForService,
  getBillingUnitsForService,
  smsPolicyFromRateMode,
  TARIFF_SERVICES,
} from "@/lib/tariff-options";

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

const nullableNumber = (message: string) =>
  z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
    z.number().finite().nonnegative(message).nullable(),
  );

const serviceCodes = new Set<string>(TARIFF_SERVICES.map((item) => item.code));

const rateSchema = z.object({
  mode: z.enum(["unknown", "free", "charged", "included", "included_unlimited", "unavailable"]),
  amount: nullableNumber("金额不能小于 0"),
  billingUnit: z.string().trim().max(32, "计费单位不正确").optional().default(""),
});

const tariffSchema = z
  .object({
    simId: z.coerce.number().int().positive("无效的号码 ID"),
    planName: z.string().trim().max(120, "套餐/资费名称不能超过 120 个字符").optional().default(""),
    planType: z.enum(["unknown", "prepaid", "postpaid"]),
    currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "请选择资费币种"),
    recurringFee: nullableNumber("基础/月费不能小于 0"),
    recurringPeriodValue: z.preprocess(
      (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
      z.number().int().positive("计费周期必须为正整数").nullable(),
    ),
    recurringPeriodUnit: z.union([z.enum(["day", "month", "year"]), z.literal("")]).optional().default(""),
    administrationFee: nullableNumber("行政/附加费不能小于 0"),
    autoRenew: z.enum(["unknown", "yes", "no"]),
    roamingAvailable: z.enum(["yes", "no", "unknown"]),
    rates: z.record(z.string(), rateSchema).optional().default({}),
    usageSummary: z.string().trim().max(300, "使用结论不能超过 300 个字符").optional().default(""),
    sourceUrl: urlField,
    verifiedAt: dateField,
    notes: z.string().trim().max(1000, "资费备注不能超过 1000 个字符").optional().default(""),
  })
  .superRefine((value, context) => {
    if ((value.recurringPeriodValue === null) !== (value.recurringPeriodUnit === "")) {
      context.addIssue({
        code: "custom",
        path: ["recurringPeriodValue"],
        message: "计费周期的数字和单位需要同时填写",
      });
    }

    for (const [serviceCode, rate] of Object.entries(value.rates)) {
      if (!serviceCodes.has(serviceCode)) {
        context.addIssue({ code: "custom", path: ["rates", serviceCode], message: "存在未知资费项目" });
        continue;
      }

      if (rate.mode === "charged") {
        if (rate.amount === null) {
          context.addIssue({ code: "custom", path: ["rates", serviceCode, "amount"], message: "收费项目请输入金额" });
        }
        const allowedUnits = getBillingUnitsForService(serviceCode).map((item) => item.value);
        if (!rate.billingUnit || !allowedUnits.some((unit) => unit === rate.billingUnit)) {
          context.addIssue({ code: "custom", path: ["rates", serviceCode, "billingUnit"], message: "请选择适用于该项目的计费单位" });
        }
      }

      if (rate.mode === "included") {
        if (rate.amount === null || rate.amount <= 0) {
          context.addIssue({ code: "custom", path: ["rates", serviceCode, "amount"], message: "套餐内包含项目请输入大于 0 的包含量" });
        }
        const allowedUnits = getAllowanceUnitsForService(serviceCode).map((item) => item.value);
        if (!rate.billingUnit || !allowedUnits.some((unit) => unit === rate.billingUnit)) {
          context.addIssue({ code: "custom", path: ["rates", serviceCode, "billingUnit"], message: "请选择适用于该项目的包含量单位" });
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
  if (/不限|无限|unlimited/i.test(value)) return "included_unlimited";
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
        const fallbackUnit = row.mode === "included" ? service.defaultAllowanceUnit : service.defaultUnit;
        return [
          service.code,
          {
            mode: row.mode,
            amount: row.amount,
            billingUnit: row.billingUnit || fallbackUnit,
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

  if (mode === "charged") {
    return {
      mode,
      amount: rate?.amount ?? null,
      billingUnit: rate?.billingUnit || service.defaultUnit,
    };
  }

  if (mode === "included") {
    return {
      mode,
      amount: rate?.amount ?? null,
      billingUnit: rate?.billingUnit || service.defaultAllowanceUnit,
    };
  }

  return { mode, amount: null, billingUnit: null };
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
      planType: parsed.data.planType,
      currencyCode: parsed.data.currencyCode,
      recurringFee: parsed.data.recurringFee,
      recurringPeriodValue: parsed.data.recurringPeriodValue,
      recurringPeriodUnit: nullable(parsed.data.recurringPeriodUnit),
      administrationFee: parsed.data.administrationFee,
      autoRenew: parsed.data.autoRenew,
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
