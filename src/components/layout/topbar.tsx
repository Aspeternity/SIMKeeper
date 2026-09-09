"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Loader2,
  LogOut,
  Menu,
  ShieldCheck,
  Smartphone,
  TimerReset,
  X,
  XCircle,
} from "lucide-react";
import { SiteMark } from "@/components/branding/site-mark";
import {
  APP_VERSION,
  getPageTitle,
  navigationItemIsActive,
  PRIMARY_NAV_ITEMS,
  SETTINGS_NAV_ITEM,
} from "@/components/layout/navigation";
import {
  buildAttentionItems,
  getAttentionSummary,
  type AttentionItem,
  type AttentionPriority,
} from "@/lib/attention-items";
import {
  REMINDER_STATE_CHANGED_EVENT,
  REMINDER_TASK_FOCUS_EVENT,
} from "@/lib/reminders";

function priorityClass(priority: AttentionPriority) {
  if (priority === "critical") return "bg-rose-50 text-rose-700 ring-rose-100";
  if (priority === "attention") return "bg-amber-50 text-amber-700 ring-amber-100";
  if (priority === "watch") return "bg-sky-50 text-sky-700 ring-sky-100";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function relativeClass(priority: AttentionPriority) {
  if (priority === "critical") return "text-rose-700";
  if (priority === "attention") return "text-amber-700";
  if (priority === "watch") return "text-sky-700";
  return "text-slate-500";
}

export function Topbar({
  username,
  items: initialItems,
  siteName,
  siteDescription,
  logoUrl,
}: {
  username: string;
  items: AttentionItem[];
  siteName: string;
  siteDescription: string;
  logoUrl: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [items, setItems] = useState(initialItems);
  const [actingKey, setActingKey] = useState("");
  const [panelError, setPanelError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const pageTitle = getPageTitle(pathname);
  const summary = useMemo(() => getAttentionSummary(items), [items]);
  const preview = items.slice(0, 6);
  const bellLabel = summary.total > 0 ? `${summary.total} 项待处理事项` : "当前没有需要处理的事项";
  const SettingsIcon = SETTINGS_NAV_ITEM.icon;

  useEffect(() => setItems(initialItems), [initialItems]);

  const refreshItems = useCallback(async () => {
    try {
      const response = await fetch(`/api/attention?_=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data.items)) setItems(data.items as AttentionItem[]);
    } catch {
      // Keep the last known state when a transient refresh fails.
    }
  }, []);

  useEffect(() => {
    let retryTimer: number | null = null;
    const handleStateChanged = () => {
      void refreshItems();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => void refreshItems(), 350);
    };
    const handleWindowFocus = () => void refreshItems();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshItems();
    };
    const interval = window.setInterval(() => void refreshItems(), 15000);

    window.addEventListener(REMINDER_STATE_CHANGED_EVENT, handleStateChanged);
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      window.clearInterval(interval);
      window.removeEventListener(REMINDER_STATE_CHANGED_EVENT, handleStateChanged);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshItems]);

  useEffect(() => {
    setMobileNavigationOpen(false);
    setPanelOpen(false);
    setPanelError("");
    void refreshItems();
  }, [pathname, refreshItems]);

  useEffect(() => {
    if (!mobileNavigationOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavigationOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileNavigationOpen]);

  useEffect(() => {
    if (!panelOpen) return;
    const closePanel = (event: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setPanelOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanelOpen(false);
    };
    document.addEventListener("pointerdown", closePanel);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closePanel);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [panelOpen]);

  async function quickAction(item: AttentionItem, action: "snoozed" | "ignored") {
    if (!item.reminderKey || actingKey) return;
    if (action === "ignored") {
      const message = item.kind === "low_balance"
        ? `确定忽略“${item.subjectLabel} · ${item.title}”当前这一轮低余额状态吗？\n\n余额恢复后本轮会自动结束；以后再次低余额时 SIMKeeper 会创建新一轮并重新提醒。`
        : `确定忽略“${item.subjectLabel} · ${item.title}”本轮事项吗？\n\n如果下一轮到期条件再次出现，SIMKeeper 仍会重新生成事项。`;
      if (!window.confirm(message)) return;
    }

    setActingKey(item.key);
    setPanelError("");
    try {
      const response = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reminderKey: item.reminderKey,
          dueDate: item.dueDate,
          action,
          snoozeDays: action === "snoozed" ? 3 : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "事项处理失败");
      if (Array.isArray(data.reminders)) setItems(buildAttentionItems(data.reminders));
      window.dispatchEvent(new Event(REMINDER_STATE_CHANGED_EVENT));
      router.refresh();
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : "事项处理失败");
    } finally {
      setActingKey("");
    }
  }

  return (
    <>
      <header data-page-title={pageTitle} className="sticky top-0 z-30 flex h-20 items-center justify-between border-b bg-white/95 px-4 backdrop-blur sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setPanelOpen(false);
              setMobileNavigationOpen(true);
            }}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 lg:hidden"
            aria-label="打开导航"
            aria-expanded={mobileNavigationOpen}
            aria-controls="mobile-navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="hidden max-w-[28rem] truncate text-xs font-medium uppercase tracking-[0.18em] text-slate-400 sm:block">{siteDescription || "SIM lifecycle manager"}</p>
            <h1 className="truncate text-lg font-semibold sm:mt-1">{pageTitle}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div ref={panelRef} className="relative">
            <button
              type="button"
              onClick={() => {
                const nextOpen = !panelOpen;
                setPanelOpen(nextOpen);
                setPanelError("");
                if (nextOpen) void refreshItems();
              }}
              className={`relative inline-flex h-10 w-10 items-center justify-center rounded-xl transition ${panelOpen ? "bg-slate-100 text-slate-950" : "text-slate-700 hover:bg-slate-100"}`}
              aria-label={bellLabel}
              title={bellLabel}
              aria-haspopup="dialog"
              aria-expanded={panelOpen}
              aria-controls="topbar-attention-panel"
              data-attention-count={summary.total}
            >
              <Bell className="h-4 w-4" />
              {summary.total > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold leading-4 text-white ring-2 ring-white">
                  {summary.total > 99 ? "99+" : summary.total}
                </span>
              ) : null}
            </button>

            {panelOpen ? (
              <div
                id="topbar-attention-panel"
                role="dialog"
                aria-label="待处理事项"
                className="absolute right-0 top-12 z-50 w-[min(94vw,27rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-950/10"
              >
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3.5">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">待处理事项</div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {summary.total > 0
                        ? `立即处理 ${summary.now} · 近期关注 ${summary.soon}${summary.setup ? ` · 待设置 ${summary.setup}` : ""}`
                        : "当前状态正常"}
                    </div>
                  </div>
                  {summary.total > 0 ? (
                    <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">{summary.total > 99 ? "99+" : summary.total}</span>
                  ) : null}
                </div>

                {summary.total > 0 ? (
                  <div className="max-h-[31rem] divide-y divide-slate-100 overflow-y-auto">
                    {preview.map((item) => {
                      const Icon = item.kind === "sim_validity" ? Smartphone : item.kind === "low_balance" ? CircleDollarSign : ShieldCheck;
                      const busy = actingKey === item.key;
                      return (
                        <div key={item.key} className="px-4 py-3.5">
                          <div className="flex gap-3">
                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium text-slate-900">{item.subjectLabel}</div>
                                  <div className="mt-0.5 truncate text-xs text-slate-500">{item.title}</div>
                                </div>
                                <span className={`shrink-0 text-xs font-medium ${relativeClass(item.priority)}`}>{item.relativeLabel}</span>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${priorityClass(item.priority)}`}>{item.priorityLabel}</span>
                                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{item.kindLabel}</span>
                                <span className="truncate text-[10px] text-slate-400">{item.kind === "low_balance" ? "持续状态" : item.dueDate || "未设置日期"}</span>
                              </div>
                              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                <Link
                                  href={item.href}
                                  onClick={() => {
                                    setPanelOpen(false);
                                    const anchor = item.href.split("#")[1];
                                    if (anchor) window.dispatchEvent(new CustomEvent(REMINDER_TASK_FOCUS_EVENT, { detail: anchor }));
                                  }}
                                  className="inline-flex h-7 items-center gap-1 rounded-lg bg-slate-950 px-2.5 text-[10px] font-medium text-white transition hover:bg-slate-800"
                                >
                                  {item.actionLabel}<ChevronRight className="h-3 w-3" />
                                </Link>
                                {item.canSnooze && item.reminderKey ? (
                                  <button
                                    type="button"
                                    onClick={() => void quickAction(item, "snoozed")}
                                    disabled={busy || Boolean(actingKey)}
                                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                                  >
                                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <TimerReset className="h-3 w-3" />}3 天后提醒
                                  </button>
                                ) : null}
                                {item.canIgnore && item.reminderKey ? (
                                  <button
                                    type="button"
                                    onClick={() => void quickAction(item, "ignored")}
                                    disabled={busy || Boolean(actingKey)}
                                    className="inline-flex h-7 items-center gap-1 px-1 text-[10px] font-medium text-slate-400 transition hover:text-slate-700 disabled:opacity-50"
                                  >
                                    <XCircle className="h-3 w-3" />忽略本轮
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-6 py-9 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-slate-900">当前没有需要处理的事项</p>
                    <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-slate-400">号码生命周期、余额等需要处理或近期关注的状态会自动出现在这里。</p>
                  </div>
                )}

                {panelError ? (
                  <div className="border-t border-rose-100 bg-rose-50 px-4 py-2.5 text-xs leading-5 text-rose-700">{panelError}</div>
                ) : null}

                <div className="border-t border-slate-100 bg-slate-50/70 p-2">
                  <Link
                    href="/reminders"
                    onClick={() => setPanelOpen(false)}
                    className="flex h-9 items-center justify-center gap-1.5 rounded-xl text-xs font-medium text-slate-600 transition hover:bg-white hover:text-slate-950"
                  >
                    {summary.total > preview.length ? `查看全部 ${summary.total} 项待处理` : "打开处理中心"}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ) : null}
          </div>

          <div className="hidden text-right sm:block">
            <div className="text-sm font-medium">{username}</div>
            <div className="text-xs text-slate-400">Administrator</div>
          </div>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 transition hover:bg-slate-50 sm:px-4">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">退出</span>
            </button>
          </form>
        </div>
      </header>

      {mobileNavigationOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="主导航">
          <button type="button" className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]" onClick={() => setMobileNavigationOpen(false)} aria-label="关闭导航" />
          <aside id="mobile-navigation" className="relative flex h-full w-[min(84vw,20rem)] flex-col bg-white shadow-2xl">
            <div className="flex h-20 items-center justify-between border-b px-5">
              <div className="flex min-w-0 items-center gap-3">
                <SiteMark logoUrl={logoUrl} />
                <div className="min-w-0">
                  <div className="truncate font-semibold tracking-tight">{siteName}</div>
                  <div className="text-xs text-slate-400">v{APP_VERSION}</div>
                </div>
              </div>
              <button type="button" onClick={() => setMobileNavigationOpen(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100" aria-label="关闭导航"><X className="h-5 w-5" /></button>
            </div>

            <nav className="flex-1 overflow-y-auto p-4">
              <div className="space-y-1">
                {PRIMARY_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = navigationItemIsActive(pathname, item.href);
                  return (
                    <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${active ? "bg-slate-100 font-medium text-slate-950" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
                      <Icon className="h-4 w-4" />
                      {item.label}
                      {item.href === "/reminders" && summary.total > 0 ? (
                        <span className="ml-auto rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">{summary.total}</span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </nav>

            <div className="border-t p-4">
              <Link
                href={SETTINGS_NAV_ITEM.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${navigationItemIsActive(pathname, SETTINGS_NAV_ITEM.href) ? "bg-slate-100 font-medium text-slate-950" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}
              >
                <SettingsIcon className="h-4 w-4" />
                {SETTINGS_NAV_ITEM.label}
              </Link>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
