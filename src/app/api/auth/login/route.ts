import { NextRequest, NextResponse } from "next/server";
import { authenticate, createSession, getAdminCount } from "@/lib/auth";

export const dynamic = "force-dynamic";

function redirectTo(request: NextRequest, pathname: string, error?: string) {
  const url = new URL(pathname, request.url);
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: NextRequest) {
  if (getAdminCount() === 0) return redirectTo(request, "/setup");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo(request, "/login", "无法读取表单，请重试");
  }

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const user = await authenticate(username, password);

  if (!user) return redirectTo(request, "/login", "用户名或密码错误");

  await createSession(user);
  return redirectTo(request, "/");
}
