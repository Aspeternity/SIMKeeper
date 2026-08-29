import { NextRequest, NextResponse } from "next/server";
import { createAdmin, createSession, getAdminCount } from "@/lib/auth";

export const dynamic = "force-dynamic";

function redirectTo(request: NextRequest, pathname: string, error?: string) {
  const url = new URL(pathname, request.url);
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: NextRequest) {
  if (getAdminCount() > 0) return redirectTo(request, "/login");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo(request, "/setup", "无法读取表单，请重试");
  }

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (username.length < 3) return redirectTo(request, "/setup", "用户名至少需要 3 个字符");
  if (password.length < 8) return redirectTo(request, "/setup", "密码至少需要 8 个字符");
  if (password !== confirmPassword) return redirectTo(request, "/setup", "两次输入的密码不一致");

  try {
    const user = await createAdmin(username, password);
    await createSession(user);
    return redirectTo(request, "/");
  } catch (error) {
    const message = error instanceof Error ? error.message : "初始化失败";
    return redirectTo(request, "/setup", message);
  }
}
