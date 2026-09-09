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
import { listSecurityEvents, recordSecurityEvent } from "@/lib/security-events";
import { getSiteSettings } from "@/lib/site-settings";
import {
  beginTwoFactorSetup,
  confirmTwoFactorSetup,
  disableTwoFactor,
  getTwoFactorStatus,
  regenerateRecoveryCodes,
  verifySecondFactor,
} from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type AccountAction =
  | "updateUsername"
  | "updatePassword"
  | "revokeOtherSessions"
  | "beginTotpSetup"
  | "confirmTotpSetup"
  | "regenerateRecoveryCodes"
  | "disableTotp";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function refreshCurrentSession(
  response: NextResponse,
  user: { id: number; username: string },
  twoFactorVerified: boolean,
) {
  const token = await createSessionToken(user, { twoFactorVerified });
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
    twoFactor: getTwoFactorStatus(user.id),
    securityEvents: listSecurityEvents(16),
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
    recordSecurityEvent("account.password_confirmation", "failure", "账号安全操作的当前密码校验失败");
    return json({ error: "当前密码不正确" }, 400);
  }

  try {
    if (action === "updateUsername") {
      const account = await updateAdminUsername(user.id, String(body.username ?? ""));
      const twoFactorEnabled = getTwoFactorStatus(user.id).enabled;
      rotateSessionSecret();
      recordSecurityEvent("account.username_changed", "success", "管理员用户名已修改，旧会话已撤销");
      return refreshCurrentSession(
        json({
          account,
          message: "用户名已更新，其他设备上的旧登录会话已失效。",
          otherSessionsRevoked: true,
        }),
        { id: account.id, username: account.username },
        twoFactorEnabled,
      );
    }

    if (action === "updatePassword") {
      const password = String(body.password ?? "");
      const confirmPassword = String(body.confirmPassword ?? "");
      if (password !== confirmPassword) return json({ error: "两次输入的新密码不一致" }, 400);

      const account = await updateAdminPassword(user.id, password);
      const twoFactorEnabled = getTwoFactorStatus(user.id).enabled;
      rotateSessionSecret();
      recordSecurityEvent("account.password_changed", "success", "管理员密码已修改，旧会话已撤销");
      return refreshCurrentSession(
        json({
          account,
          message: "密码已更新，其他设备上的旧登录会话已失效。",
          otherSessionsRevoked: true,
        }),
        { id: account.id, username: account.username },
        twoFactorEnabled,
      );
    }

    if (action === "revokeOtherSessions") {
      const account = getAdminAccount(user.id);
      if (!account) return json({ error: "管理员账户不存在" }, 404);
      const twoFactorEnabled = getTwoFactorStatus(user.id).enabled;
      rotateSessionSecret();
      recordSecurityEvent("session.revoked_others", "success", "其他设备登录会话已撤销");
      return refreshCurrentSession(
        json({
          account,
          message: "其他设备上的登录会话已全部失效，当前浏览器保持登录。",
          otherSessionsRevoked: true,
        }),
        { id: account.id, username: account.username },
        twoFactorEnabled,
      );
    }

    if (action === "beginTotpSetup") {
      const account = getAdminAccount(user.id);
      if (!account) return json({ error: "管理员账户不存在" }, 404);
      const siteSettings = getSiteSettings();
      const setup = await beginTwoFactorSetup(user.id, account.username, siteSettings.siteName || "SIMKeeper");
      recordSecurityEvent("two_factor.setup_started", "info", "已生成新的 TOTP 配置，等待动态码确认");
      return json({ setup });
    }

    if (action === "confirmTotpSetup") {
      const setupToken = String(body.setupToken ?? "");
      const code = String(body.code ?? "");
      if (!setupToken || !code) return json({ error: "请完成二维码绑定并输入动态验证码" }, 400);

      const result = confirmTwoFactorSetup(user.id, setupToken, code);
      const account = getAdminAccount(user.id);
      if (!account) return json({ error: "管理员账户不存在" }, 404);
      rotateSessionSecret();
      recordSecurityEvent("two_factor.enabled", "success", "TOTP 双重验证已启用，旧会话已撤销");
      return refreshCurrentSession(
        json({
          twoFactor: getTwoFactorStatus(user.id),
          recoveryCodes: result.recoveryCodes,
          message: "双重验证已启用。请立即保存恢复码；恢复码只显示这一次。",
          otherSessionsRevoked: true,
        }),
        { id: account.id, username: account.username },
        true,
      );
    }

    if (action === "regenerateRecoveryCodes") {
      const code = String(body.code ?? "");
      if (!code) return json({ error: "请输入当前动态验证码或恢复码" }, 400);
      const verification = verifySecondFactor(user.id, code);
      if (!verification.ok) {
        recordSecurityEvent("two_factor.recovery_regenerate", "failure", "重新生成恢复码时二次验证失败");
        return json({ error: "动态验证码或恢复码不正确" }, 400);
      }
      const recoveryCodes = regenerateRecoveryCodes(user.id);
      recordSecurityEvent("two_factor.recovery_regenerated", "success", "旧恢复码已全部作废");
      return json({
        twoFactor: getTwoFactorStatus(user.id),
        recoveryCodes,
        message: "新的恢复码已生成，旧恢复码已全部作废。",
      });
    }

    if (action === "disableTotp") {
      const code = String(body.code ?? "");
      if (!code) return json({ error: "请输入当前动态验证码或恢复码" }, 400);
      const verification = verifySecondFactor(user.id, code);
      if (!verification.ok) {
        recordSecurityEvent("two_factor.disable", "failure", "停用双重验证时二次验证失败");
        return json({ error: "动态验证码或恢复码不正确" }, 400);
      }

      disableTwoFactor(user.id);
      const account = getAdminAccount(user.id);
      if (!account) return json({ error: "管理员账户不存在" }, 404);
      rotateSessionSecret();
      recordSecurityEvent("two_factor.disabled", "success", "TOTP 双重验证已停用，旧会话已撤销");
      return refreshCurrentSession(
        json({
          twoFactor: getTwoFactorStatus(user.id),
          message: "双重验证已停用，其他设备上的旧登录会话已失效。",
          otherSessionsRevoked: true,
        }),
        { id: account.id, username: account.username },
        false,
      );
    }

    return json({ error: "不支持的账号操作" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "账号操作失败" }, 400);
  }
}
