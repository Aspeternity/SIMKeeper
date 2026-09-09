import { NextRequest, NextResponse } from "next/server";
import {
  authenticate,
  createSessionToken,
  createTwoFactorPendingToken,
  getSessionCookieOptions,
  getTwoFactorPendingCookieOptions,
  hasAdmin,
  SESSION_COOKIE_NAME,
  TWO_FACTOR_PENDING_COOKIE_NAME,
} from "@/lib/auth";
import { recordSecurityEvent } from "@/lib/security-events";

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
    recordSecurityEvent("login.password", "failure", "用户名或密码验证失败");
    return redirectTo("/login", "用户名或密码错误");
  }

  if (user.twoFactorEnabled) {
    const pendingToken = await createTwoFactorPendingToken(user);
    const response = redirectTo("/login/verify");
    response.cookies.set(TWO_FACTOR_PENDING_COOKIE_NAME, pendingToken, getTwoFactorPendingCookieOptions());
    response.cookies.set(SESSION_COOKIE_NAME, "", { ...getSessionCookieOptions(), maxAge: 0 });
    recordSecurityEvent("login.password", "success", "密码验证通过，等待双重验证");
    return response;
  }

  const token = await createSessionToken(user);
  const response = redirectTo("/");
  response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
  response.cookies.set(TWO_FACTOR_PENDING_COOKIE_NAME, "", { ...getTwoFactorPendingCookieOptions(), maxAge: 0 });
  recordSecurityEvent("login.success", "success", "密码登录成功");
  return response;
}
