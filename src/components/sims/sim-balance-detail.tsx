"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, RefreshCw } from "lucide-react";
import type { CarrierConnectorHealthStatus } from "@/lib/carrier-connectors/types";
import type { SimRecord } from "@/lib/sim-types";

type SourceConnector = {
  id: number;
  provider: string;
  providerLabel: string;
  status: "connected" | "error";
  healthStatus: CarrierConnectorHealthStatus;
  syncIntervalMinutes: number;
  hasCredentials: boolean;
  lastSyncedAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  dataUpdatedAt: string | null;
  lastError: string | null;
  lastErrorType: string | null;
  lastErrorAt: string | null;
  failureCount: number;
  retryAt: string | null;
  retryAttempt: number;
  nextRetryAt: string | null;
  retryCount: number;
  scheduledSyncAt: string | null;
  nextSyncAt: string | null;
  stale: boolean;
};

type SourceSnapshot = {
  connectorId: number | null;
  sourceProvider: string;
  balance: number | null;
  currencyCode: string | null;
  balanceValidUntil: string | null;
  accountStatus: string;
  syncedAt: string;
  stale: boolean;
};

type BalanceSource = {
  connector: SourceConnector | null;
  latest: SourceSnapshot | null;
  stale: boolean;
  sourceDeleted: boolean;
};

const HEALTH_VIEW: Record<CarrierConnectorHealthStatus, { label: string; className: string }> = {
  healthy: { label: "正常", className: "bg-emerald-50 text-emerald-700" },
  syncing: { label: "正在同步", className: "bg-sky-50 text-sky-700" },
  retrying: { label: "等待重试", className: "bg-amber-50 text-amber-700" },
  authentication: { label: "认证失效", className: "bg-rose-50 text-rose-700" },
  error: { label: "同步异常", className: "bg-rose-50 text-rose-700" },
  stale: { label: "数据过期", className: "bg-amber-50 text-amber-700" },
  paused: { label: "已暂停", className: "bg-slate-100 text-slate-600" },
  pending: { label: "等待首次同步", className: "bg-slate-100 text-slate-600" },
};

function lowBalanceSourceEligible(source: BalanceSource | null) {
  const connector = source?.connector;
  const latest = source?.latest;
  return Boolean(
    connector
    && connector.provider !== "mock"
    && connector.syncIntervalMinutes > 0
    && connector.lastSuccessAt
    && latest
    && latest.connectorId === connector.id
    && latest.sourceProvider !== "mock"
    && latest.balance !== null
    && Number.isFinite(latest.balance),
  );
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "尚未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function globeOtpRequired(connector: SourceConnector | null | undefined) {
  if (connector?.provider !== "globe" || connector.status !== "error") return false;
  if (connector.healthStatus === "authentication") return true;
  return /短信验证码重新认证|reauthentication\s+needed|device\s+not\s+recognized/i.test(
    connector.lastError ?? "",
  );
}

