"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogOut,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  UserRoundCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AccountData = {
  id: number;
  username: string;
  createdAt: string;
  updatedAt: string;
};

type SecurityData = {
  sessionMaxAgeDays: number;
  cookieSecure: boolean;
  cookieHttpOnly: boolean;
  cookieSameSite: string;
  passwordMinimumCharacters: number;
  passwordMaximumBytes: number;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function SecurityPage() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [security, setSecurity] = useState<SecurityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [username, setUsername] = useState("");
  const [usernamePassword, setUsernamePassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [revokePassword, setRevokePassword] = useState("");

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/account", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "账号信息加载失败");
      setAccount(data.account);
      setSecurity(data.security);
      setUsername(data.account.username);
    } catch (err) {
      setError(err instanceof Error ? err.message : "账号信息加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  async function accountAction(action: string, payload: Record<string, string>) {
    setBusy(action);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "账号操作失败");
      if (data.account) {
        setAccount(data.account);
        setUsername(data.account.username);
      }
      setNotice(data.message || "账号设置已更新。");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "账号操作失败");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function submitUsername(event: FormEvent) {
    event.preventDefault();
    if (!account) return;
    const ok = await accountAction("updateUsername", {
      username,
      currentPassword: usernamePassword,
    });
    if (ok) {
      setUsernamePassword("");
      window.location.reload();
    }
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    const ok = await accountAction("updatePassword", {
      currentPassword,
      password: newPassword,
      confirmPassword,
    });
    if (ok) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }

  async function revokeOtherSessions(event: FormEvent) {
    event.preventDefault();
    const ok = await accountAction("revokeOtherSessions", { currentPassword: revokePassword });
    if (ok) setRevokePassword("");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <ShieldCheck className="h-4 w-4" />
          管理员账户
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">账号与安全</h2>
        <p className="mt-1 text-sm text-slate-500">管理 SIMKeeper 单管理员账户、密码和已签发的登录会话。</p>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      {loading ? (
        <Card className="flex min-h-52 items-center justify-center text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载账号安全状态…
        </Card>
      ) : account && security ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="p-5">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-400"><UserRoundCog className="h-4 w-4" />当前管理员</div>
              <div className="mt-3 truncate text-lg font-semibold text-slate-900">{account.username}</div>
              <div className="mt-1 text-xs text-slate-400">创建于 {formatDate(account.createdAt)}</div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-400"><KeyRound className="h-4 w-4" />会话有效期</div>
              <div className="mt-3 text-lg font-semibold text-slate-900">{security.sessionMaxAgeDays} 天</div>
              <div className="mt-1 text-xs text-slate-400">HttpOnly · SameSite={security.cookieSameSite}</div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-400">{security.cookieSecure ? <ShieldCheck className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}Cookie Secure</div>
              <div className={`mt-3 text-lg font-semibold ${security.cookieSecure ? "text-emerald-700" : "text-amber-700"}`}>
                {security.cookieSecure ? "已启用" : "未启用"}
              </div>
              <div className="mt-1 text-xs leading-5 text-slate-400">{security.cookieSecure ? "适合 HTTPS 反向代理访问" : "HTTP / 本地部署可用；HTTPS 建议开启 SIMKEEPER_COOKIE_SECURE"}</div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-400"><RefreshCw className="h-4 w-4" />账号最后修改</div>
              <div className="mt-3 text-sm font-semibold text-slate-900">{formatDate(account.updatedAt)}</div>
              <div className="mt-1 text-xs text-slate-400">用户名或密码修改时间</div>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><UserRoundCog className="h-4 w-4" /></div>
                <div>
                  <h3 className="font-semibold text-slate-900">修改用户名</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-400">修改后会立即轮换 Session 签名密钥，其他浏览器和设备上的旧登录会话全部失效。</p>
                </div>
              </div>
              <form onSubmit={submitUsername} className="mt-5 space-y-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium">新用户名</span>
                  <Input value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={32} autoComplete="username" required />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium">当前密码</span>
                  <Input value={usernamePassword} onChange={(event) => setUsernamePassword(event.target.value)} type="password" autoComplete="current-password" required />
                </label>
                <Button type="submit" disabled={Boolean(busy) || username.trim() === account.username}>
                  {busy === "updateUsername" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}保存用户名
                </Button>
              </form>
            </Card>

            <Card className="p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><LockKeyhole className="h-4 w-4" /></div>
                <div>
                  <h3 className="font-semibold text-slate-900">修改密码</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-400">新密码至少 {security.passwordMinimumCharacters} 个字符，最多 {security.passwordMaximumBytes} 个 UTF-8 字节。修改成功后其他设备会被强制重新登录。</p>
                </div>
              </div>
              <form onSubmit={submitPassword} className="mt-5 space-y-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium">当前密码</span>
                  <Input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" autoComplete="current-password" required />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium">新密码</span>
                  <Input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" autoComplete="new-password" minLength={security.passwordMinimumCharacters} required />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium">确认新密码</span>
                  <Input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" minLength={security.passwordMinimumCharacters} required />
                </label>
                <Button type="submit" disabled={Boolean(busy)}>
                  {busy === "updatePassword" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}更新密码
                </Button>
              </form>
            </Card>
          </div>

          <Card className="p-5 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 font-semibold text-slate-900"><KeyRound className="h-4 w-4" />会话安全</div>
                <p className="mt-2 text-sm leading-6 text-slate-500">SIMKeeper 不保存可枚举的设备 Session 列表，而是使用服务端签名密钥验证 30 天 JWT。执行“注销其他设备”会轮换签名密钥，使此前签发的全部 Session 立即失效，再只给当前浏览器签发一枚新 Session。</p>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />当前浏览器不会被退出</div>
              </div>
              <form onSubmit={revokeOtherSessions} className="w-full max-w-sm space-y-3">
                <Input value={revokePassword} onChange={(event) => setRevokePassword(event.target.value)} type="password" autoComplete="current-password" placeholder="输入当前密码确认" required />
                <Button type="submit" variant="secondary" className="w-full" disabled={Boolean(busy)}>
                  {busy === "revokeOtherSessions" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}注销其他设备
                </Button>
              </form>
            </div>
          </Card>

          <Card className="border-rose-100 p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold text-slate-900">退出当前账号</div>
                <p className="mt-1 text-xs leading-5 text-slate-400">仅清除当前浏览器的登录 Cookie，不影响其他设备。</p>
              </div>
              <form action="/api/auth/logout" method="post">
                <Button type="submit" variant="secondary" className="border-rose-200 text-rose-700 hover:bg-rose-50">
                  <LogOut className="mr-2 h-4 w-4" />退出当前浏览器
                </Button>
              </form>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
