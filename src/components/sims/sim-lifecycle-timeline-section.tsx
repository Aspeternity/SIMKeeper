"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertCircle,
  CalendarClock,
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
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";

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
  system: { label: "系统", className: "bg-slate-100 text-slate-600 ring-slate-200", icon: <History className="h-3.5 w-3.5" /> },
  balance: { label: "余额", className: "bg-emerald-50 text-emerald-700 ring-emerald-100", icon: <CircleDollarSign className="h-3.5 w-3.5" /> },
  validity: { label: "有效期", className: "bg-amber-50 text-amber-700 ring-amber-100", icon: <CalendarClock className="h-3.5 w-3.5" /> },
  device: { label: "设备", className: "bg-sky-50 text-sky-700 ring-sky-100", icon: <Smartphone className="h-3.5 w-3.5" /> },
  service: { label: "绑定服务", className: "bg-indigo-50 text-indigo-700 ring-indigo-100", icon: <Link2 className="h-3.5 w-3.5" /> },
  identity: { label: "实名", className: "bg-violet-50 text-violet-700 ring-violet-100", icon: <UserRoundCheck className="h-3.5 w-3.5" /> },
  esim: { label: "eSIM", className: "bg-cyan-50 text-cyan-700 ring-cyan-100", icon: <QrCode className="h-3.5 w-3.5" /> },
  keep_alive: { label: "保号 / 活动", className: "bg-orange-50 text-orange-700 ring-orange-100", icon: <Activity className="h-3.5 w-3.5" /> },
  sync: { label: "自动同步", className: "bg-blue-50 text-blue-700 ring-blue-100", icon: <RadioTower className="h-3.5 w-3.5" /> },
  status: { label: "状态", className: "bg-rose-50 text-rose-700 ring-rose-100", icon: <Activity className="h-3.5 w-3.5" /> },
};

function formatOccurredAt(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value.replace("T", " ").slice(0, 16);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
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
    <div data-sim-lifecycle-timeline="alpha.46">
      <CollapsibleSection
        title="生命周期时间线"
        description="统一展示充值 / 保号、余额与同步、有效期、设备、绑定服务、实名及 eSIM 变化。"
        icon={<History className="h-4 w-4" />}
        open={open}
        onToggle={() => setOpen((value) => !value)}
        badge={loaded ? <span className="rounded-md bg-surface-subtle px-2 py-0.5 text-[10px] font-medium text-ink-muted">{events.length} 条</span> : undefined}
        action={open && loaded ? <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={() => void loadTimeline()} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />刷新</Button> : undefined}
        dataAttribute="timeline"
      >
        {loading && !loaded ? (
          <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-line text-sm text-ink-muted"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在整理生命周期历史…</div>
        ) : error ? (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div>{error}</div>
              <button type="button" onClick={() => void loadTimeline()} className="mt-2 text-xs font-medium underline underline-offset-2">重新加载</button>
            </div>
          </div>
        ) : events.length ? (
          <div className="rounded-xl border border-line bg-surface px-4 py-2 sm:px-5">
            <div className="relative">
              <div className="absolute bottom-5 left-[7px] top-5 w-px bg-line" />
              {visible.map((event, index) => {
                const meta = CATEGORY_META[event.category] ?? CATEGORY_META.system;
                const previous = visible[index - 1];
                const showDay = !previous || dayKey(previous.occurredAt) !== dayKey(event.occurredAt);
                return (
                  <div key={event.id}>
                    {showDay ? <div className="relative z-10 -ml-1 bg-surface pb-1 pt-3 text-[11px] font-medium text-ink-muted first:pt-2">{dayLabel(event.occurredAt)}</div> : null}
                    <div className="relative flex gap-3 py-3">
                      <div className="relative z-10 mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-[3px] border-surface bg-brand-soft-strong ring-1 ring-line" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-ink">{event.title}</span>
                              <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${meta.className}`}>{meta.icon}{meta.label}</span>
                            </div>
                            {event.detail ? <div className="mt-1 text-xs leading-5 text-ink-secondary">{event.detail}</div> : null}
                          </div>
                          <time className="shrink-0 text-[11px] tabular-nums text-ink-muted">{formatOccurredAt(event.occurredAt)}</time>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {events.length > 12 ? (
              <div className="border-t border-line py-3 text-center">
                <button type="button" onClick={() => setShowAll((value) => !value)} className="text-xs font-medium text-ink-secondary transition hover:text-ink">{showAll ? "收起较早记录" : `查看全部 ${events.length} 条记录`}</button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-line px-5 py-8 text-center">
            <History className="mx-auto h-5 w-5 text-ink-muted" />
            <div className="mt-2 text-sm font-medium text-ink-secondary">还没有生命周期记录</div>
            <p className="mt-1 text-xs text-ink-muted">后续的充值、同步、设备迁移和资料变化会自动出现在这里。</p>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}
