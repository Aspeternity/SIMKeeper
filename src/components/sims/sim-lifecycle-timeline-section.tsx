"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertCircle,
  CalendarClock,
  ChevronDown,
  CircleDollarSign,
  History,
  Link2,
  Loader2,
  QrCode,
  RadioTower,
  RefreshCw,
  Smartphone,
  UserRoundCheck,
} from "lucide-react";

export type SimLifecycleCategory =
  | "system"
  | "balance"
  | "validity"
  | "device"
  | "service"
  | "identity"
  | "esim"
  | "keep_alive"
  | "sync"
  | "status";

type TimelineEvent = {
  id: string;
  simId: number;
  eventType: string;
  category: SimLifecycleCategory;
  occurredAt: string;
  title: string;
  detail: string | null;
  source: "lifecycle" | "keep_alive" | "sync_snapshot" | "sync_health";
};

const CATEGORY_META: Record<SimLifecycleCategory, { label: string; className: string; icon: ReactNode }> = {
  system: {
    label: "系统",
    className: "bg-slate-100 text-slate-600 ring-slate-200",
    icon: <History className="h-3.5 w-3.5" />,
  },
  balance: {
    label: "余额",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    icon: <CircleDollarSign className="h-3.5 w-3.5" />,
  },
  validity: {
    label: "有效期",
    className: "bg-amber-50 text-amber-700 ring-amber-100",
    icon: <CalendarClock className="h-3.5 w-3.5" />,
  },
  device: {
    label: "设备",
    className: "bg-sky-50 text-sky-700 ring-sky-100",
    icon: <Smartphone className="h-3.5 w-3.5" />,
  },
  service: {
    label: "绑定服务",
    className: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    icon: <Link2 className="h-3.5 w-3.5" />,
  },
  identity: {
    label: "实名",
    className: "bg-violet-50 text-violet-700 ring-violet-100",
    icon: <UserRoundCheck className="h-3.5 w-3.5" />,
  },
  esim: {
    label: "eSIM",
    className: "bg-cyan-50 text-cyan-700 ring-cyan-100",
    icon: <QrCode className="h-3.5 w-3.5" />,
  },
  keep_alive: {
    label: "保号 / 活动",
    className: "bg-orange-50 text-orange-700 ring-orange-100",
    icon: <Activity className="h-3.5 w-3.5" />,
  },
  sync: {
    label: "自动同步",
    className: "bg-blue-50 text-blue-700 ring-blue-100",
    icon: <RadioTower className="h-3.5 w-3.5" />,
  },
  status: {
    label: "状态",
    className: "bg-rose-50 text-rose-700 ring-rose-100",
    icon: <Activity className="h-3.5 w-3.5" />,
  },
};

function formatOccurredAt(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value.replace("T", " ").slice(0, 16);
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function dayKey(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value.slice(0, 10);
  return new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp));
}

function dayLabel(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value.slice(0, 10);
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date(timestamp));
}

export function SimLifecycleTimelineSection({ simId }: { simId: number }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  async function loadTimeline() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/sims/timeline?simId=${simId}&limit=100`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "生命周期时间线加载失败");
      setEvents(Array.isArray(data.events) ? data.events : []);
      setLoaded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "生命周期时间线加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setOpen(false);
    setEvents([]);
    setLoaded(false);
    setError("");
    setShowAll(false);
  }, [simId]);

  useEffect(() => {
    if (open && !loaded && !loading) void loadTimeline();
  }, [open, loaded, loading]);

  const visible = useMemo(() => (showAll ? events : events.slice(0, 12)), [events, showAll]);

  return (
    <section data-sim-lifecycle-timeline="alpha.46" className="space-y-3 border-t pt-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="group flex min-w-0 flex-1 items-start gap-2 text-left"
          title={open ? "收起" : "展开"}
        >
          <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`} />
          <History className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-900">生命周期时间线</span>
              {loaded ? (
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{events.length} 条</span>
              ) : null}
            </span>
            <span className="mt-1 block text-xs font-normal leading-5 text-slate-400">
              统一展示充值 / 保号、余额与同步、有效期、设备、绑定服务、实名及 eSIM 变化。
            </span>
          </span>
        </button>

        {open && loaded ? (
          <button
            type="button"
            onClick={() => void loadTimeline()}
            disabled={loading}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />刷新
          </button>
        ) : null}
      </div>

      {open ? (
        loading && !loaded ? (
          <div className="flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />正在整理生命周期历史…
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div>{error}</div>
              <button type="button" onClick={() => void loadTimeline()} className="mt-2 text-xs font-medium underline underline-offset-2">
                重新加载
              </button>
            </div>
          </div>
        ) : events.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2 sm:px-5">
            <div className="relative">
              <div className="absolute bottom-5 left-[7px] top-5 w-px bg-slate-100" />
              {visible.map((event, index) => {
                const meta = CATEGORY_META[event.category] ?? CATEGORY_META.system;
                const previous = visible[index - 1];
                const showDay = !previous || dayKey(previous.occurredAt) !== dayKey(event.occurredAt);
                return (
                  <div key={event.id}>
                    {showDay ? (
                      <div className="relative z-10 -ml-1 bg-white pb-1 pt-3 text-[11px] font-medium text-slate-400 first:pt-2">
                        {dayLabel(event.occurredAt)}
                      </div>
                    ) : null}
                    <div className="relative flex gap-3 py-3">
                      <div className="relative z-10 mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-[3px] border-white bg-slate-300 ring-1 ring-slate-200" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-slate-800">{event.title}</span>
                              <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${meta.className}`}>
                                {meta.icon}{meta.label}
                              </span>
                            </div>
                            {event.detail ? <div className="mt-1 text-xs leading-5 text-slate-500">{event.detail}</div> : null}
                          </div>
                          <time className="shrink-0 text-[11px] text-slate-400">{formatOccurredAt(event.occurredAt)}</time>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {events.length > 12 ? (
              <div className="border-t border-slate-100 py-3 text-center">
                <button
                  type="button"
                  onClick={() => setShowAll((value) => !value)}
                  className="text-xs font-medium text-slate-600 transition hover:text-slate-900"
                >
                  {showAll ? "收起较早记录" : `查看全部 ${events.length} 条记录`}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-8 text-center">
            <History className="mx-auto h-5 w-5 text-slate-300" />
            <div className="mt-2 text-sm font-medium text-slate-600">还没有生命周期记录</div>
            <p className="mt-1 text-xs text-slate-400">后续的充值、同步、设备迁移和资料变化会自动出现在这里。</p>
          </div>
        )
      ) : null}
    </section>
  );
}
