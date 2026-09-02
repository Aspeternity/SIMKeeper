import { and, asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { carriers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const carrierSchema = z.object({
  name: z.string().trim().min(1, "请输入运营商名称").max(80, "运营商名称不能超过 80 个字符"),
  country: z.string().trim().min(1, "请输入国家或地区").max(80, "国家或地区不能超过 80 个字符"),
  countryCode: z
    .string()
    .trim()
    .min(2, "请输入国家/地区代码")
    .max(8, "国家/地区代码不能超过 8 个字符")
    .transform((value) => value.toUpperCase()),
  website: z.string().trim().max(200, "官网地址不能超过 200 个字符").optional().default(""),
  notes: z.string().trim().max(500, "备注不能超过 500 个字符").optional().default(""),
});

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  }
  return null;
}

export async function GET() {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const rows = db
    .select()
    .from(carriers)
    .orderBy(asc(carriers.country), asc(carriers.name))
    .all();

  return NextResponse.json({ carriers: rows });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const parsed = carrierSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "提交的数据不正确" }, { status: 400 });
  }

  const duplicate = db
    .select({ id: carriers.id })
    .from(carriers)
    .where(and(eq(carriers.name, parsed.data.name), eq(carriers.countryCode, parsed.data.countryCode)))
    .get();

  if (duplicate) {
    return NextResponse.json({ error: "该国家/地区下已经存在同名运营商" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const row = db
    .insert(carriers)
    .values({
      ...parsed.data,
      website: parsed.data.website || null,
      notes: parsed.data.notes || null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  return NextResponse.json({ carrier: row }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "无效的运营商 ID" }, { status: 400 });
  }

  const parsed = carrierSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "提交的数据不正确" }, { status: 400 });
  }

  const current = db.select({ id: carriers.id }).from(carriers).where(eq(carriers.id, id)).get();
  if (!current) {
    return NextResponse.json({ error: "运营商不存在" }, { status: 404 });
  }

  const duplicate = db
    .select({ id: carriers.id })
    .from(carriers)
    .where(and(eq(carriers.name, parsed.data.name), eq(carriers.countryCode, parsed.data.countryCode)))
    .get();

  if (duplicate && duplicate.id !== id) {
    return NextResponse.json({ error: "该国家/地区下已经存在同名运营商" }, { status: 409 });
  }

  const row = db
    .update(carriers)
    .set({
      ...parsed.data,
      website: parsed.data.website || null,
      notes: parsed.data.notes || null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(carriers.id, id))
    .returning()
    .get();

  return NextResponse.json({ carrier: row });
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "无效的运营商 ID" }, { status: 400 });
  }

  const deleted = db.delete(carriers).where(eq(carriers.id, id)).returning({ id: carriers.id }).get();
  if (!deleted) {
    return NextResponse.json({ error: "运营商不存在" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
