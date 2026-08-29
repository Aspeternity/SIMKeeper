import { NextRequest } from "next/server";
import { authenticate, createSession, getAdminCount } from "@/lib/auth";

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
  if (getAdminCount() === 0) return redirectTo("/setup");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo("/login", "无法读取表单，请重试");
  }

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const user = await authenticate(username, password);

  if (!user) return redirectTo("/login", "用户名或密码错误");

  await createSession(user);
  return redirectTo("/");
}
