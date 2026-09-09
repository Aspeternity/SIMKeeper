"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ChevronRight,
  Database,
  DatabaseBackup,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  Send,
} from "lucide-react";
import { APP_VERSION } from "@/components/layout/navigation";

const items = [
  { href: "/settings/overview", label: "基础设置", description: "站点名称、Logo 与品牌强调色", icon: Settings2 },
  { href: "/settings/dashboard", label: "概览个性化", description: "模块顺序、统计范围与重点号码", icon: LayoutDashboard },
  { href: "/settings/security", label: "账号安全", description: "管理员账户、密码与双重验证", icon: ShieldCheck },
  { href: "/settings/carrier-connectors", label: "同步与诊断", description: "运营商连接、自动同步与健康状态", icon: Activity },
  { href: "/settings/notifications", label: "通知渠道", description: "发送计划、模板与外部推送", icon: Send },
  { href: "/settings/backup", label: "备份与恢复", description: "本地、异地备份与灾难恢复", icon: DatabaseBackup },
  { href: "/settings/system", label: "系统与数据库", description: "SQLite、Migration 与完整性检查", icon: Database },
];

export function SettingsSectionNav() {
  const pathname = usePathname();

  return (
    <>
      <nav
        data-settings-navigation="alpha.51.4"
        className="mb-5 flex gap-2 overflow-x-auto rounded-2xl border border-line bg-surface p-2 shadow-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:hidden"
        aria-label="设置导航"
      >
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition ${
                active
                  ? "border-brand bg-brand-soft text-brand shadow-sm"
                  : "border-transparent text-ink-secondary hover:border-line hover:bg-surface-hover hover:text-ink"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <aside className="hidden xl:block" data-settings-sidebar="alpha.51.4">
        <div className="sticky top-24 space-y-3">
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <Settings2 className="h-4.5 w-4.5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-ink">设置中心</div>
                <div className="mt-0.5 text-[11px] text-ink-muted">SIMKeeper v{APP_VERSION}</div>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-ink-secondary">站点外观、自动化、安全、备份与系统状态集中管理。</p>
          </div>

          <nav className="rounded-2xl border border-line bg-surface p-2 shadow-card" aria-label="设置导航">
            {items.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`group flex items-start gap-3 rounded-xl border px-3 py-3 transition ${
                    active
                      ? "border-brand bg-brand-soft text-brand shadow-sm"
                      : "border-transparent text-ink-secondary hover:border-line hover:bg-surface-hover hover:text-ink"
                  }`}
                >
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-surface text-brand" : "bg-surface-subtle text-ink-muted group-hover:text-ink-secondary"}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold">{item.label}</div>
                    <div className="mt-1 text-[11px] leading-4 text-ink-muted">{item.description}</div>
                  </div>
                  <ChevronRight className={`mt-2 h-3.5 w-3.5 shrink-0 transition ${active ? "text-brand" : "text-ink-muted group-hover:translate-x-0.5"}`} />
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
}
