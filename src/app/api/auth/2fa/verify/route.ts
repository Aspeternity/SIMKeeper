import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  getPendingTwoFactorUser,
  getSessionCookieOptions,
  getTwoFactorPendingCookieOptions,
  SESSION_COOKIE_NAME,
  TWO_FACTOR_PENDING_COOKIE_NAME,
} from "@/lib/auth";
import { recordSecurityEvent } from "@/lib/security-events";
import { verifySecondFactor } from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectTo(pathname: string, error?: string) {
  const search = new URLSearchParams();
  if (error) search.set("error", error);
  const location = search.size > 0 ? `${pathname}?${search.toString()}` : pathname;
  return new NextResponse(null, {
    status: 303,
    headers: { Location: location, "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const pendingUser = await getPendingTwoFactorUser();
  if (!pendingUser) {
    return redirectTo("/login", "双重验证会话已过期，请重新输入用户名和密码");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo("/login/verify", "无法读取验证码，请重试");
  }

  const code = String(formData.get("code") ?? "").trim();
  if (!code) return redirectTo("/login/verify", "请输入动态验证码或恢复码");

  const verification = verifySecondFactor(pendingUser.id, code);
  if (!verification.ok) {
    recordSecurityEvent("login.two_factor", "failure", "双重验证失败");
    return redirectTo("/login/verify", "动态验证码或恢复码不正确");
  }

  const token = await createSessionToken(pendingUser, { twoFactorVerified: true });
  const response = redirectTo("/");
  response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
  response.cookies.set(TWO_FACTOR_PENDING_COOKIE_NAME, "", {
    ...getTwoFactorPendingCookieOptions(),
    maxAge: 0,
  });

  recordSecurityEvent(
    "login.success",
    "success",
    verification.method === "recovery"
      ? `使用恢复码完成双重验证，剩余 ${verification.recoveryCodesRemaining} 枚`
      : "使用 TOTP 动态码完成双重验证",
  );
  return response;
}
