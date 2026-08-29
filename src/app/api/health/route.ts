import { NextResponse } from "next/server";
import { sqlite } from "@/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    sqlite.prepare("SELECT 1").get();
    return NextResponse.json({
      status: "ok",
      database: "connected",
      version: "0.1.0-alpha.1",
    });
  } catch {
    return NextResponse.json(
      { status: "error", database: "disconnected", version: "0.1.0-alpha.1" },
      { status: 503 },
    );
  }
}
