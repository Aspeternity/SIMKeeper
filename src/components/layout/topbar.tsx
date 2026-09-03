"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  LogOut,
  Menu,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react";
import {
  APP_VERSION,
  getPageTitle,
  navigationItemIsActive,
  PRIMARY_NAV_ITEMS,
  SETTINGS_NAV_ITEM,
} from "@/components/layout/navigation";
import {
  getReminderKindLabel,
  getReminderRelativeLabel,
  getReminderStatusLabel,
  getReminderTaskAnchor,
  getReminderTaskHref,
  REMINDER_STATE_CHANGED_EVENT,
  REMINDER_TASK_FOCUS_EVENT,
  type ReminderItem,
  type ReminderStatus,
} from "@/lib/reminders";

function reminderStatusClass(status: ReminderStatus) {
  if (status === "overdue") return "bg-rose-50 text-rose-700 ring-rose-100";
  if (status === "grace") return "bg-orange-50 text-orange-700 ring-orange-100";
  if (status === "today") return "bg-amber-50 text-amber-700 ring-amber-100";
  if (status === "upcoming") return "bg-sky-50 text-sky-700 ring-sky-100";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function reminderRelativeClass(status: ReminderStatus) {
  if (status === "overdue") return "text-rose-700";
  if (status === "grace") return "text-orange-700";
  if (status === "today") return "text-amber-700";
  if (status === "upcoming") return "text-sky-700";
  return "text-slate-500";
}

export function Topbar({ username, reminders }: { username: string; reminders: ReminderItem[] }) {
  const pathname = usePathname();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [reminderPanelOpen, setReminderPanelOpen] = useState(false);
  const [reminderItems, setReminderItems] = useState(reminders);
  const reminderPanelRef = useRef<HTMLDivElement>(null);
  const pageTitle = getPageTitle(pathname);
  const reminderCount = reminderItems.length;
  const reminderLabel = reminderCount > 0 ? `${reminderCount} 项待处理提醒` : "当前没有需要处理的提醒";
  const urgentReminderCount = reminderItems.filter((item) => ["overdue", "grace", "today"].includes(item.status)).length;
  const reminderPreview = reminderItems.slice(0, 5);
  const SettingsIcon = SETTINGS_NAV_ITEM.icon;

  const refreshReminderItems = useCallback(async () => {
    try {
      const response = await fetch(`/api/reminders?_=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data.reminders)) setReminderItems(data.reminders);
    } catch {
      // Keep the last known reminder state when a transient refresh fails.
    }
  }, []);

  useEffect(() => {
    let retryTimer: number | null = null;

    const handleReminderStateChanged = () => {
      void refreshReminderItems();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => void refreshReminderItems(), 350);
    };
    const handleWindowFocus = () => void refreshReminderItems();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshReminderItems();
    };
    const interval = window.setInterval(() => void refreshReminderItems(), 15000);

    window.addEventListener(REMINDER_STATE_CHANGED_EVENT, handleReminderStateChanged);
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      window.clearInterval(interval);
      window.removeEventListener(REMINDER_STATE_CHANGED_EVENT, handleReminderStateChanged);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshReminderItems]);

  useEffect(() => {
    setMobileNavigationOpen(false);
    setReminderPanelOpen(false);
    void refreshReminderItems();
  }, [pathname, refreshReminderItems]);

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
    if (!reminderPanelOpen) return;
    const closePanel = (event: PointerEvent) => {
      if (reminderPanelRef.current && !reminderPanelRef.current.contains(event.target as Node)) {
        setReminderPanelOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReminderPanelOpen(false);
    };
    document.addEventListener("pointerdown", closePanel);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closePanel);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [reminderPanelOpen]);

  return (
    <>
      <header data-page-title={pageTitle} className="sticky top-0 z-30 flex h-20 items-center justify-between border-b bg-white/95 px-4 backdrop-blur sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setReminderPanelOpen(false);
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
            <p className="hidden text-xs font-medium uppercase tracking-[0.18em] text-slate-400 sm:block">SIM lifecycle manager</p>
            <h1 className="truncate text-lg font-semibold sm:mt-1">{pageTitle}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div ref={reminderPanelRef} className="relative">
            <button
              type="button"
              onClick={() => {
                const nextOpen = !reminderPanelOpen;
                setReminderPanelOpen(nextOpen);
                if (nextOpen) void refreshReminderItems();
              }}
              className={`relative inline-flex h-10 w-10 items-center justify-center rounded-xl transition ${reminderPanelOpen ? "bg-slate-100 text-slate-950" : "text-slate-700 hover:bg-slate-100"}`}
              aria-label={reminderLabel}
              title={reminderLabel}
              aria-haspopup="dialog"
              aria-expanded={reminderPanelOpen}
              aria-controls="topbar-reminder-panel"
              data-reminder-count={reminderCount}
            >
              <Bell className="h-4 w-4" />
              {reminderCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold leading-4 text-white ring-2 ring-white">
                  {reminderCount > 99 ? "99+" : reminderCount}
                </span>
              ) : null}
            </button>

            {reminderPanelOpen ? (
              <div
                id="topbar-reminder-panel"
                role="dialog"
                aria-label="提醒概览"
                className="absolute right-0 top-12 z-50 w-[min(92vw,24rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-950/10"
              >
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3.5">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">提醒</div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {reminderCount > 0
                        ? urgentReminderCount > 0
                          ? `${reminderCount} 项待处理 · ${urgentReminderCount} 项需要优先处理`
                          : `${reminderCount} 项待处理提醒`
                        : "当前状态正常"}
                    </div>
                  </div>
                  {reminderCount > 0 ? (
                    <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">{reminderCount > 99 ? "99+" : reminderCount}</span>
                  ) : null}
                </div>

                {reminderCount > 0 ? (
                  <div className="max-h-[26rem] divide-y divide-slate-100 overflow-y-auto">
                    {reminderPreview.map((item) => {
                      const Icon = item.kind === "sim_validity" ? Smartphone : ShieldCheck;
                      return (
                        <Link
                          key={`${item.key}-${item.dueDate ?? "none"}`}
                          href={getReminderTaskHref(item)}
                          onClick={() => {
                            setReminderPanelOpen(false);
                            window.dispatchEvent(new CustomEvent(REMINDER_TASK_FOCUS_EVENT, { detail: getReminderTaskAnchor(item) }));
                          }}
                          className="group flex gap-3 px-4 py-3.5 transition hover:bg-slate-50"
                        >
                          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition group-hover:bg-white">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-slate-900">{item.simLabel}</div>
                                <div className="mt-0.5 truncate text-xs text-slate-500">{item.title}</div>
                              </div>
                              <span className={`shrink-0 text-xs font-medium ${reminderRelativeClass(item.status)}`}>{getReminderRelativeLabel(item)}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${reminderStatusClass(item.status)}`}>
                                {getReminderStatusLabel(item.status)}
                              </span>
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{getReminderKindLabel(item.kind)}</span>
                              <span className="truncate text-[10px] text-slate-400">{item.dueDate || "未设置日期"}</span>
                            </div>
                          </div>
                          <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-6 py-8 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-slate-900">当前没有需要处理的提醒</p>
                    <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-slate-400">号码有效期或保号规则进入提醒窗口后，会自动显示在这里。</p>
                  </div>
                )}

                <div className="border-t border-slate-100 bg-slate-50/70 p-2">
                  <Link
                    href="/reminders"
                    onClick={() => setReminderPanelOpen(false)}
                    className="flex h-9 items-center justify-center gap-1.5 rounded-xl text-xs font-medium text-slate-600 transition hover:bg-white hover:text-slate-950"
                  >
                    {reminderCount > reminderPreview.length ? `查看全部 ${reminderCount} 项待处理` : "打开处理中心"}
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
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold tracking-tight">SIMKeeper</div>
                  <div className="text-xs text-slate-400">v{APP_VERSION}</div>
                </div>
              </div>
              <button type="button" onClick={() => setMobileNavigationOpen(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100" aria-label="关闭导航">
                <X className="h-5 w-5" />
              </button>
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
                      {item.href === "/reminders" && reminderCount > 0 ? (
                        <span className="ml-auto rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">{reminderCount}</span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </nav>

            <div className="border-t p-4">
              <Link href={SETTINGS_NAV_ITEM.href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${navigationItemIsActive(pathname, SETTINGS_NAV_ITEM.href) ? "bg-slate-100 font-medium text-slate-950" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
                <SettingsIcon className="h-4 w-4" />
                {SETTINGS_NAV_ITEM.label}
              </Link>
              <div className="mt-3 px-3 text-xs text-slate-400">当前管理员 · {username}</div>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
