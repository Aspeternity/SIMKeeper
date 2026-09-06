"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
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

function formatDateTime(value: string | null | undefined) {
  if (!value) return "尚未同步";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function SimBalanceDetail({ sim }: { sim: SimRecord }) {
  const [source, setSource] = useState<BalanceSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "余额同步失败");
    } finally {
      setSyncing(false);
    }
  }

  const automatic = Boolean(source?.connector);
  const latest = automatic ? source?.latest : null;
  const balance = latest?.balance ?? sim.balance;
  const currencyCode = latest?.currencyCode ?? sim.currencyCode;
  const displayBalance = balance === null || balance === undefined
    ? "未记录"
    : `${balance} ${currencyCode || ""}`.trim();

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
            disabled={syncing}
            className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {syncing ? "同步中" : "立即同步"}
          </button>
        ) : null}
        {notice ? <span className="text-[10px] font-medium text-emerald-600">{notice}</span> : null}
      </div>

      {automatic && source?.connector ? (
        <div className="mt-2 space-y-0.5 text-[10px] leading-4 text-slate-400">
          <div>{source.connector.providerLabel} · 上次成功 {formatDateTime(source.connector.lastSuccessAt)}</div>
          {latest?.balanceValidUntil ? <div>余额有效期 {latest.balanceValidUntil}</div> : null}
          {source.connector.nextSyncAt ? <div>下次计划 {formatDateTime(source.connector.nextSyncAt)}</div> : null}
        </div>
      ) : null}

      {error ? (
        <div className="mt-2 rounded-lg bg-rose-50 px-2 py-1.5 text-[10px] leading-4 text-rose-600">{error}</div>
      ) : automatic && source?.connector?.status === "error" && source.connector.lastError ? (
        <div className="mt-2 rounded-lg bg-rose-50 px-2 py-1.5 text-[10px] leading-4 text-rose-600">{source.connector.lastError}</div>
      ) : null}
    </div>
  );
}
