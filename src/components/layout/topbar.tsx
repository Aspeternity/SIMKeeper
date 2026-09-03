"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, LogOut, Menu, Smartphone, X } from "lucide-react";
import {
  APP_VERSION,
  getPageTitle,
  navigationItemIsActive,
  PRIMARY_NAV_ITEMS,
  SETTINGS_NAV_ITEM,
} from "@/components/layout/navigation";

export function Topbar({ username, reminderCount }: { username: string; reminderCount: number }) {
  const pathname = usePathname();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const pageTitle = getPageTitle(pathname);
  const reminderLabel = reminderCount > 0 ? `${reminderCount} 项待处理提醒` : "当前没有待处理提醒";
  const SettingsIcon = SETTINGS_NAV_ITEM.icon;

  useEffect(() => {
    setMobileNavigationOpen(false);
  }, [pathname]);

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

  return (
    <>
      <header data-page-title={pageTitle} className="sticky top-0 z-30 flex h-20 items-center justify-between border-b bg-white/95 px-4 backdrop-blur sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileNavigationOpen(true)}
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
          <Link
            href="/reminders"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-100"
            aria-label={reminderLabel}
            title={reminderLabel}
            data-reminder-count={reminderCount}
          >
            <Bell className="h-4 w-4" />
            {reminderCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold leading-4 text-white ring-2 ring-white">
                {reminderCount > 99 ? "99+" : reminderCount}
              </span>
            ) : null}
          </Link>
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
