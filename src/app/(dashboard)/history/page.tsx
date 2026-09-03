"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CalendarClock, Loader2, Pencil, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { KeepAliveEventModal } from "@/components/keep-alive/keep-alive-event-modal";
import { KeepAliveRuleModal } from "@/components/keep-alive/keep-alive-rule-modal";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getKeepAliveActivityLabel,
  getKeepAliveDueDateSourceLabel,
  getKeepAliveIntervalLabel,
  getKeepAliveRechargeRequirementLabel,
  getKeepAliveRuleStatusLabel,
  type KeepAliveRuleStatus,
} from "@/lib/keep-alive";
import type { KeepAliveRuleRecord, KeepAliveSimSummary } from "@/lib/keep-alive-types";

function ruleStatusClass(status: KeepAliveRuleStatus) {
  switch (status) {
    case "ok":
      return "bg-emerald-50 text-emerald-700 ring-emerald-100";
    case "due_soon":
      return "bg-amber-50 text-amber-700 ring-amber-100";
    case "grace":
      return "bg-orange-50 text-orange-700 ring-orange-100";
    case "overdue":
      return "bg-rose-50 text-rose-700 ring-rose-100";
    case "disabled":
      return "bg-slate-100 text-slate-400 ring-slate-200";
    default:
      return "bg-sky-50 text-sky-700 ring-sky-100";
  }
}

function simKeepAliveState(sim: KeepAliveSimSummary) {
  const enabled = sim.rules.filter((rule) => rule.enabled);
  if (!enabled.length) return "unconfigured";
  if (enabled.some((rule) => rule.status === "overdue")) return "overdue";
  if (enabled.some((rule) => rule.status === "grace")) return "grace";
  if (enabled.some((rule) => rule.status === "due_soon")) return "due_soon";
  if (enabled.some((rule) => rule.status === "unscheduled")) return "unscheduled";
  return "ok";
}

function earliestRule(sim: KeepAliveSimSummary) {
  return sim.rules
    .filter((rule) => rule.enabled && rule.nextDueDate)
    .sort((a, b) => (a.nextDueDate || "9999-12-31").localeCompare(b.nextDueDate || "9999-12-31"))[0] ?? null;
}

function simStateLabel(state: string) {
  if (state === "unconfigured") return "未配置规则";
  if (state === "overdue") return "存在逾期";
  if (state === "grace") return "处于宽限期";
  if (state === "due_soon") return "即将需要处理";
  if (state === "unscheduled") return "待设置日期";
  return "正常";
}

function simStateClass(state: string) {
  if (state === "overdue") return "bg-rose-50 text-rose-700 ring-rose-100";
  if (state === "grace") return "bg-orange-50 text-orange-700 ring-orange-100";
  if (state === "due_soon") return "bg-amber-50 text-amber-700 ring-amber-100";
  if (state === "ok") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  return "bg-slate-100 text-slate-500 ring-slate-200";
}

