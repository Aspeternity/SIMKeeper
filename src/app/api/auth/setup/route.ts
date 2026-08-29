import { NextRequest, NextResponse } from "next/server";
import { createAdmin, createSessionToken, getSessionCookieOptions, hasAdmin, SESSION_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectTo(pathname: string, error?: string) {
  const search = new URLSearchParams();
  if (error) search.set("error", error);
  const location = search.size ? `${pathname}?${search.toString()}` : pathname;
  return new NextResponse(null, {
    status: 303,
    headers: { Location: location, "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  if (hasAdmin()) return redirectTo("/login", "管理员账户已经存在，请直接登录");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo("/setup", "无法读取表单，请重试");
  }

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (username.length < 3 || username.length > 32) return redirectTo("/setup", "用户名长度需要在 3 到 32 个字符之间");
  if (password.length < 8) return redirectTo("/setup", "密码至少需要 8 个字符");
  if (password !== confirmPassword) return redirectTo("/setup", "两次输入的密码不一致");

  try {
    const user = await createAdmin(username, password);
    const token = await createSessionToken(user);
    const response = redirectTo("/");
    response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
    return response;
  } catch (error) {
    return redirectTo("/setup", error instanceof Error ? error.message : "初始化失败");
  }
}
