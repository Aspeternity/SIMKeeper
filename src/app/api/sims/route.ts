import { asc, eq } from "drizzle-orm";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { carriers, simCards, simTariffs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dateField = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "日期格式不正确")
  .optional()
  .default("");

const simSchema = z
  .object({
    label: z.string().trim().min(1, "请输入号码名称").max(80, "号码名称不能超过 80 个字符"),
    phoneNumber: z.string().trim().max(40, "手机号不能超过 40 个字符").optional().default(""),
    carrierId: z.coerce.number().int().positive("请选择运营商"),
    simType: z.enum(["physical", "esim"]),
    iccid: z
      .string()
      .trim()
      .max(32, "ICCID 不能超过 32 位")
      .refine((value) => value === "" || /^\d{10,32}$/.test(value), "ICCID 应为 10-32 位数字")
      .optional()
      .default(""),
    balance: z.preprocess(
      (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
      z.number().finite().nonnegative("余额不能小于 0").nullable(),
    ),
    currencyCode: z.string().trim().max(3, "币种代码不能超过 3 位").optional().default(""),
    status: z.enum(["active", "paused", "expired", "closed"]),
    activationDate: dateField,
    validUntil: dateField,
    notes: z.string().trim().max(500, "备注不能超过 500 个字符").optional().default(""),
  })
  .superRefine((value, context) => {
    const currencyCode = value.currencyCode.toUpperCase();
    if (value.balance !== null && !/^[A-Z]{3}$/.test(currencyCode)) {
      context.addIssue({ code: "custom", path: ["currencyCode"], message: "填写余额时请选择币种" });
    }
    if (value.activationDate && value.validUntil && value.activationDate > value.validUntil) {
      context.addIssue({ code: "custom", path: ["validUntil"], message: "有效期不能早于激活日期" });
    }
  });

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  }
  return null;
}

const rowSelection = {
  id: simCards.id,
  label: simCards.label,
  phoneNumber: simCards.phoneNumber,
  carrierId: simCards.carrierId,
  carrierName: carriers.name,
  country: carriers.country,
  countryCode: carriers.countryCode,
  simType: simCards.simType,
  iccid: simCards.iccid,
  balance: simCards.balance,
  currencyCode: simCards.currencyCode,
  status: simCards.status,
  activationDate: simCards.activationDate,
  validUntil: simCards.validUntil,
  notes: simCards.notes,
  createdAt: simCards.createdAt,
  updatedAt: simCards.updatedAt,
  tariffId: simTariffs.id,
  tariffPlanName: simTariffs.planName,
  localIncomingSmsPolicy: simTariffs.localIncomingSmsPolicy,
  roamingIncomingSmsPolicy: simTariffs.roamingIncomingSmsPolicy,
  roamingAvailable: simTariffs.roamingAvailable,
  tariffUsageSummary: simTariffs.usageSummary,
  tariffVerifiedAt: simTariffs.verifiedAt,
};

function listRows() {
  return db
    .select(rowSelection)
    .from(simCards)
    .innerJoin(carriers, eq(simCards.carrierId, carriers.id))
    .leftJoin(simTariffs, eq(simTariffs.simId, simCards.id))
    .orderBy(asc(carriers.country), asc(carriers.name), asc(simCards.label))
    .all();
}

function getRow(id: number) {
  return db
    .select(rowSelection)
    .from(simCards)
    .innerJoin(carriers, eq(simCards.carrierId, carriers.id))
    .leftJoin(simTariffs, eq(simTariffs.simId, simCards.id))
    .where(eq(simCards.id, id))
    .get();
}

function normalizePhoneNumber(phoneNumber: string, countryCode: string) {
  const value = phoneNumber.trim();
  if (!value) return { phoneNumber: null, error: null };

  try {
    const parsed = parsePhoneNumberFromString(value, countryCode as CountryCode);
    if (!parsed || !parsed.isPossible()) {
      return { phoneNumber: null, error: "手机号格式与所选运营商所在国家/地区不匹配" };
    }
    if (parsed.country && parsed.country !== countryCode) {
      return { phoneNumber: null, error: "手机号国家/地区与所选运营商不一致" };
    }
    return { phoneNumber: parsed.number, error: null };
  } catch {
    return { phoneNumber: null, error: "手机号格式不正确" };
  }
}

function normalize(parsed: z.infer<typeof simSchema>, phoneNumber: string | null) {
  return {
    label: parsed.label,
    phoneNumber,
    carrierId: parsed.carrierId,
    simType: parsed.simType,
    iccid: parsed.iccid || null,
    balance: parsed.balance,
    currencyCode: parsed.balance === null ? null : parsed.currencyCode.toUpperCase(),
    status: parsed.status,
    activationDate: parsed.activationDate || null,
    validUntil: parsed.validUntil || null,
    notes: parsed.notes || null,
  };
}

export async function GET() {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;
  return NextResponse.json({ sims: listRows() });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const parsed = simSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "提交的数据不正确" }, { status: 400 });
  }

  const carrier = db
    .select({ id: carriers.id, countryCode: carriers.countryCode })
    .from(carriers)
    .where(eq(carriers.id, parsed.data.carrierId))
    .get();
  if (!carrier) {
    return NextResponse.json({ error: "所选运营商不存在，请重新选择" }, { status: 400 });
  }

  const normalizedPhone = normalizePhoneNumber(parsed.data.phoneNumber, carrier.countryCode);
  if (normalizedPhone.error) {
    return NextResponse.json({ error: normalizedPhone.error }, { status: 400 });
  }

  const now = new Date().toISOString();
  const inserted = db
    .insert(simCards)
    .values({ ...normalize(parsed.data, normalizedPhone.phoneNumber), createdAt: now, updatedAt: now })
    .returning({ id: simCards.id })
    .get();

  return NextResponse.json({ sim: getRow(inserted.id) }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "无效的号码 ID" }, { status: 400 });
  }

  const parsed = simSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "提交的数据不正确" }, { status: 400 });
  }

  const current = db.select({ id: simCards.id }).from(simCards).where(eq(simCards.id, id)).get();
  if (!current) {
    return NextResponse.json({ error: "号码不存在" }, { status: 404 });
  }

  const carrier = db
    .select({ id: carriers.id, countryCode: carriers.countryCode })
    .from(carriers)
    .where(eq(carriers.id, parsed.data.carrierId))
    .get();
  if (!carrier) {
    return NextResponse.json({ error: "所选运营商不存在，请重新选择" }, { status: 400 });
  }

  const normalizedPhone = normalizePhoneNumber(parsed.data.phoneNumber, carrier.countryCode);
  if (normalizedPhone.error) {
    return NextResponse.json({ error: normalizedPhone.error }, { status: 400 });
  }

  db.update(simCards)
    .set({ ...normalize(parsed.data, normalizedPhone.phoneNumber), updatedAt: new Date().toISOString() })
    .where(eq(simCards.id, id))
    .run();

  return NextResponse.json({ sim: getRow(id) });
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "无效的号码 ID" }, { status: 400 });
  }

  const deleted = db.delete(simCards).where(eq(simCards.id, id)).returning({ id: simCards.id }).get();
  if (!deleted) {
    return NextResponse.json({ error: "号码不存在" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