export function SimBalanceDetail({ sim }: { sim: SimRecord }) {
  const [source, setSource] = useState<BalanceSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function reloadSource() {
    const response = await fetch(`/api/sims/balance-source?simId=${sim.id}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "余额同步状态加载失败");
    setSource(data.source || null);
    return data.source as BalanceSource | null;
  }

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/sims/balance-source?simId=${sim.id}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "余额同步状态加载失败");
        if (active) setSource(data.source || null);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "余额同步状态加载失败");
      } finally {
        if (active) setLoading(false);
      }
    }

    setOtpSent(false);
    setOtpCode("");
    void load();
    return () => {
      active = false;
    };
  }, [sim.id]);

  async function syncNow() {
    if (!source?.connector || syncing) return;
    setSyncing(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/sims/balance-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simId: sim.id }),
      });
      const data = await response.json();
      if (data.source) setSource(data.source);
      if (!response.ok) throw new Error(data.error || "余额同步失败");
      setNotice("已同步");
      window.dispatchEvent(new CustomEvent("simkeeper:balance-synced", { detail: { simId: sim.id } }));
      window.dispatchEvent(new Event("simkeeper:reminder-state-changed"));
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "余额同步失败");
    } finally {
      setSyncing(false);
    }
  }

  async function startGlobeOtp() {
    if (authBusy) return;
    setAuthBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/sims/balance-source/globe-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simId: sim.id, action: "start" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "GlobeOne 验证码发送失败");
      setOtpSent(true);
      setNotice(data.message || "验证码已发送");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "GlobeOne 验证码发送失败");
    } finally {
      setAuthBusy(false);
    }
  }

  async function verifyGlobeOtp() {
    const code = otpCode.trim();
    if (!/^\d{4,8}$/.test(code) || authBusy) {
      if (!/^\d{4,8}$/.test(code)) setError("请输入短信中的 GlobeOne 验证码");
      return;
    }

    setAuthBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/sims/balance-source/globe-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simId: sim.id, action: "verify", code }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "GlobeOne 验证失败");
      setOtpSent(false);
      setOtpCode("");
      setNotice(data.message || "GlobeOne 验证完成");
      await reloadSource();
      window.dispatchEvent(new CustomEvent("simkeeper:balance-synced", { detail: { simId: sim.id } }));
      window.dispatchEvent(new Event("simkeeper:reminder-state-changed"));
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "GlobeOne 验证失败");
    } finally {
      setAuthBusy(false);
    }
  }

  const automatic = Boolean(source?.connector);
  const connector = source?.connector ?? null;
  const latestCandidate = source?.latest ?? null;
  const latest = automatic && latestCandidate?.connectorId === connector?.id ? latestCandidate : null;
  const balance = latest?.balance ?? sim.balance;
  const currencyCode = latest?.currencyCode ?? sim.currencyCode;
  const displayBalance = balance === null || balance === undefined
    ? "未记录"
    : `${balance} ${currencyCode || ""}`.trim();
  const needsGlobeOtp = globeOtpRequired(connector);
  const balanceUpdatedAt = latest?.syncedAt ?? sim.balanceUpdatedAt;
  const lowBalanceEligible = lowBalanceSourceEligible(source);
  const healthView = connector ? HEALTH_VIEW[connector.healthStatus] : null;

  return (
    <div className="rounded-xl bg-slate-50 px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-slate-400">余额</div>
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin text-slate-300" />
        ) : automatic && healthView ? (
          <div className="flex items-center gap-1.5">
            <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-700">自动同步</span>
            <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-medium ${healthView.className}`}>{healthView.label}</span>
          </div>
        ) : (
          <span className="rounded-md bg-white px-1.5 py-0.5 text-[9px] font-medium text-slate-400 ring-1 ring-inset ring-slate-200">手动维护</span>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <div className="text-sm font-medium text-slate-700">{displayBalance}</div>
        {automatic ? (
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={syncing || authBusy}
            className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {syncing ? "同步中" : "立即同步"}
          </button>
        ) : null}
        {notice ? <span className="text-[10px] font-medium text-emerald-600">{notice}</span> : null}
      </div>

      <div className="mt-2 space-y-0.5 text-[10px] leading-4 text-slate-400">
        {balanceUpdatedAt ? <div>余额更新 {formatDateTime(balanceUpdatedAt)}</div> : null}
        {lowBalanceEligible && sim.lowBalanceEnabled && sim.lowBalanceThreshold !== null ? (
          <div>低余额提醒 ≤ {sim.lowBalanceThreshold} {sim.currencyCode || currencyCode || ""}</div>
        ) : null}
      </div>

      {automatic && connector ? (
        <div className="mt-2 space-y-0.5 text-[10px] leading-4 text-slate-400">
          <div>{connector.providerLabel}</div>
          {connector.dataUpdatedAt ? <div>数据更新 {formatDateTime(connector.dataUpdatedAt)}</div> : null}
          {connector.lastAttemptAt ? <div>最后尝试 {formatDateTime(connector.lastAttemptAt)}</div> : null}
          {connector.lastSuccessAt ? <div>最后成功 {formatDateTime(connector.lastSuccessAt)}</div> : <div>尚无成功同步</div>}
          {latest?.balanceValidUntil ? <div>余额有效期 {latest.balanceValidUntil}</div> : null}
          {connector.nextRetryAt ? <div className="text-amber-600">下次重试 {formatDateTime(connector.nextRetryAt)} · 第 {connector.retryCount} 次重试</div> : null}
          {!connector.nextRetryAt && connector.scheduledSyncAt ? <div>下次计划 {formatDateTime(connector.scheduledSyncAt)}</div> : null}
        </div>
      ) : null}

      {connector?.healthStatus === "retrying" && connector.lastError && !error ? (
        <div className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] leading-4 text-amber-700">
          {connector.lastError}
        </div>
      ) : null}

      {connector?.healthStatus === "stale" && !error ? (
        <div className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] leading-4 text-amber-700">
          当前自动同步数据已过期，请立即同步并检查运营商连接。
        </div>
      ) : null}

      {needsGlobeOtp ? (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] leading-4 text-amber-800">
          <div className="flex items-start gap-1.5">
            <KeyRound className="mt-0.5 h-3 w-3 shrink-0" />
            <div className="flex-1">
              <div className="font-medium">GlobeOne 需要一次短信验证</div>
              <div className="mt-0.5 text-amber-700">验证完成后 SIMKeeper 会保存加密会话，日常自动同步不会重复要求验证码。</div>
            </div>
          </div>

          {!otpSent ? (
            <button
              type="button"
              onClick={() => void startGlobeOtp()}
              disabled={authBusy}
              className="mt-2 inline-flex h-7 items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 text-[10px] font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
            >
              {authBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {authBusy ? "发送中" : "发送验证码"}
            </button>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <input
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="短信验证码"
                className="h-7 w-28 rounded-lg border border-amber-200 bg-white px-2 text-[10px] text-slate-700 outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={() => void verifyGlobeOtp()}
                disabled={authBusy || !otpCode.trim()}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 text-[10px] font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
              >
                {authBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {authBusy ? "验证中" : "验证并同步"}
              </button>
              <button
                type="button"
                onClick={() => void startGlobeOtp()}
                disabled={authBusy}
                className="h-7 px-1.5 text-[10px] text-amber-700 hover:text-amber-900 disabled:opacity-60"
              >
                重新发送
              </button>
            </div>
          )}
        </div>
      ) : null}

      {error ? (
        <div className="mt-2 rounded-lg bg-rose-50 px-2 py-1.5 text-[10px] leading-4 text-rose-600">{error}</div>
      ) : automatic && connector && ["authentication", "error"].includes(connector.healthStatus) && connector.lastError && !needsGlobeOtp ? (
        <div className="mt-2 rounded-lg bg-rose-50 px-2 py-1.5 text-[10px] leading-4 text-rose-600">
          {connector.lastError}{connector.failureCount > 1 ? ` · 连续失败 ${connector.failureCount} 次` : ""}
        </div>
      ) : null}
    </div>
  );
}
