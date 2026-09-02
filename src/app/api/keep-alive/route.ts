import { asc, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { carriers, simCards, simKeepAliveEvents, simKeepAliveRules } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import {
  addKeepAliveInterval,
  getKeepAliveRuleStatus,
  KEEP_ALIVE_ACTIVITY_TYPES,
  KEEP_ALIVE_DUE_DATE_SOURCES,
  KEEP_ALIVE_INTERVAL_UNITS,
  parseQualifyingActions,
  resolveKeepAliveRuleDueDate,
  type KeepAliveDueDateSource,
} from "@/lib/keep-alive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dateField = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "日期格式不正确")
  .optional()
  .default("");

const activityValues = KEEP_ALIVE_ACTIVITY_TYPES.map((item) => item.value) as [string, ...string[]];
const intervalValues = KEEP_ALIVE_INTERVAL_UNITS.map((item) => item.value) as [string, ...string[]];
const dueDateSourceValues = KEEP_ALIVE_DUE_DATE_SOURCES.map((item) => item.value) as [string, ...string[]];

const ruleSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  simId: z.coerce.number().int().positive("请选择号码"),
  name: z.string().trim().min(1, "请输入规则名称").max(100, "规则名称不能超过 100 个字符"),
  intervalValue: z.coerce.number().int().min(1, "周期不能小于 1").max(3650, "周期数值过大"),
  intervalUnit: z.enum(intervalValues),
  qualifyingActions: z.array(z.enum(activityValues)).min(1, "至少选择一种可刷新保号周期的活动"),
  dueDateSource: z.enum(dueDateSourceValues).optional().default("independent"),
  nextDueDate: dateField,
  warningDays: z.coerce.number().int().min(0).max(365).default(30),
  gracePeriodDays: z.coerce.number().int().min(0).max(365).default(0),
  enabled: z.boolean().default(true),
  notes: z.string().trim().max(500, "规则备注不能超过 500 个字符").optional().default(""),
});

const eventSchema = z.object({
  simId: z.coerce.number().int().positive("请选择号码"),
  activityType: z.enum(activityValues),
  activityDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "请选择活动日期"),
  amount: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
    z.number().finite().nonnegative("金额不能小于 0").nullable(),
  ),
  currencyCode: z.string().trim().max(3, "币种代码不能超过 3 位").optional().default(""),
  balanceAfter: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
    z.number().finite().nonnegative("余额不能小于 0").nullable(),
  ),
  validUntilAfter: dateField,
  notes: z.string().trim().max(500, "记录备注不能超过 500 个字符").optional().default(""),
});

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  return null;
}

function getSim(id: number) {
  return db
    .select({ id: simCards.id, currencyCode: simCards.currencyCode, validUntil: simCards.validUntil })
    .from(simCards)
    .where(eq(simCards.id, id))
    .get();
}

function serializeRule(rule: typeof simKeepAliveRules.$inferSelect, simValidUntil: string | null | undefined) {
  const qualifyingActions = parseQualifyingActions(rule.qualifyingActions);
  const dueDateSource = (rule.dueDateSource === "sim_validity" ? "sim_validity" : "independent") as KeepAliveDueDateSource;
  const nextDueDate = resolveKeepAliveRuleDueDate({
    dueDateSource,
    nextDueDate: rule.nextDueDate,
    simValidUntil,
  });
  const state = getKeepAliveRuleStatus({
    enabled: rule.enabled,
    nextDueDate,
    warningDays: rule.warningDays,
    gracePeriodDays: rule.gracePeriodDays,
  });
  return { ...rule, dueDateSource, nextDueDate, qualifyingActions, ...state };
}

function getRules(simId?: number) {
  const rows = simId
    ? db.select().from(simKeepAliveRules).where(eq(simKeepAliveRules.simId, simId)).orderBy(asc(simKeepAliveRules.id)).all()
    : db.select().from(simKeepAliveRules).orderBy(asc(simKeepAliveRules.id)).all();

  const validityRows = simId
    ? db.select({ id: simCards.id, validUntil: simCards.validUntil }).from(simCards).where(eq(simCards.id, simId)).all()
    : db.select({ id: simCards.id, validUntil: simCards.validUntil }).from(simCards).all();
  const validityBySim = new Map(validityRows.map((sim) => [sim.id, sim.validUntil]));

  return rows
    .map((rule) => serializeRule(rule, validityBySim.get(rule.simId)))
    .sort((a, b) => (a.nextDueDate || "9999-12-31").localeCompare(b.nextDueDate || "9999-12-31") || a.id - b.id);
}

