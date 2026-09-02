import { asc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  simCards,
  simTariffRateRules,
  simTariffRates,
  simTariffRuleConditions,
  simTariffs,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { COUNTRY_REGIONS } from "@/lib/countries";
import {
  getAllowanceUnitsForService,
  getBillingUnitsForService,
  getConditionTypesForService,
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

const nullablePositiveInteger = (message: string) =>
  z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
    z.number().int().positive(message).nullable(),
  );

const serviceCodes = new Set<string>(TARIFF_SERVICES.map((item) => item.code));
const countryCodes = new Set(COUNTRY_REGIONS.map((item) => item.code));
const destinationSpecialCodes = new Set(["HOME", "CURRENT", "OTHER"]);
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const rateSchema = z.object({
  mode: z.enum(["unknown", "free", "charged", "included", "included_unlimited", "unavailable"]),
  amount: nullableNumber("金额不能小于 0"),
  billingUnit: z.string().trim().max(32, "计费单位不正确").optional().default(""),
});

const conditionSchema = z.object({
  type: z.enum(["network_scope", "destination", "roaming_region", "time_window"]),
  value: z.string().trim().min(1, "规则条件不能为空").max(80, "规则条件过长"),
  value2: z.string().trim().max(80, "规则条件过长").optional().default(""),
});

const conditionalRuleSchema = z.object({
  label: z.string().trim().max(100, "规则名称不能超过 100 个字符").optional().default(""),
  mode: z.enum(["free", "charged", "included", "included_unlimited", "package", "unavailable"]),
  amount: nullableNumber("金额或包含量不能小于 0"),
  billingUnit: z.string().trim().max(32, "单位不正确").optional().default(""),
  packagePrice: nullableNumber("套餐价格不能小于 0"),
  packageAllowanceAmount: nullableNumber("套餐包含量不能小于 0"),
  packageAllowanceUnit: z.string().trim().max(32, "套餐包含量单位不正确").optional().default(""),
  validityValue: nullablePositiveInteger("有效期必须为正整数"),
  validityUnit: z.union([z.enum(["day", "month", "year"]), z.literal("")]).optional().default(""),
  autoRenew: z.enum(["unknown", "yes", "no"]).optional().default("unknown"),
  conditions: z.array(conditionSchema).max(8, "单条规则最多添加 8 个条件"),
});

function validateModeFields(
  serviceCode: string,
  value: {
    mode: string;
    amount: number | null;
    billingUnit: string;
    packagePrice?: number | null;
    packageAllowanceAmount?: number | null;
    packageAllowanceUnit?: string;
    validityValue?: number | null;
    validityUnit?: string;
  },
  context: z.RefinementCtx,
  path: (string | number)[],
) {
  if (value.mode === "charged") {
    if (value.amount === null) {
      context.addIssue({ code: "custom", path: [...path, "amount"], message: "收费项目请输入金额" });
    }
    const allowedUnits = getBillingUnitsForService(serviceCode).map((item) => item.value);
    if (!value.billingUnit || !allowedUnits.some((unit) => unit === value.billingUnit)) {
      context.addIssue({ code: "custom", path: [...path, "billingUnit"], message: "请选择适用于该项目的计费单位" });
    }
  }

  if (value.mode === "included") {
    if (value.amount === null || value.amount <= 0) {
      context.addIssue({ code: "custom", path: [...path, "amount"], message: "套餐内包含项目请输入大于 0 的包含量" });
    }
    const allowedUnits = getAllowanceUnitsForService(serviceCode).map((item) => item.value);
    if (!value.billingUnit || !allowedUnits.some((unit) => unit === value.billingUnit)) {
      context.addIssue({ code: "custom", path: [...path, "billingUnit"], message: "请选择适用于该项目的包含量单位" });
    }
  }

  if (value.mode === "package") {
    if (value.packagePrice === null || value.packagePrice === undefined) {
      context.addIssue({ code: "custom", path: [...path, "packagePrice"], message: "套餐/通行证请输入价格" });
    }
    if (value.packageAllowanceAmount === null || value.packageAllowanceAmount === undefined || value.packageAllowanceAmount <= 0) {
      context.addIssue({ code: "custom", path: [...path, "packageAllowanceAmount"], message: "套餐/通行证请输入大于 0 的包含量" });
    }
    const allowedUnits = getAllowanceUnitsForService(serviceCode).map((item) => item.value);
    if (!value.packageAllowanceUnit || !allowedUnits.some((unit) => unit === value.packageAllowanceUnit)) {
      context.addIssue({ code: "custom", path: [...path, "packageAllowanceUnit"], message: "请选择适用于该项目的套餐包含量单位" });
    }
    if ((value.validityValue === null || value.validityValue === undefined) !== !value.validityUnit) {
      context.addIssue({ code: "custom", path: [...path, "validityValue"], message: "套餐有效期的数字和单位需要同时填写" });
    }
  }
}

function validateCondition(serviceCode: string, condition: z.infer<typeof conditionSchema>, context: z.RefinementCtx, path: (string | number)[]) {
  const allowedTypes = new Set(getConditionTypesForService(serviceCode).map((item) => item.value));
  if (!allowedTypes.has(condition.type)) {
    context.addIssue({ code: "custom", path: [...path, "type"], message: "该条件类型不适用于此资费项目" });
    return;
  }

  if (condition.type === "network_scope") {
    if (!new Set(["same_network", "other_network"]).has(condition.value)) {
      context.addIssue({ code: "custom", path: [...path, "value"], message: "请选择同网或异网" });
    }
    return;
  }

  if (condition.type === "destination") {
    if (!countryCodes.has(condition.value) && !destinationSpecialCodes.has(condition.value)) {
      context.addIssue({ code: "custom", path: [...path, "value"], message: "请选择有效的目的地" });
    }
    return;
  }

  if (condition.type === "roaming_region") {
    if (!countryCodes.has(condition.value) && condition.value !== "OTHER") {
      context.addIssue({ code: "custom", path: [...path, "value"], message: "请选择有效的漫游地区" });
    }
    return;
  }

  if (!timePattern.test(condition.value) || !timePattern.test(condition.value2)) {
    context.addIssue({ code: "custom", path: [...path, "value"], message: "时间段需要同时选择开始和结束时间" });
  }
}

const tariffSchema = z
  .object({
    simId: z.coerce.number().int().positive("无效的号码 ID"),
    planName: z.string().trim().max(120, "套餐/资费名称不能超过 120 个字符").optional().default(""),
    planType: z.enum(["unknown", "prepaid", "postpaid"]),
    currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "请选择资费币种"),
    recurringFee: nullableNumber("基础/月费不能小于 0"),
    recurringPeriodValue: nullablePositiveInteger("计费周期必须为正整数"),
    recurringPeriodUnit: z.union([z.enum(["day", "month", "year"]), z.literal("")]).optional().default(""),
    administrationFee: nullableNumber("行政/附加费不能小于 0"),
    autoRenew: z.enum(["unknown", "yes", "no"]),
    roamingAvailable: z.enum(["yes", "no", "unknown"]),
    rates: z.record(z.string(), rateSchema).optional().default({}),
    rules: z.record(z.string(), z.array(conditionalRuleSchema).max(30, "单个资费项目最多保存 30 条条件规则")).optional().default({}),
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
      validateModeFields(serviceCode, rate, context, ["rates", serviceCode]);
    }

    for (const [serviceCode, rules] of Object.entries(value.rules)) {
      if (!serviceCodes.has(serviceCode)) {
        context.addIssue({ code: "custom", path: ["rules", serviceCode], message: "存在未知条件资费项目" });
        continue;
      }

      rules.forEach((rule, ruleIndex) => {
        const rulePath = ["rules", serviceCode, ruleIndex];
        validateModeFields(serviceCode, rule, context, rulePath);
        if (rule.mode !== "package" && rule.conditions.length === 0) {
          context.addIssue({ code: "custom", path: [...rulePath, "conditions"], message: "条件资费至少需要一个适用条件" });
        }
        rule.conditions.forEach((condition, conditionIndex) => {
          validateCondition(serviceCode, condition, context, [...rulePath, "conditions", conditionIndex]);
        });
      });
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

function getConditionalRules(tariffId: number) {
  const ruleRows = db
    .select()
    .from(simTariffRateRules)
    .where(eq(simTariffRateRules.tariffId, tariffId))
    .orderBy(asc(simTariffRateRules.sortOrder), asc(simTariffRateRules.id))
    .all();

  const conditionRows = ruleRows.length
    ? db
        .select()
        .from(simTariffRuleConditions)
        .where(inArray(simTariffRuleConditions.ruleId, ruleRows.map((row) => row.id)))
        .orderBy(asc(simTariffRuleConditions.sortOrder), asc(simTariffRuleConditions.id))
        .all()
    : [];

  const conditionsByRule = new Map<number, typeof conditionRows>();
  for (const condition of conditionRows) {
    const list = conditionsByRule.get(condition.ruleId) ?? [];
    list.push(condition);
    conditionsByRule.set(condition.ruleId, list);
  }

  const grouped = Object.fromEntries(TARIFF_SERVICES.map((service) => [service.code, [] as Record<string, unknown>[]]));
  for (const rule of ruleRows) {
    if (!(rule.serviceCode in grouped)) continue;
    grouped[rule.serviceCode].push({
      id: rule.id,
      label: rule.label,
      mode: rule.mode,
      amount: rule.amount,
      billingUnit: rule.billingUnit,
      packagePrice: rule.packagePrice,
      packageAllowanceAmount: rule.packageAllowanceAmount,
      packageAllowanceUnit: rule.packageAllowanceUnit,
      validityValue: rule.validityValue,
      validityUnit: rule.validityUnit,
      autoRenew: rule.autoRenew,
      conditions: (conditionsByRule.get(rule.id) ?? []).map((condition) => ({
        type: condition.conditionType,
        value: condition.value,
        value2: condition.value2 ?? "",
      })),
    });
  }
  return grouped;
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

  return { ...tariff, rates, rules: getConditionalRules(tariff.id) };
}

function normalizeRate(serviceCode: string, rate: z.infer<typeof rateSchema> | undefined) {
  const service = TARIFF_SERVICES.find((item) => item.code === serviceCode)!;
  const mode = rate?.mode ?? "unknown";

  if (mode === "charged") {
    return { mode, amount: rate?.amount ?? null, billingUnit: rate?.billingUnit || service.defaultUnit };
  }

  if (mode === "included") {
    return { mode, amount: rate?.amount ?? null, billingUnit: rate?.billingUnit || service.defaultAllowanceUnit };
  }

  return { mode, amount: null, billingUnit: null };
}

function normalizeRule(serviceCode: string, rule: z.infer<typeof conditionalRuleSchema>) {
  const service = TARIFF_SERVICES.find((item) => item.code === serviceCode)!;
  if (rule.mode === "charged") {
    return {
      ...rule,
      amount: rule.amount,
      billingUnit: rule.billingUnit || service.defaultUnit,
      packagePrice: null,
      packageAllowanceAmount: null,
      packageAllowanceUnit: null,
      validityValue: null,
      validityUnit: null,
      autoRenew: "unknown" as const,
    };
  }

  if (rule.mode === "included") {
    return {
      ...rule,
      amount: rule.amount,
      billingUnit: rule.billingUnit || service.defaultAllowanceUnit,
      packagePrice: null,
      packageAllowanceAmount: null,
      packageAllowanceUnit: null,
      validityValue: null,
      validityUnit: null,
      autoRenew: "unknown" as const,
    };
  }

  if (rule.mode === "package") {
    return {
      ...rule,
      amount: null,
      billingUnit: null,
      packagePrice: rule.packagePrice,
      packageAllowanceAmount: rule.packageAllowanceAmount,
      packageAllowanceUnit: rule.packageAllowanceUnit || service.defaultAllowanceUnit,
      validityValue: rule.validityValue,
      validityUnit: nullable(rule.validityUnit),
    };
  }

  return {
    ...rule,
    amount: null,
    billingUnit: null,
    packagePrice: null,
    packageAllowanceAmount: null,
    packageAllowanceUnit: null,
    validityValue: null,
    validityUnit: null,
    autoRenew: "unknown" as const,
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
  const localConditionalRules = parsed.data.rules.localIncomingSms ?? [];
  const roamingConditionalRules = parsed.data.rules.roamingIncomingSms ?? [];
  const localIncomingSmsPolicy = localConditionalRules.length
    ? "variable"
    : smsPolicyFromRateMode(normalizedRates.localIncomingSms.mode);
  const roamingIncomingSmsPolicy = roamingConditionalRules.length
    ? "variable"
    : smsPolicyFromRateMode(normalizedRates.roamingIncomingSms.mode);

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

    tx.delete(simTariffRateRules).where(eq(simTariffRateRules.tariffId, tariffId)).run();

    for (const service of TARIFF_SERVICES) {
      const rules = parsed.data.rules[service.code] ?? [];
      rules.forEach((rawRule, ruleIndex) => {
        const rule = normalizeRule(service.code, rawRule);
        const insertedRule = tx
          .insert(simTariffRateRules)
          .values({
            tariffId,
            serviceCode: service.code,
            label: nullable(rule.label),
            mode: rule.mode,
            amount: rule.amount,
            billingUnit: rule.billingUnit,
            packagePrice: rule.packagePrice,
            packageAllowanceAmount: rule.packageAllowanceAmount,
            packageAllowanceUnit: rule.packageAllowanceUnit,
            validityValue: rule.validityValue,
            validityUnit: rule.validityUnit,
            autoRenew: rule.autoRenew,
            sortOrder: ruleIndex,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: simTariffRateRules.id })
          .get();

        if (rule.conditions.length) {
          tx.insert(simTariffRuleConditions)
            .values(
              rule.conditions.map((condition, conditionIndex) => ({
                ruleId: insertedRule.id,
                conditionType: condition.type,
                value: condition.value,
                value2: nullable(condition.value2),
                sortOrder: conditionIndex,
                createdAt: now,
              })),
            )
            .run();
        }
      });
    }
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