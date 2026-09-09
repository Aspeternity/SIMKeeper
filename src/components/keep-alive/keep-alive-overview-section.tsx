"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, CalendarClock, Loader2, ShieldCheck } from "lucide-react";
import { ServiceOverviewSection } from "@/components/services/service-overview-section";
import { SimLifecycleTimelineSection } from "@/components/sims/sim-lifecycle-timeline-section";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  getKeepAliveActivityLabel,
  getKeepAliveDueDateSourceLabel,
  getKeepAliveIntervalLabel,
  getKeepAliveRechargeRequirementLabel,
  getKeepAliveRuleStatusLabel,
  type KeepAliveRuleStatus,
} from "@/lib/keep-alive";
import type { KeepAliveEventRecord, KeepAliveRuleRecord } from "@/lib/keep-alive-types";
import { getReminderActionRecordLabel, type ReminderActionRecord } from "@/lib/reminder-action-types";

function statusClass(status: KeepAliveRuleStatus) {
  if (status === "overdue") return "bg-rose-50 text-rose-700 ring-rose-100";
  if (status === "grace") return "bg-orange-50 text-orange-700 ring-orange-100";
  if (status === "due_soon") return "bg-amber-50 text-amber-700 ring-amber-100";
  if (status === "ok") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  return "bg-slate-100 text-slate-500 ring-slate-200";
}

function reminderActionClass(action: ReminderActionRecord) {
  if (action.action === "snoozed") return "bg-sky-50 text-sky-700 ring-sky-100";
  if (action.action === "ignored") return "bg-slate-100 text-slate-600 ring-slate-200";
  return action.verified
    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
    : "bg-amber-50 text-amber-700 ring-amber-100";
}

function eventSummary(event: KeepAliveEventRecord) {
  const parts = [getKeepAliveActivityLabel(event.activityType)];
  if (event.amount !== null) parts.push(`${event.amount} ${event.currencyCode || ""}`.trim());
  if (event.balanceAfter !== null) parts.push(`余额 ${event.balanceAfter} ${event.currencyCode || ""}`.trim());
  if (event.validUntilAfter) parts.push(`有效期至 ${event.validUntilAfter}`);
  return parts.join(" · ");
}

