"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  ExternalLink,
  History,
  Loader2,
  Search,
  ShieldCheck,
  Smartphone,
  TimerReset,
  XCircle,
} from "lucide-react";
import { KeepAliveEventModal } from "@/components/keep-alive/keep-alive-event-modal";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getReminderActionRecordLabel,
  type ReminderActionRecord,
  type ReminderActionType,
} from "@/lib/reminder-action-types";
import type { KeepAliveRuleRecord, KeepAliveSimSummary } from "@/lib/keep-alive-types";
import {
  getReminderKindLabel,
  getReminderRelativeLabel,
  getReminderStatusLabel,
  type ReminderItem,
  type ReminderStatus,
} from "@/lib/reminders";

function statusClass(status: ReminderStatus) {
  if (status === "overdue") return "bg-rose-50 text-rose-700 ring-rose-100";
  if (status === "grace") return "bg-orange-50 text-orange-700 ring-orange-100";
  if (status === "today") return "bg-amber-50 text-amber-700 ring-amber-100";
  if (status === "upcoming") return "bg-sky-50 text-sky-700 ring-sky-100";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function relativeClass(status: ReminderStatus) {
  if (status === "overdue") return "text-rose-700";
  if (status === "grace") return "text-orange-700";
  if (status === "today") return "text-amber-700";
  if (status === "upcoming") return "text-sky-700";
  return "text-slate-500";
}

function actionClass(item: ReminderActionRecord) {
  if (item.action === "completed") {
    return item.verified ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-amber-50 text-amber-700 ring-amber-100";
  }
  if (item.action === "snoozed") return "bg-sky-50 text-sky-700 ring-sky-100";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function actionIcon(action: ReminderActionType) {
  if (action === "completed") return Check;
  if (action === "snoozed") return TimerReset;
  return XCircle;
}

function formatActionTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

type CompletionTarget = {
  reminder: ReminderItem;
  sim: KeepAliveSimSummary;
  rules: KeepAliveRuleRecord[];
};

export function ReminderCenter({
  reminders,
  history,
}: {
  reminders: ReminderItem[];
  history: ReminderActionRecord[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(reminders);
  const [actionHistory, setActionHistory] = useState(history);
  const [view, setView] = useState<"active" | "history">("active");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [actingKey, setActingKey] = useState("");
  const [completionLoadingKey, setCompletionLoadingKey] = useState("");
  const [completionTarget, setCompletionTarget] = useState<CompletionTarget | null>(null);
  const [error, setError] = useState("");

  useEffect(() => setItems(reminders), [reminders]);
  useEffect(() => setActionHistory(history), [history]);

  const summary = useMemo(() => ({
    total: items.length,
    overdue: items.filter((item) => item.status === "overdue" || item.status === "grace").length,
    today: items.filter((item) => item.status === "today").length,
    upcoming: items.filter((item) => item.status === "upcoming").length,
    unscheduled: items.filter((item) => item.status === "unscheduled").length,
  }), [items]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery = !keyword || [
        item.simLabel,
        item.phoneNumber || "",
        item.carrierName,
        item.country,
        item.title,
      ].some((value) => value.toLowerCase().includes(keyword));
      const matchesKind = kindFilter === "all" || item.kind === kindFilter;
      const matchesStatus = statusFilter === "all"
        || (statusFilter === "urgent" && ["overdue", "grace", "today"].includes(item.status))
        || item.status === statusFilter;
      return matchesQuery && matchesKind && matchesStatus;
    });
  }, [items, kindFilter, query, statusFilter]);

  const filteredHistory = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return actionHistory.filter((item) => !keyword || [
      item.simLabel,
      item.title,
      getReminderActionRecordLabel(item),
      getReminderKindLabel(item.kind),
    ].some((value) => value.toLowerCase().includes(keyword)));
  }, [actionHistory, query]);

  const stats = [
    { label: "当前提醒", value: summary.total, icon: BellRing },
    { label: "已逾期 / 宽限", value: summary.overdue, icon: AlertTriangle },
    { label: "今天到期", value: summary.today, icon: Clock3 },
    { label: "即将到期", value: summary.upcoming, icon: CalendarClock },
  ];

  async function reloadReminderState() {
    const response = await fetch("/api/reminders", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "提醒数据刷新失败");
    setItems(Array.isArray(data.reminders) ? data.reminders : []);
    setActionHistory(Array.isArray(data.history) ? data.history : []);
  }

  async function performReminderAction(item: ReminderItem, action: "snoozed" | "ignored", snoozeDays?: number) {
    const occurrence = `${item.key}:${item.dueDate ?? "none"}`;
    setActingKey(occurrence);
    setError("");
    try {
      const response = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminderKey: item.key, dueDate: item.dueDate, action, snoozeDays }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "提醒处理失败");
      setItems(Array.isArray(data.reminders) ? data.reminders : items.filter((current) => current.key !== item.key || current.dueDate !== item.dueDate));
      if (data.action) setActionHistory((current) => [data.action, ...current]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "提醒处理失败");
    } finally {
      setActingKey("");
    }
  }

  async function openCompletion(item: ReminderItem) {
    const occurrence = `${item.key}:${item.dueDate ?? "none"}`;
    setCompletionLoadingKey(occurrence);
    setError("");
    try {
      const response = await fetch(`/api/keep-alive?simId=${item.simId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "号码生命周期数据加载失败");
      if (!data.sim) throw new Error("号码不存在或已被删除");
      const rules = Array.isArray(data.rules) ? data.rules as KeepAliveRuleRecord[] : [];
      const events = Array.isArray(data.events) ? data.events : [];
      const sim: KeepAliveSimSummary = {
        ...data.sim,
        rules,
        latestEvent: events[0] ?? null,
      };
      setCompletionTarget({ reminder: item, sim, rules });
    } catch (err) {
      setError(err instanceof Error ? err.message : "号码生命周期数据加载失败");
    } finally {
      setCompletionLoadingKey("");
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">{stat.label}</span>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Icon className="h-4 w-4" /></div>
              </div>
              <div className="mt-4 text-3xl font-semibold tracking-tight">{stat.value}</div>
            </Card>
          );
        })}
      </section>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <Card className="overflow-hidden">
        <div className="space-y-4 border-b p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="inline-flex w-fit rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setView("active");
                  setQuery("");
                }}
                className={`h-8 rounded-lg px-3 text-xs font-medium transition ${view === "active" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                待处理 · {items.length}
              </button>
              <button
                type="button"
                onClick={() => {
                  setView("history");
                  setQuery("");
                }}
                className={`h-8 rounded-lg px-3 text-xs font-medium transition ${view === "history" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                处理历史 · {actionHistory.length}
              </button>
            </div>
            <div className="relative w-full xl:w-96">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={view === "active" ? "搜索号码、运营商或提醒内容" : "搜索号码、提醒或处理方式"}
                className="pl-9"
              />
            </div>
          </div>

          {view === "active" ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 outline-none focus:border-slate-400">
                <option value="all">全部状态</option>
                <option value="urgent">需要优先处理</option>
                <option value="overdue">已逾期</option>
                <option value="grace">宽限期</option>
                <option value="today">今天到期</option>
                <option value="upcoming">即将到期</option>
                <option value="unscheduled">待设置日期</option>
              </select>
              <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 outline-none focus:border-slate-400">
                <option value="all">全部类型</option>
                <option value="sim_validity">号码有效期</option>
                <option value="keep_alive">保号规则</option>
              </select>
              <div className="flex items-center text-xs text-slate-400 sm:ml-auto">
                显示 {filtered.length} / {items.length} 条提醒{summary.unscheduled ? ` · 待设置日期 ${summary.unscheduled} 条` : ""}
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400">实际完成处理会留下核验记录；稍后提醒和忽略本轮只改变提醒状态，不改变真实生命周期。</div>
          )}
        </div>

        {view === "active" ? (
          filtered.length ? (
            <div className="divide-y divide-slate-100">
              {filtered.map((item) => {
                const Icon = item.kind === "sim_validity" ? Smartphone : ShieldCheck;
                const occurrence = `${item.key}:${item.dueDate ?? "none"}`;
                const busy = actingKey === occurrence || completionLoadingKey === occurrence;
                return (
                  <div key={`${item.key}-${item.dueDate ?? "none"}`} className="p-4 transition hover:bg-slate-50/70 sm:p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Icon className="h-4 w-4" /></div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-900">{item.simLabel}</span>
                            <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${statusClass(item.status)}`}>{getReminderStatusLabel(item.status)}</span>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{getReminderKindLabel(item.kind)}</span>
                          </div>
                          <div className="mt-1 text-sm text-slate-600">{item.title}</div>
                          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-400">
                            <span>{item.phoneNumber || "未填写手机号"}</span>
                            <span>{item.carrierName}</span>
                            <span>{item.country}</span>
                          </div>
                          <div className="mt-2 text-xs leading-5 text-slate-400">{item.detail}</div>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-start gap-3 xl:items-end">
                        <div className="text-left xl:text-right">
                          <div className={`text-sm font-medium ${relativeClass(item.status)}`}>{getReminderRelativeLabel(item)}</div>
                          <div className="mt-0.5 text-xs text-slate-400">{item.dueDate || "未设置日期"}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                          <Link href={item.href} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-slate-950">
                            查看详情 <ExternalLink className="h-3 w-3" />
                          </Link>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void openCompletion(item)}
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {completionLoadingKey === occurrence ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}完成处理
                          </button>
                          <select
                            defaultValue=""
                            disabled={busy}
                            aria-label={`稍后提醒 ${item.simLabel}`}
                            onChange={(event) => {
                              const days = Number(event.target.value);
                              if (days) void performReminderAction(item, "snoozed", days);
                            }}
                            className="h-8 rounded-lg border border-sky-200 bg-sky-50 px-2 text-xs font-medium text-sky-700 outline-none transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <option value="" disabled>稍后提醒</option>
                            <option value="1">明天再提醒</option>
                            <option value="3">3 天后提醒</option>
                            <option value="7">7 天后提醒</option>
                            <option value="14">14 天后提醒</option>
                          </select>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (window.confirm(`忽略“${item.simLabel} · ${item.title}”当前这一轮提醒吗？真实生命周期状态不会改变，截止日期变化后仍会重新提醒。`)) {
                                void performReminderAction(item, "ignored");
                              }
                            }}
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-500 transition hover:bg-white hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <XCircle className="h-3 w-3" />忽略本轮
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              {items.length ? (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><CircleHelp className="h-5 w-5" /></div>
                  <p className="mt-4 text-sm font-medium">没有匹配的提醒</p>
                  <p className="mt-1 max-w-md text-xs leading-5 text-slate-400">当前筛选条件下没有需要处理的号码。</p>
                </>
              ) : (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></div>
                  <p className="mt-4 text-sm font-medium text-slate-800">当前没有需要处理的提醒</p>
                  <p className="mt-1 max-w-md text-xs leading-5 text-slate-400">已忽略或仍在暂缓期限内的事项不会出现在这里；真正完成的事项由新的有效期或下一次保号日期自然结束当前轮次。</p>
                </>
              )}
            </div>
          )
        ) : filteredHistory.length ? (
          <div className="divide-y divide-slate-100">
            {filteredHistory.map((item) => {
              const ActionIcon = actionIcon(item.action);
              return (
                <div key={item.id} className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><History className="h-4 w-4" /></div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-slate-900">{item.simLabel}</span>
                          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${actionClass(item)}`}>
                            <ActionIcon className="h-3 w-3" />{getReminderActionRecordLabel(item)}
                          </span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{getReminderKindLabel(item.kind)}</span>
                        </div>
                        <div className="mt-1 text-sm text-slate-600">{item.title}</div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                          <span>本轮截止：{item.dueDate || "未设置日期"}</span>
                          {item.action === "completed" && !item.verified ? <span className="font-medium text-amber-600">该记录来自旧版一键标记，不再用于压制提醒</span> : null}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-xs text-slate-400">{formatActionTime(item.actedAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><History className="h-5 w-5" /></div>
            <p className="mt-4 text-sm font-medium">还没有处理历史</p>
            <p className="mt-1 max-w-md text-xs leading-5 text-slate-400">完成实际生命周期操作、稍后提醒或忽略本轮后，记录会保留在这里。</p>
          </div>
        )}
      </Card>

      {completionTarget ? (
        <KeepAliveEventModal
          sim={completionTarget.sim}
          rules={completionTarget.rules}
          completionReminder={completionTarget.reminder}
          onClose={() => setCompletionTarget(null)}
          onSaved={async () => {
            await reloadReminderState();
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
