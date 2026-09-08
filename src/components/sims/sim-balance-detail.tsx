"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, RefreshCw } from "lucide-react";
import type { SimRecord } from "@/lib/sim-types";

type SourceConnector = {
  id: number;
  provider: string;
  providerLabel: string;
  status: "connected" | "error";
  syncIntervalMinutes: number;
  hasCredentials: boolean;
  lastSyncedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
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
  if (!value) return "尚未更新";
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
  const latest = automatic ? source?.latest : null;
  const balance = latest?.balance ?? sim.balance;
  const currencyCode = latest?.currencyCode ?? sim.currencyCode;
  const displayBalance = balance === null || balance === undefined
    ? "未记录"
    : `${balance} ${currencyCode || ""}`.trim();
  const needsGlobeOtp = globeOtpRequired(source?.connector);
  const balanceUpdatedAt = latest?.syncedAt ?? sim.balanceUpdatedAt;
  const lowBalanceEligible = lowBalanceSourceEligible(source);

  return (
    <div className="rounded-xl bg-slate-50 px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-slate-400">余额</div>
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin text-slate-300" />
        ) : automatic ? (
          <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-700">自动同步</span>
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

      {automatic && source?.connector ? (
        <div className="mt-2 space-y-0.5 text-[10px] leading-4 text-slate-400">
          <div>{source.connector.providerLabel} · 上次成功 {formatDateTime(source.connector.lastSuccessAt)}</div>
          {latest?.balanceValidUntil ? <div>余额有效期 {latest.balanceValidUntil}</div> : null}
          {source.connector.nextSyncAt ? <div>下次计划 {formatDateTime(source.connector.nextSyncAt)}</div> : null}
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
      ) : automatic && source?.connector?.status === "error" && source.connector.lastError && !needsGlobeOtp ? (
        <div className="mt-2 rounded-lg bg-rose-50 px-2 py-1.5 text-[10px] leading-4 text-rose-600">{source.connector.lastError}</div>
      ) : null}
    </div>
  );
}
