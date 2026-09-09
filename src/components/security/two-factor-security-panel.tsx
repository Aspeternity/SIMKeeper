"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Copy,
  History,
  KeyRound,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type TwoFactorStatus = {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
};

type SetupData = {
  secret: string;
  qrDataUrl: string;
  setupToken: string;
  expiresInMinutes: number;
};

type SecurityEvent = {
  id: number;
  eventType: string;
  status: "success" | "failure" | "info";
  detail: string | null;
  createdAt: string;
};

type AccountSecurityResponse = {
  twoFactor: TwoFactorStatus;
  securityEvents: SecurityEvent[];
};

const EVENT_LABELS: Record<string, string> = {
  "account.password_confirmation": "敏感操作密码确认",
  "account.username_changed": "修改管理员用户名",
  "account.password_changed": "修改管理员密码",
  "session.revoked_others": "注销其他设备",
  "two_factor.setup_started": "开始配置双重验证",
  "two_factor.enabled": "启用双重验证",
  "two_factor.recovery_regenerate": "恢复码验证",
  "two_factor.recovery_regenerated": "重新生成恢复码",
  "two_factor.disable": "停用双重验证验证",
  "two_factor.disabled": "停用双重验证",
  "login.password": "登录密码验证",
  "login.two_factor": "登录双重验证",
  "login.success": "登录成功",
};