function getEvents(simId?: number) {
  if (simId) {
    return db
      .select()
      .from(simKeepAliveEvents)
      .where(eq(simKeepAliveEvents.simId, simId))
      .orderBy(desc(simKeepAliveEvents.activityDate), desc(simKeepAliveEvents.id))
      .limit(100)
      .all();
  }
  return db
    .select()
    .from(simKeepAliveEvents)
    .orderBy(desc(simKeepAliveEvents.activityDate), desc(simKeepAliveEvents.id))
    .all();
}

function buildPayload(simId?: number) {
  if (simId) {
    const sim = db
      .select({
        id: simCards.id,
        label: simCards.label,
        phoneNumber: simCards.phoneNumber,
        balance: simCards.balance,
        currencyCode: simCards.currencyCode,
        validUntil: simCards.validUntil,
        carrierName: carriers.name,
        country: carriers.country,
        countryCode: carriers.countryCode,
      })
      .from(simCards)
      .innerJoin(carriers, eq(simCards.carrierId, carriers.id))
      .where(eq(simCards.id, simId))
      .get();
    return { sim, rules: getRules(simId), events: getEvents(simId) };
  }

  const sims = db
    .select({
      id: simCards.id,
      label: simCards.label,
      phoneNumber: simCards.phoneNumber,
      status: simCards.status,
      balance: simCards.balance,
      currencyCode: simCards.currencyCode,
      validUntil: simCards.validUntil,
      carrierName: carriers.name,
      country: carriers.country,
      countryCode: carriers.countryCode,
    })
    .from(simCards)
    .innerJoin(carriers, eq(simCards.carrierId, carriers.id))
    .orderBy(asc(carriers.country), asc(carriers.name), asc(simCards.label))
    .all();

  const rules = getRules();
  const events = getEvents();
  const rulesBySim = new Map<number, typeof rules>();
  const latestEventBySim = new Map<number, (typeof events)[number]>();

  for (const rule of rules) {
    const list = rulesBySim.get(rule.simId) ?? [];
    list.push(rule);
    rulesBySim.set(rule.simId, list);
  }
  for (const event of events) {
    if (!latestEventBySim.has(event.simId)) latestEventBySim.set(event.simId, event);
  }

  return {
    sims: sims.map((sim) => ({
      ...sim,
      rules: rulesBySim.get(sim.id) ?? [],
      latestEvent: latestEventBySim.get(sim.id) ?? null,
    })),
  };
}

function latestMatchingEvent(simId: number, qualifyingActions: string[]) {
  return getEvents(simId).find((event) => qualifyingActions.includes(event.activityType)) ?? null;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const rawSimId = request.nextUrl.searchParams.get("simId");
  if (!rawSimId) return NextResponse.json(buildPayload());

  const simId = Number(rawSimId);
  if (!Number.isInteger(simId) || simId <= 0) return NextResponse.json({ error: "无效的号码 ID" }, { status: 400 });
  if (!getSim(simId)) return NextResponse.json({ error: "号码不存在" }, { status: 404 });
  return NextResponse.json(buildPayload(simId));
}

