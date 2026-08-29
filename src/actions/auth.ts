"use server";

import { redirect } from "next/navigation";
import { authenticate, createAdmin, createSession, destroySession, getAdminCount } from "@/lib/auth";

function messageToParam(message: string) {
  return encodeURIComponent(message);
}

export async function setupAction(formData: FormData) {
  if (getAdminCount() > 0) redirect("/login");

  const username = String(formData.get("username") || "");
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (password !== confirmPassword) {
    redirect(`/setup?error=${messageToParam("两次输入的密码不一致")}`);
  }

  try {
    const user = await createAdmin(username, password);
    await createSession(user);
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建管理员失败";
    redirect(`/setup?error=${messageToParam(message)}`);
  }

  redirect("/");
}

export async function loginAction(formData: FormData) {
  if (getAdminCount() === 0) redirect("/setup");

  const username = String(formData.get("username") || "");
  const password = String(formData.get("password") || "");
  const user = await authenticate(username, password);

  if (!user) {
    redirect(`/login?error=${messageToParam("用户名或密码错误")}`);
  }

  await createSession(user);
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
