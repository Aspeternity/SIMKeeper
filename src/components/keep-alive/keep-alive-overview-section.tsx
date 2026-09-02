"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, CalendarClock, ChevronDown, Loader2, ShieldCheck } from "lucide-react";
import {
  getKeepAliveActivityLabel,
  getKeepAliveIntervalLabel,
  getKeepAliveRuleStatusLabel,
  type KeepAliveRuleStatus,
} from "@/lib/keep-alive";
import type { KeepAliveEventRecord, KeepAliveRuleRecord } from "@/lib/keep-alive-types";

function statusClass(status: KeepAliveRuleStatus) {
  if (status === "overdue") return "bg-rose-50 text-rose-700 ring-rose-100";
  if (status === "grace") return "bg-orange-50 text-orange-700 ring-orange-100";
  if (status === "due_soon") return "bg-amber-50 text-amber-700 ring-amber-100";
  if (status === "ok") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  return "bg-slate-100 text-slate-500 ring-slate-200";
}

function eventSummary(event: KeepAliveEventRecord) {
  const parts = [getKeepAliveActivityLabel(event.activityType)];
  if (event.amount !== null) parts.push(`${event.amount} ${event.currencyCode || ""}`.trim());
  if (event.balanceAfter !== null) parts.push(`余额 ${event.balanceAfter} ${event.currencyCode || ""}`.trim());
  if (event.validUntilAfter) parts.push(`有效期至 ${event.validUntilAfter}`);
  return parts.join(" · ");
}

export function KeepAliveOverviewSection({ simId }: { simId: number }) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rules, setRules] = useState<KeepAliveRuleRecord[]>([]);
  const [events, setEvents] = useState<KeepAliveEventRecord[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/keep-alive?simId=${simId}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "保号信息加载失败");
        if (!active) return;
        setRules(data.rules || []);
        setEvents(data.events || []);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "保号信息加载失败");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [simId]);

  return (
    <section className="space-y-3 border-t pt-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <button type="button" onClick={() => setOpen((value) => !value)} className="group flex min-w-0 flex-1 items-start gap-2 text-left" title={open ? "收起" : "展开"}>
          <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`} />
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span className="min-w-0">
            <span className="block font-medium text-slate-900">保号状态</span>
            <span className="mt-1 block text-xs font-normal leading-5 text-slate-400">查看当前保号规则、下一次操作日期和最近活动记录。</span>
          </span>
        </button>
        <Link href="/history" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50">
          <ShieldCheck className="h-3.5 w-3.5" />管理保号
        </Link>
      </div>

      {open ? loading ? (
        <div className="flex min-h-28 items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载保号信息…</div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : (
        <div className="space-y-3">
          {rules.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {rules.map((rule) => (
                <div key={rule.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">{rule.name}</span>
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${statusClass(rule.status)}`}>{getKeepAliveRuleStatusLabel(rule.status)}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-400">每 {getKeepAliveIntervalLabel(rule.intervalValue, rule.intervalUnit)} · {rule.qualifyingActions.map(getKeepAliveActivityLabel).join(" / ")}</div>
                    </div>
                    <CalendarClock className="h-4 w-4 shrink-0 text-slate-300" />
                  </div>
                  <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5">
                    <div className="text-[10px] text-slate-400">下一次操作日期</div>
                    <div className="mt-0.5 text-sm font-medium text-slate-700">{rule.nextDueDate || "待设置"}</div>
                  </div>
                  {rule.notes ? <div className="mt-2 text-xs leading-5 text-slate-400">{rule.notes}</div> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-xs text-slate-400">还没有配置保号规则。前往“保号管理”即可开始设置。</div>
          )}

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-800"><Activity className="h-4 w-4 text-slate-400" />最近保号记录</div>
            {events.length ? (
              <div className="divide-y divide-slate-100">
                {events.slice(0, 5).map((event) => (
                  <div key={event.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-xs font-medium text-slate-600">{eventSummary(event)}</div>
                      {event.notes ? <div className="mt-0.5 text-[11px] leading-4 text-slate-400">{event.notes}</div> : null}
                    </div>
                    <div className="shrink-0 text-xs text-slate-400">{event.activityDate}</div>
                  </div>
                ))}
              </div>
            ) : <div className="text-xs text-slate-400">暂无保号活动记录。</div>}
          </div>
        </div>
      ) : null}
    </section>
  );
}
