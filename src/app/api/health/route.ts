import { NextResponse } from "next/server";
import { sqlite } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const version = "0.1.0-alpha.1";

export async function GET() {
  try {
    sqlite.prepare("SELECT 1").get();
    return NextResponse.json(
      {
        status: "ok",
        database: "connected",
        version,
        revision: process.env.SIMKEEPER_REVISION ?? "dev",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        status: "error",
        database: "disconnected",
        version,
        revision: process.env.SIMKEEPER_REVISION ?? "dev",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