export default function KeepAlivePage() {
  const [sims, setSims] = useState<KeepAliveSimSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [ruleTarget, setRuleTarget] = useState<{ sim: KeepAliveSimSummary; rule: KeepAliveRuleRecord | null } | null>(null);
  const [eventTarget, setEventTarget] = useState<KeepAliveSimSummary | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/keep-alive", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保号数据加载失败");
      setSims(data.sims || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保号数据加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return sims.filter((sim) => {
      const state = simKeepAliveState(sim);
      const matchesFilter = filter === "all" || (filter === "attention" ? ["overdue", "grace", "due_soon"].includes(state) : state === filter);
      const matchesSearch = !search || [sim.label, sim.phoneNumber || "", sim.carrierName, sim.country, ...sim.rules.map((rule) => rule.name)]
        .some((value) => value.toLowerCase().includes(search));
      return matchesFilter && matchesSearch;
    });
  }, [filter, query, sims]);

  async function deleteRule(rule: KeepAliveRuleRecord) {
    if (!window.confirm(`确定删除保号规则“${rule.name}”吗？历史活动记录不会删除。`)) return;
    setError("");
    try {
      const response = await fetch(`/api/keep-alive?type=rule&id=${rule.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除规则失败");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除规则失败");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500"><ShieldCheck className="h-4 w-4" />生命周期</div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">保号管理</h2>
        <p className="mt-1 text-sm text-slate-500">号码有效期类规则直接跟随号码资料；独立活跃规则单独计算自己的下一次操作日期，充值类规则还可以设置最低有效充值金额。</p>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="font-medium">号码与保号规则</div>
            <div className="mt-1 text-xs text-slate-400">显示 {filtered.length} / {sims.length} 个号码</div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={filter} onChange={(event) => setFilter(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-slate-400">
              <option value="all">全部号码</option>
              <option value="attention">需要处理</option>
              <option value="unconfigured">未配置规则</option>
              <option value="unscheduled">待设置日期</option>
              <option value="ok">正常</option>
            </select>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索号码、运营商或规则名称" className="pl-9" />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载保号数据…</div>
        ) : !filtered.length ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <ShieldCheck className="h-6 w-6 text-slate-300" />
            <div className="mt-3 text-sm font-medium text-slate-600">{sims.length ? "没有匹配的号码" : "还没有号码"}</div>
            <p className="mt-1 text-xs text-slate-400">录入号码后即可配置保号规则。</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((sim) => {
              const state = simKeepAliveState(sim);
              const earliest = earliestRule(sim);
              return (
                <div key={sim.id} className="space-y-4 p-5">
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">{sim.label}</span>
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${simStateClass(state)}`}>{simStateLabel(state)}</span>
                      </div>
                      <div className="mt-1 text-sm text-slate-500">{sim.phoneNumber || "未填写号码"} · {sim.carrierName} · {sim.country}</div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span>号码有效期：{sim.validUntil || "未设置"}</span>
                        <span>最近保号活动：{sim.latestEvent ? `${sim.latestEvent.activityDate} · ${getKeepAliveActivityLabel(sim.latestEvent.activityType)}` : "暂无记录"}</span>
                        {earliest ? <span>最近需处理：{earliest.nextDueDate} · {earliest.name}</span> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button type="button" onClick={() => setRuleTarget({ sim, rule: null })} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"><Plus className="h-3.5 w-3.5" />新增规则</button>
                      <button type="button" onClick={() => setEventTarget(sim)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-medium text-white transition hover:bg-slate-800"><Activity className="h-3.5 w-3.5" />记录活动</button>
                    </div>
                  </div>

                  {sim.rules.length ? (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {sim.rules.map((rule) => (
                        <div key={rule.id} className={`rounded-xl border p-4 ${rule.enabled ? "border-slate-200" : "border-slate-100 bg-slate-50/60"}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-slate-800">{rule.name}</span>
                                <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${ruleStatusClass(rule.status)}`}>{getKeepAliveRuleStatusLabel(rule.status)}</span>
                                <span className="rounded-md bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500 ring-1 ring-inset ring-slate-100">{getKeepAliveDueDateSourceLabel(rule.dueDateSource)}</span>
                              </div>
                              <div className="mt-1 text-xs text-slate-400">每 {getKeepAliveIntervalLabel(rule.intervalValue, rule.intervalUnit)} · {rule.qualifyingActions.map(getKeepAliveActivityLabel).join(" / ")}</div>
                              {getKeepAliveRechargeRequirementLabel(rule.minimumRechargeAmount, rule.rechargeCurrencyCode) ? (
                                <div className="mt-1 text-xs font-medium text-slate-500">充值要求：{getKeepAliveRechargeRequirementLabel(rule.minimumRechargeAmount, rule.rechargeCurrencyCode)}</div>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 gap-1">
                              <button type="button" onClick={() => setRuleTarget({ sim, rule })} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" title="编辑规则"><Pencil className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => void deleteRule(rule)} className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" title="删除规则"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
                            <div>
                              <div className="text-[10px] text-slate-400">{rule.dueDateSource === "sim_validity" ? "下一次操作日期 · 跟随号码有效期" : "下一次操作日期"}</div>
                              <div className="mt-0.5 text-sm font-medium text-slate-700">{rule.nextDueDate || "待设置"}</div>
                            </div>
                            <CalendarClock className="h-4 w-4 text-slate-300" />
                          </div>
                          {rule.notes ? <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{rule.notes}</div> : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-xs text-slate-400">还没有保号规则。号码有效期类规则建议选择“跟随号码有效期”；90 天活跃等要求选择“独立日期”。</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {ruleTarget ? (
        <KeepAliveRuleModal
          simId={ruleTarget.sim.id}
          simLabel={ruleTarget.sim.label}
          simValidUntil={ruleTarget.sim.validUntil}
          simCurrencyCode={ruleTarget.sim.currencyCode}
          rule={ruleTarget.rule}
          onClose={() => setRuleTarget(null)}
          onSaved={loadData}
        />
      ) : null}

      {eventTarget ? (
        <KeepAliveEventModal
          sim={eventTarget}
          rules={eventTarget.rules}
          onClose={() => setEventTarget(null)}
          onSaved={loadData}
        />
      ) : null}
    </div>
  );
}