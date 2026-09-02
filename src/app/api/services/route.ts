import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { carriers, simBoundServices, simCards } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import {
  SERVICE_BINDING_STATUSES,
  SERVICE_BINDING_TYPES,
  SERVICE_CATEGORIES,
  SERVICE_IMPORTANCE_LEVELS,
} from "@/lib/service-bindings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const categoryValues = SERVICE_CATEGORIES.map((item) => item.value) as [string, ...string[]];
const bindingTypeValues = SERVICE_BINDING_TYPES.map((item) => item.value) as [string, ...string[]];
const importanceValues = SERVICE_IMPORTANCE_LEVELS.map((item) => item.value) as [string, ...string[]];
const statusValues = SERVICE_BINDING_STATUSES.map((item) => item.value) as [string, ...string[]];

const dateField = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "日期格式不正确")
  .optional()
  .default("");

const serviceSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  simId: z.coerce.number().int().positive("请选择号码"),
  serviceName: z.string().trim().min(1, "请输入服务名称").max(100, "服务名称不能超过 100 个字符"),
  category: z.enum(categoryValues),
  bindingType: z.enum(bindingTypeValues),
  accountIdentifier: z.string().trim().max(200, "账号标识不能超过 200 个字符").optional().default(""),
  importance: z.enum(importanceValues),
  status: z.enum(statusValues),
  website: z
    .string()
    .trim()
    .max(500, "网址不能超过 500 个字符")
    .refine((value) => !value || /^https?:\/\//i.test(value), "网址必须以 http:// 或 https:// 开头")
    .optional()
    .default(""),
  boundAt: dateField,
  verifiedAt: dateField,
  notes: z.string().trim().max(1000, "备注不能超过 1000 个字符").optional().default(""),
});

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  return null;
}

function simExists(id: number) {
  return db.select({ id: simCards.id }).from(simCards).where(eq(simCards.id, id)).get();
}

function getBindings(simId?: number) {
  const base = db
    .select({
      id: simBoundServices.id,
      simId: simBoundServices.simId,
      serviceName: simBoundServices.serviceName,
      category: simBoundServices.category,
      bindingType: simBoundServices.bindingType,
      accountIdentifier: simBoundServices.accountIdentifier,
      importance: simBoundServices.importance,
      status: simBoundServices.status,
      website: simBoundServices.website,
      boundAt: simBoundServices.boundAt,
      verifiedAt: simBoundServices.verifiedAt,
      notes: simBoundServices.notes,
      createdAt: simBoundServices.createdAt,
      updatedAt: simBoundServices.updatedAt,
      simLabel: simCards.label,
      phoneNumber: simCards.phoneNumber,
      carrierName: carriers.name,
      country: carriers.country,
      countryCode: carriers.countryCode,
    })
    .from(simBoundServices)
    .innerJoin(simCards, eq(simBoundServices.simId, simCards.id))
    .innerJoin(carriers, eq(simCards.carrierId, carriers.id));

  if (simId) {
    return base
      .where(eq(simBoundServices.simId, simId))
      .orderBy(asc(simBoundServices.status), asc(simBoundServices.serviceName), asc(simBoundServices.id))
      .all();
  }

  return base
    .orderBy(asc(simBoundServices.status), asc(simBoundServices.serviceName), asc(simBoundServices.id))
    .all();
}

function getSims() {
  return db
    .select({
      id: simCards.id,
      label: simCards.label,
      phoneNumber: simCards.phoneNumber,
      carrierName: carriers.name,
      country: carriers.country,
      countryCode: carriers.countryCode,
    })
    .from(simCards)
    .innerJoin(carriers, eq(simCards.carrierId, carriers.id))
    .orderBy(asc(carriers.country), asc(carriers.name), asc(simCards.label))
    .all();
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const rawSimId = request.nextUrl.searchParams.get("simId");
  if (!rawSimId) return NextResponse.json({ bindings: getBindings(), sims: getSims() });

  const simId = Number(rawSimId);
  if (!Number.isInteger(simId) || simId <= 0) return NextResponse.json({ error: "无效的号码 ID" }, { status: 400 });
  if (!simExists(simId)) return NextResponse.json({ error: "号码不存在" }, { status: 404 });
  return NextResponse.json({ bindings: getBindings(simId) });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const parsed = serviceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "绑定服务数据不正确" }, { status: 400 });
  if (!simExists(parsed.data.simId)) return NextResponse.json({ error: "号码不存在" }, { status: 404 });

  const now = new Date().toISOString();
  const inserted = db
    .insert(simBoundServices)
    .values({
      simId: parsed.data.simId,
      serviceName: parsed.data.serviceName,
      category: parsed.data.category,
      bindingType: parsed.data.bindingType,
      accountIdentifier: parsed.data.accountIdentifier || null,
      importance: parsed.data.importance,
      status: parsed.data.status,
      website: parsed.data.website || null,
      boundAt: parsed.data.boundAt || null,
      verifiedAt: parsed.data.verifiedAt || null,
      notes: parsed.data.notes || null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: simBoundServices.id })
    .get();

  const binding = getBindings().find((item) => item.id === inserted.id) ?? null;
  return NextResponse.json({ binding }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const parsed = serviceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "绑定服务数据不正确" }, { status: 400 });
  if (!parsed.data.id) return NextResponse.json({ error: "缺少绑定记录 ID" }, { status: 400 });
  if (!simExists(parsed.data.simId)) return NextResponse.json({ error: "号码不存在" }, { status: 404 });

  const current = db.select().from(simBoundServices).where(eq(simBoundServices.id, parsed.data.id)).get();
  if (!current) return NextResponse.json({ error: "绑定记录不存在" }, { status: 404 });

  db.update(simBoundServices)
    .set({
      simId: parsed.data.simId,
      serviceName: parsed.data.serviceName,
      category: parsed.data.category,
      bindingType: parsed.data.bindingType,
      accountIdentifier: parsed.data.accountIdentifier || null,
      importance: parsed.data.importance,
      status: parsed.data.status,
      website: parsed.data.website || null,
      boundAt: parsed.data.boundAt || null,
      verifiedAt: parsed.data.verifiedAt || null,
      notes: parsed.data.notes || null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(simBoundServices.id, parsed.data.id))
    .run();

  const binding = getBindings().find((item) => item.id === parsed.data.id) ?? null;
  return NextResponse.json({ binding });
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "无效的绑定记录 ID" }, { status: 400 });

  const deleted = db.delete(simBoundServices).where(eq(simBoundServices.id, id)).returning({ id: simBoundServices.id }).get();
  if (!deleted) return NextResponse.json({ error: "绑定记录不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
