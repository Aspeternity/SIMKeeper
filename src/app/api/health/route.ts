import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import packageJson from "../../../../package.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const version = packageJson.version;

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
