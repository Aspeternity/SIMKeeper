import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  getAdminAccount,
  getCurrentUser,
  getSessionCookieOptions,
  isSessionCookieSecure,
  rotateSessionSecret,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_DAYS,
  updateAdminPassword,
  updateAdminUsername,
  verifyUserPassword,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type AccountAction = "updateUsername" | "updatePassword" | "revokeOtherSessions";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function refreshCurrentSession(
  response: NextResponse,
  user: { id: number; username: string },
) {
  const token = await createSessionToken(user);
  response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
  return response;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return json({ error: "登录状态已失效，请重新登录" }, 401);

  const account = getAdminAccount(user.id);
  if (!account) return json({ error: "管理员账户不存在" }, 404);

  return json({
    account,
    security: {
      sessionMaxAgeDays: SESSION_MAX_AGE_DAYS,
      cookieSecure: isSessionCookieSecure(),
      cookieHttpOnly: true,
      cookieSameSite: "lax",
      passwordMinimumCharacters: 10,
      passwordMaximumBytes: 72,
    },
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "登录状态已失效，请重新登录" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "无法读取请求内容" }, 400);
  }

  const action = String(body.action ?? "") as AccountAction;
  const currentPassword = String(body.currentPassword ?? "");
  if (!currentPassword) return json({ error: "请输入当前密码" }, 400);

  if (!(await verifyUserPassword(user.id, currentPassword))) {
    return json({ error: "当前密码不正确" }, 400);
  }

  try {
    if (action === "updateUsername") {
      const account = await updateAdminUsername(user.id, String(body.username ?? ""));
      rotateSessionSecret();
      return refreshCurrentSession(
        json({
          account,
          message: "用户名已更新，其他设备上的旧登录会话已失效。",
          otherSessionsRevoked: true,
        }),
        { id: account.id, username: account.username },
      );
    }

    if (action === "updatePassword") {
      const password = String(body.password ?? "");
      const confirmPassword = String(body.confirmPassword ?? "");
      if (password !== confirmPassword) return json({ error: "两次输入的新密码不一致" }, 400);

      const account = await updateAdminPassword(user.id, password);
      rotateSessionSecret();
      return refreshCurrentSession(
        json({
          account,
          message: "密码已更新，其他设备上的旧登录会话已失效。",
          otherSessionsRevoked: true,
        }),
        { id: account.id, username: account.username },
      );
    }

    if (action === "revokeOtherSessions") {
      const account = getAdminAccount(user.id);
      if (!account) return json({ error: "管理员账户不存在" }, 404);
      rotateSessionSecret();
      return refreshCurrentSession(
        json({
          account,
          message: "其他设备上的登录会话已全部失效，当前浏览器保持登录。",
          otherSessionsRevoked: true,
        }),
        { id: account.id, username: account.username },
      );
    }

    return json({ error: "不支持的账号操作" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "账号操作失败" }, 400);
  }
}
