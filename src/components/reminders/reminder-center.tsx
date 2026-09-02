"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  CircleHelp,
  Clock3,
  Search,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

export function ReminderCenter({ reminders }: { reminders: ReminderItem[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");

  const summary = useMemo(() => ({
    total: reminders.length,
    overdue: reminders.filter((item) => item.status === "overdue" || item.status === "grace").length,
    today: reminders.filter((item) => item.status === "today").length,
    upcoming: reminders.filter((item) => item.status === "upcoming").length,
    unscheduled: reminders.filter((item) => item.status === "unscheduled").length,
  }), [reminders]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return reminders.filter((item) => {
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
  }, [kindFilter, query, reminders, statusFilter]);

  const stats = [
    { label: "当前提醒", value: summary.total, icon: BellRing },
    { label: "已逾期 / 宽限", value: summary.overdue, icon: AlertTriangle },
    { label: "今天到期", value: summary.today, icon: Clock3 },
    { label: "即将到期", value: summary.upcoming, icon: CalendarClock },
  ];

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

      <Card className="overflow-hidden">
        <div className="space-y-3 border-b p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="font-medium text-slate-900">提醒列表</div>
              <div className="mt-1 text-xs text-slate-400">
                显示 {filtered.length} / {reminders.length} 条提醒{summary.unscheduled ? ` · 待设置日期 ${summary.unscheduled} 条` : ""}
              </div>
            </div>
            <div className="relative w-full xl:w-96">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索号码、运营商或提醒内容" className="pl-9" />
            </div>
          </div>

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
          </div>
        </div>

        {filtered.length ? (
          <div className="divide-y divide-slate-100">
            {filtered.map((item) => {
              const Icon = item.kind === "sim_validity" ? Smartphone : ShieldCheck;
              return (
                <div key={item.key} className="p-4 transition hover:bg-slate-50/70 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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

                    <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
                      <div className={`text-sm font-medium ${relativeClass(item.status)}`}>{getReminderRelativeLabel(item)}</div>
                      <div className="text-xs text-slate-400">{item.dueDate || "未设置日期"}</div>
                      <Link href={item.href} className="inline-flex h-8 items-center justify-center rounded-lg border px-3 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-slate-950">前往处理</Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><CircleHelp className="h-5 w-5" /></div>
            <p className="mt-4 text-sm font-medium">没有匹配的提醒</p>
            <p className="mt-1 max-w-md text-xs leading-5 text-slate-400">当前筛选条件下没有需要处理的号码。号码进入有效期提醒窗口或保号规则提醒窗口后会自动出现在这里。</p>
          </div>
        )}
      </Card>
    </div>
  );
}
