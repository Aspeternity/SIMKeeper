import { NextRequest, NextResponse } from "next/server";
import {
  authenticate,
  createSessionToken,
  getSessionCookieOptions,
  hasAdmin,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectTo(pathname: string, error?: string) {
  const search = new URLSearchParams();
  if (error) search.set("error", error);
  const location = search.size > 0 ? `${pathname}?${search.toString()}` : pathname;

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: NextRequest) {
  if (!hasAdmin()) {
    return redirectTo("/setup", "请先创建管理员账户");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo("/login", "无法读取表单，请重试");
  }

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const user = await authenticate(username, password);

  if (!user) {
    return redirectTo("/login", "用户名或密码错误");
  }

  const token = await createSessionToken(user);
  const response = redirectTo("/");
  response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
  return response;
}