export async function PUT(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const parsed = ruleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "保号规则数据不正确" }, { status: 400 });
  }
  const sim = getSim(parsed.data.simId);
  if (!sim) return NextResponse.json({ error: "号码不存在" }, { status: 404 });

  if (parsed.data.id) {
    const current = db.select().from(simKeepAliveRules).where(eq(simKeepAliveRules.id, parsed.data.id)).get();
    if (!current || current.simId !== parsed.data.simId) return NextResponse.json({ error: "保号规则不存在" }, { status: 404 });
  }

  if (parsed.data.dueDateSource === "sim_validity") {
    const existingLinkedRule = db
      .select({ id: simKeepAliveRules.id, dueDateSource: simKeepAliveRules.dueDateSource })
      .from(simKeepAliveRules)
      .where(eq(simKeepAliveRules.simId, parsed.data.simId))
      .all()
      .find((rule) => rule.dueDateSource === "sim_validity" && rule.id !== parsed.data.id);
    if (existingLinkedRule) {
      return NextResponse.json({ error: "每个号码只能有一条跟随号码有效期的保号规则" }, { status: 400 });
    }
  }

  const qualifyingActions = Array.from(new Set(parsed.data.qualifyingActions));
  let nextDueDate: string | null = null;
  if (parsed.data.dueDateSource === "independent") {
    nextDueDate = parsed.data.nextDueDate || null;
    if (!nextDueDate) {
      const latest = latestMatchingEvent(parsed.data.simId, qualifyingActions);
      if (latest) nextDueDate = addKeepAliveInterval(latest.activityDate, parsed.data.intervalValue, parsed.data.intervalUnit);
    }
  }

  const now = new Date().toISOString();
  const values = {
    simId: parsed.data.simId,
    name: parsed.data.name,
    intervalValue: parsed.data.intervalValue,
    intervalUnit: parsed.data.intervalUnit,
    qualifyingActions: JSON.stringify(qualifyingActions),
    dueDateSource: parsed.data.dueDateSource,
    nextDueDate,
    warningDays: parsed.data.warningDays,
    gracePeriodDays: parsed.data.gracePeriodDays,
    enabled: parsed.data.enabled,
    notes: parsed.data.notes || null,
    updatedAt: now,
  };

  let id = parsed.data.id;
  if (id) {
    db.update(simKeepAliveRules).set(values).where(eq(simKeepAliveRules.id, id)).run();
  } else {
    id = db.insert(simKeepAliveRules).values({ ...values, createdAt: now }).returning({ id: simKeepAliveRules.id }).get().id;
  }

  const rule = db.select().from(simKeepAliveRules).where(eq(simKeepAliveRules.id, id)).get();
  return NextResponse.json({ rule: rule ? serializeRule(rule, sim.validUntil) : null });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "保号记录数据不正确" }, { status: 400 });
  }

  const sim = getSim(parsed.data.simId);
  if (!sim) return NextResponse.json({ error: "号码不存在" }, { status: 404 });

  const currencyCode = parsed.data.currencyCode ? parsed.data.currencyCode.toUpperCase() : sim.currencyCode;
  if ((parsed.data.amount !== null || parsed.data.balanceAfter !== null) && currencyCode && !/^[A-Z]{3}$/.test(currencyCode)) {
    return NextResponse.json({ error: "币种代码不正确" }, { status: 400 });
  }

  const inserted = db
    .insert(simKeepAliveEvents)
    .values({
      simId: parsed.data.simId,
      activityType: parsed.data.activityType,
      activityDate: parsed.data.activityDate,
      amount: parsed.data.amount,
      currencyCode: currencyCode || null,
      balanceAfter: parsed.data.balanceAfter,
      validUntilAfter: parsed.data.validUntilAfter || null,
      notes: parsed.data.notes || null,
      createdAt: new Date().toISOString(),
    })
    .returning()
    .get();

  const simUpdates: Partial<typeof simCards.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (parsed.data.balanceAfter !== null) {
    simUpdates.balance = parsed.data.balanceAfter;
    if (currencyCode) simUpdates.currencyCode = currencyCode;
  }
  if (parsed.data.validUntilAfter) simUpdates.validUntil = parsed.data.validUntilAfter;
  if (parsed.data.balanceAfter !== null || parsed.data.validUntilAfter) {
    db.update(simCards).set(simUpdates).where(eq(simCards.id, parsed.data.simId)).run();
  }

  const advancedRuleIds: number[] = [];
  const rules = db.select().from(simKeepAliveRules).where(eq(simKeepAliveRules.simId, parsed.data.simId)).all();
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const actions = parseQualifyingActions(rule.qualifyingActions);
    if (!actions.includes(parsed.data.activityType)) continue;

    if (rule.dueDateSource === "sim_validity") {
      if (parsed.data.validUntilAfter) advancedRuleIds.push(rule.id);
      continue;
    }

    const calculated = addKeepAliveInterval(parsed.data.activityDate, rule.intervalValue, rule.intervalUnit);
    if (!rule.nextDueDate || calculated > rule.nextDueDate) {
      db.update(simKeepAliveRules)
        .set({ nextDueDate: calculated, updatedAt: new Date().toISOString() })
        .where(eq(simKeepAliveRules.id, rule.id))
        .run();
      advancedRuleIds.push(rule.id);
    }
  }

  return NextResponse.json({ event: inserted, advancedRuleIds, ...buildPayload(parsed.data.simId) }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const type = request.nextUrl.searchParams.get("type");
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "无效的记录 ID" }, { status: 400 });

  if (type === "rule") {
    const deleted = db.delete(simKeepAliveRules).where(eq(simKeepAliveRules.id, id)).returning({ id: simKeepAliveRules.id }).get();
    if (!deleted) return NextResponse.json({ error: "保号规则不存在" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (type === "event") {
    const deleted = db.delete(simKeepAliveEvents).where(eq(simKeepAliveEvents.id, id)).returning({ id: simKeepAliveEvents.id }).get();
    if (!deleted) return NextResponse.json({ error: "保号记录不存在" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "删除类型不正确" }, { status: 400 });
}