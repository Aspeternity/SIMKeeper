import { NextRequest } from "next/server";
import { createAdmin, createSession, getAdminCount } from "@/lib/auth";

export const dynamic = "force-dynamic";

function redirectTo(pathname: string, error?: string) {
  const search = new URLSearchParams();
  if (error) search.set("error", error);
  const location = search.size > 0 ? `${pathname}?${search.toString()}` : pathname;

  return new Response(null, {
    status: 303,
    headers: { Location: location },
  });
}

export async function POST(request: NextRequest) {
  if (getAdminCount() > 0) return redirectTo("/login");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo("/setup", "无法读取表单，请重试");
  }

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (username.length < 3) return redirectTo("/setup", "用户名至少需要 3 个字符");
  if (password.length < 8) return redirectTo("/setup", "密码至少需要 8 个字符");
  if (password !== confirmPassword) return redirectTo("/setup", "两次输入的密码不一致");

  try {
    const user = await createAdmin(username, password);
    await createSession(user);
    return redirectTo("/");
  } catch (error) {
    const message = error instanceof Error ? error.message : "初始化失败";
    return redirectTo("/setup", message);
  }
}