function formatDate(value: string | null) {
  if (!value) return "—";
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

function eventTone(status: SecurityEvent["status"]) {
  if (status === "success") return "text-emerald-700 bg-emerald-50 border-emerald-100";
  if (status === "failure") return "text-rose-700 bg-rose-50 border-rose-100";
  return "text-sky-700 bg-sky-50 border-sky-100";
}

export function TwoFactorSecurityPanel() {
  const [twoFactor, setTwoFactor] = useState<TwoFactorStatus | null>(null);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [setupPassword, setSetupPassword] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [managePassword, setManagePassword] = useState("");
  const [manageCode, setManageCode] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/account", { cache: "no-store" });
      const data = (await response.json()) as AccountSecurityResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "双重验证状态加载失败");
      setTwoFactor(data.twoFactor);
      setEvents(data.securityEvents || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "双重验证状态加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(action: string, payload: Record<string, string>) {
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
      if (!response.ok) throw new Error(data.error || "账号安全操作失败");
      if (data.twoFactor) setTwoFactor(data.twoFactor);
      if (Array.isArray(data.recoveryCodes)) setRecoveryCodes(data.recoveryCodes);
      if (data.message) setNotice(data.message);
      await load();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "账号安全操作失败");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function beginSetup(event: FormEvent) {
    event.preventDefault();
    const data = await post("beginTotpSetup", { currentPassword: setupPassword });
    if (data?.setup) {
      setSetup(data.setup as SetupData);
      setSetupCode("");
      setRecoveryCodes([]);
    }
  }

  async function confirmSetup(event: FormEvent) {
    event.preventDefault();
    if (!setup) return;
    const data = await post("confirmTotpSetup", {
      currentPassword: setupPassword,
      setupToken: setup.setupToken,
      code: setupCode,
    });
    if (data) {
      setSetup(null);
      setSetupPassword("");
      setSetupCode("");
    }
  }

  async function regenerateCodes() {
    const data = await post("regenerateRecoveryCodes", {
      currentPassword: managePassword,
      code: manageCode,
    });
    if (data) {
      setManagePassword("");
      setManageCode("");
    }
  }

  async function disableTotp() {
    if (!window.confirm("停用双重验证后，仅凭管理员密码即可登录。确认停用吗？")) return;
    const data = await post("disableTotp", {
      currentPassword: managePassword,
      code: manageCode,
    });
    if (data) {
      setManagePassword("");
      setManageCode("");
      setRecoveryCodes([]);
      setSetup(null);
    }
  }

  async function copyRecoveryCodes() {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setNotice("恢复码已复制到剪贴板。请保存到 SIMKeeper 之外的安全位置。");
    } catch {
      setError("浏览器无法访问剪贴板，请手动复制恢复码。");
    }
  }

  return (
    <div className="mx-auto mt-6 max-w-6xl space-y-6">
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${twoFactor?.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
              {twoFactor?.enabled ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">TOTP 双重验证</h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                登录密码通过后，再使用 Authenticator 动态码完成第二步验证。兼容 1Password、Google Authenticator、Microsoft Authenticator、Aegis 等标准 TOTP 应用。
              </p>
            </div>
          </div>
          {loading ? (
            <div className="flex items-center text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" />加载中</div>
          ) : (
            <div className={`rounded-full border px-3 py-1 text-xs font-medium ${twoFactor?.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
              {twoFactor?.enabled ? "已启用" : "未启用"}
            </div>
          )}
        </div>

        {!loading && twoFactor && !twoFactor.enabled && !setup ? (
          <form onSubmit={beginSetup} className="mt-6 max-w-xl space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-medium text-slate-800">开始绑定 Authenticator</div>
            <p className="text-xs leading-5 text-slate-500">先输入当前管理员密码。二维码只有通过密码确认后才会生成。</p>
            <Input
              type="password"
              value={setupPassword}
              onChange={(event) => setSetupPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="当前管理员密码"
              required
            />
            <Button type="submit" disabled={Boolean(busy)}>
              {busy === "beginTotpSetup" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
              生成绑定二维码
            </Button>
          </form>
        ) : null}

        {!loading && twoFactor && !twoFactor.enabled && setup ? (
          <form onSubmit={confirmSetup} className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <img src={setup.qrDataUrl} alt="TOTP 绑定二维码" className="mx-auto h-60 w-60 max-w-full" />
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium text-slate-900">1. 扫描二维码</div>
                <p className="mt-1 text-xs leading-5 text-slate-500">配置将在 {setup.expiresInMinutes} 分钟后失效。二维码无法扫描时，可手动输入下面的 Base32 密钥。</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-mono text-sm tracking-wider text-slate-700 break-all">
                {setup.secret}
              </div>
              <div>
                <div className="mb-2 text-sm font-medium text-slate-900">2. 输入 Authenticator 当前 6 位验证码</div>
                <Input
                  value={setupCode}
                  onChange={(event) => setSetupCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  maxLength={8}
                  required
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={Boolean(busy)}>
                  {busy === "confirmTotpSetup" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                  验证并启用
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setSetup(null);
                    setSetupCode("");
                  }}
                  disabled={Boolean(busy)}
                >
                  取消
                </Button>
              </div>
            </div>
          </form>
        ) : null}

        {!loading && twoFactor?.enabled ? (
          <div className="mt-6 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-800"><CheckCircle2 className="h-4 w-4" />保护已生效</div>
                <div className="mt-2 text-xs leading-5 text-emerald-700">启用于 {formatDate(twoFactor.enabledAt)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-800"><KeyRound className="h-4 w-4" />恢复码</div>
                <div className="mt-2 text-xs leading-5 text-slate-500">剩余 {twoFactor.recoveryCodesRemaining} / 10 枚一次性恢复码</div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="font-medium text-slate-900">管理双重验证</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">重新生成恢复码或停用 2FA 时，需要同时验证当前密码和动态验证码（也可使用一枚恢复码）。</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Input
                  type="password"
                  value={managePassword}
                  onChange={(event) => setManagePassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="当前管理员密码"
                />
                <Input
                  value={manageCode}
                  onChange={(event) => setManageCode(event.target.value)}
                  autoComplete="one-time-code"
                  placeholder="动态验证码或恢复码"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => void regenerateCodes()} disabled={Boolean(busy) || !managePassword || !manageCode}>
                  {busy === "regenerateRecoveryCodes" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  重新生成恢复码
                </Button>
                <Button type="button" variant="secondary" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => void disableTotp()} disabled={Boolean(busy) || !managePassword || !manageCode}>
                  {busy === "disableTotp" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldOff className="mr-2 h-4 w-4" />}
                  停用双重验证
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Card>

      {recoveryCodes.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50/40 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="font-semibold text-amber-950">立即保存恢复码</h3>
              <p className="mt-1 text-sm leading-6 text-amber-800">这些恢复码只显示这一次。每枚只能登录一次，请保存到密码管理器或其他不依赖 SIMKeeper 的安全位置。</p>
            </div>
            <Button type="button" variant="secondary" onClick={() => void copyRecoveryCodes()}>
              <Copy className="mr-2 h-4 w-4" />复制全部
            </Button>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {recoveryCodes.map((code) => (
              <div key={code} className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-center font-mono text-sm font-semibold tracking-wide text-slate-800">
                {code}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-semibold text-slate-900"><History className="h-4 w-4" />最近安全活动</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">保留最近的登录、2FA 和敏感账号操作记录，便于发现异常访问。</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />刷新
          </Button>
        </div>

        <div className="mt-5 divide-y divide-slate-100">
          {events.length ? events.map((event) => (
            <div key={event.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{EVENT_LABELS[event.eventType] || event.eventType}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${eventTone(event.status)}`}>
                    {event.status === "success" ? "成功" : event.status === "failure" ? "失败" : "记录"}
                  </span>
                </div>
                {event.detail ? <div className="mt-1 text-xs leading-5 text-slate-500">{event.detail}</div> : null}
              </div>
              <div className="shrink-0 text-xs text-slate-400">{formatDate(event.createdAt)}</div>
            </div>
          )) : (
            <div className="py-8 text-center text-sm text-slate-400">还没有安全活动记录。</div>
          )}
        </div>
      </Card>
    </div>
  );
}
