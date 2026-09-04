import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sqlite } from "@/db";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deviceSchema = z.object({
  name: z.string().trim().min(1, "请输入设备名称").max(80, "设备名称不能超过 80 个字符"),
  type: z.enum(["phone", "tablet", "esim_adapter", "router", "storage", "other"]),
  brand: z.string().trim().max(80, "品牌不能超过 80 个字符").optional().default(""),
  model: z.string().trim().max(120, "型号不能超过 120 个字符").optional().default(""),
  notes: z.string().trim().max(500, "备注不能超过 500 个字符").optional().default(""),
});

type DeviceRow = {
  id: number;
  name: string;
  type: string;
  brand: string | null;
  model: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  sim_count: number;
};

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  return null;
}

function mapDevice(row: DeviceRow) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    brand: row.brand,
    model: row.model,
    notes: row.notes,
    simCount: Number(row.sim_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listDevices() {
  return (sqlite
    .prepare(
      `SELECT d.id, d.name, d.type, d.brand, d.model, d.notes, d.created_at, d.updated_at,
              COUNT(s.id) AS sim_count
       FROM devices d
       LEFT JOIN sim_cards s ON s.device_id = d.id
       GROUP BY d.id
       ORDER BY d.name COLLATE NOCASE ASC`,
    )
    .all() as DeviceRow[]).map(mapDevice);
}

function getDevice(id: number) {
  const row = sqlite
    .prepare(
      `SELECT d.id, d.name, d.type, d.brand, d.model, d.notes, d.created_at, d.updated_at,
              COUNT(s.id) AS sim_count
       FROM devices d
       LEFT JOIN sim_cards s ON s.device_id = d.id
       WHERE d.id = ?
       GROUP BY d.id`,
    )
    .get(id) as DeviceRow | undefined;
  return row ? mapDevice(row) : undefined;
}

function duplicateName(name: string, excludeId?: number) {
  if (excludeId) {
    return sqlite.prepare("SELECT id FROM devices WHERE name = ? COLLATE NOCASE AND id <> ? LIMIT 1").get(name, excludeId) as { id: number } | undefined;
  }
  return sqlite.prepare("SELECT id FROM devices WHERE name = ? COLLATE NOCASE LIMIT 1").get(name) as { id: number } | undefined;
}

export async function GET() {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;
  return NextResponse.json({ devices: listDevices() });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const parsed = deviceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "提交的数据不正确" }, { status: 400 });
  }

  if (duplicateName(parsed.data.name)) {
    return NextResponse.json({ error: "已经存在同名设备，请换一个名称" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const result = sqlite
    .prepare(
      `INSERT INTO devices (name, type, brand, model, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      parsed.data.name,
      parsed.data.type,
      parsed.data.brand || null,
      parsed.data.model || null,
      parsed.data.notes || null,
      now,
      now,
    );

  const device = getDevice(Number(result.lastInsertRowid));
  return NextResponse.json({ device }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "无效的设备 ID" }, { status: 400 });
  }

  const parsed = deviceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "提交的数据不正确" }, { status: 400 });
  }

  if (!getDevice(id)) return NextResponse.json({ error: "设备不存在" }, { status: 404 });
  if (duplicateName(parsed.data.name, id)) {
    return NextResponse.json({ error: "已经存在同名设备，请换一个名称" }, { status: 409 });
  }

  sqlite
    .prepare(
      `UPDATE devices
       SET name = ?, type = ?, brand = ?, model = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      parsed.data.name,
      parsed.data.type,
      parsed.data.brand || null,
      parsed.data.model || null,
      parsed.data.notes || null,
      new Date().toISOString(),
      id,
    );

  return NextResponse.json({ device: getDevice(id) });
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "无效的设备 ID" }, { status: 400 });
  }

  const current = getDevice(id);
  if (!current) return NextResponse.json({ error: "设备不存在" }, { status: 404 });

  const remove = sqlite.transaction(() => {
    const released = sqlite.prepare("UPDATE sim_cards SET device_id = NULL, updated_at = ? WHERE device_id = ?").run(new Date().toISOString(), id);
    sqlite.prepare("DELETE FROM devices WHERE id = ?").run(id);
    return Number(released.changes || 0);
  });

  const releasedSims = remove();
  return NextResponse.json({ ok: true, releasedSims });
}