export function KeepAliveOverviewSection({
  simId,
  initialOpen = false,
  focusRuleId = null,
  showServices = true,
}: {
  simId: number;
  initialOpen?: boolean;
  focusRuleId?: number | null;
  showServices?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rules, setRules] = useState<KeepAliveRuleRecord[]>([]);
  const [events, setEvents] = useState<KeepAliveEventRecord[]>([]);

  useEffect(() => {
    if (initialOpen) setOpen(true);
  }, [initialOpen, simId]);

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
    return () => { active = false; };
  }, [simId]);

  useEffect(() => {
    if (!open || loading || !focusRuleId) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`keep-alive-rule-${focusRuleId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [focusRuleId, loading, open]);

  const actionableCount = rules.filter((rule) => ["overdue", "grace", "due_soon"].includes(rule.status)).length;

  return (
    <>
      {showServices ? (
        <>
          <ServiceOverviewSection simId={simId} />
          <SimLifecycleTimelineSection simId={simId} />
        </>
      ) : null}

      <CollapsibleSection
        title="保号状态"
        description="真实状态按号码有效期和保号规则计算；暂缓或忽略提醒只改变通知节奏。"
        icon={<ShieldCheck className="h-4 w-4" />}
        open={open}
        onToggle={() => setOpen((value) => !value)}
        badge={!loading && rules.length ? <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${actionableCount ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{actionableCount ? `${actionableCount} 项待关注` : `${rules.length} 条规则`}</span> : undefined}
        action={<Link href="/history" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink-secondary shadow-sm transition hover:border-line-strong hover:bg-surface-hover hover:text-ink"><ShieldCheck className="h-3.5 w-3.5" />管理规则</Link>}
        dataAttribute="keep-alive"
      >
        {loading ? (
          <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-line text-sm text-ink-muted"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载保号信息…</div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        ) : (
          <div className="space-y-3">
            {rules.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {rules.map((rule) => {
                  const focused = focusRuleId === rule.id;
                  return (
                    <div
                      id={`keep-alive-rule-${rule.id}`}
                      key={rule.id}
                      className={`rounded-xl border p-4 transition ${focused ? "border-sky-300 bg-sky-50/60 ring-2 ring-sky-100" : "border-line bg-surface"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-ink">{rule.name}</span>
                            {focused ? <span className="rounded-md bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">提醒对应规则</span> : null}
                            <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${statusClass(rule.status)}`}>{getKeepAliveRuleStatusLabel(rule.status)}</span>
                            <span className="rounded-md bg-surface-subtle px-2 py-0.5 text-[10px] text-ink-muted ring-1 ring-inset ring-line">{getKeepAliveDueDateSourceLabel(rule.dueDateSource)}</span>
                            {rule.reminderAction ? <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${reminderActionClass(rule.reminderAction)}`}>{getReminderActionRecordLabel(rule.reminderAction)}</span> : null}
                          </div>
                          <div className="mt-1 text-xs text-ink-muted">每 {getKeepAliveIntervalLabel(rule.intervalValue, rule.intervalUnit)} · {rule.qualifyingActions.map(getKeepAliveActivityLabel).join(" / ")}</div>
                          {getKeepAliveRechargeRequirementLabel(rule.minimumRechargeAmount, rule.rechargeCurrencyCode) ? <div className="mt-1 text-xs font-medium text-ink-secondary">充值要求：{getKeepAliveRechargeRequirementLabel(rule.minimumRechargeAmount, rule.rechargeCurrencyCode)}</div> : null}
                        </div>
                        <CalendarClock className="h-4 w-4 shrink-0 text-ink-muted" />
                      </div>
                      <div className="mt-3 rounded-lg bg-surface-subtle px-3 py-2.5">
                        <div className="text-[10px] font-medium text-ink-muted">{rule.dueDateSource === "sim_validity" ? "下一次操作日期 · 跟随号码有效期" : "下一次操作日期"}</div>
                        <div className="mt-0.5 text-sm font-medium tabular-nums text-ink-secondary">{rule.nextDueDate || "待设置"}</div>
                      </div>
                      {rule.reminderAction ? (
                        <div className="mt-2 text-[11px] leading-5 text-ink-muted">
                          {rule.reminderAction.action === "snoozed"
                            ? "本轮真实状态没有改变，仅暂停提醒与外部通知，到暂缓日期后会自动恢复。"
                            : rule.reminderAction.action === "ignored"
                              ? "本轮真实状态没有改变，仅停止当前轮次的提醒与外部通知。"
                              : rule.reminderAction.verified
                                ? "已经记录实际处理；如果真实状态仍未更新，请检查新的有效期或保号日期。"
                                : "这是旧版一键“已处理”记录，未经过真实操作核验，因此不再用于隐藏提醒。"}
                        </div>
                      ) : null}
                      {rule.notes ? <div className="mt-2 text-xs leading-5 text-ink-muted">{rule.notes}</div> : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-ink-muted">还没有配置保号规则。前往“保号规则”即可开始设置。</div>
            )}

            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink"><Activity className="h-4 w-4 text-ink-muted" />最近实际活动</div>
              {events.length ? (
                <div className="divide-y divide-line">
                  {events.slice(0, 5).map((event) => (
                    <div key={event.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-xs font-medium text-ink-secondary">{eventSummary(event)}</div>
                        {event.notes ? <div className="mt-0.5 text-[11px] leading-4 text-ink-muted">{event.notes}</div> : null}
                      </div>
                      <div className="shrink-0 text-xs tabular-nums text-ink-muted">{event.activityDate}</div>
                    </div>
                  ))}
                </div>
              ) : <div className="text-xs text-ink-muted">暂无生命周期活动记录。</div>}
            </div>
          </div>
        )}
      </CollapsibleSection>
    </>
  );
}
