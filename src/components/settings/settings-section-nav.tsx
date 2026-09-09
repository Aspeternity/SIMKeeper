"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Database,
  DatabaseBackup,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  Send,
} from "lucide-react";

const items = [
  { href: "/settings/overview", label: "基础设置", icon: Settings2 },
  { href: "/settings/dashboard", label: "概览个性化", icon: LayoutDashboard },
  { href: "/settings/security", label: "账号安全", icon: ShieldCheck },
  { href: "/settings/carrier-connectors", label: "同步与诊断", icon: Activity },
  { href: "/settings/notifications", label: "通知渠道", icon: Send },
  { href: "/settings/backup", label: "备份与恢复", icon: DatabaseBackup },
  { href: "/settings/system", label: "系统与数据库", icon: Database },
];

export function SettingsSectionNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2" aria-label="设置导航">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-medium transition ${
              active
                ? "bg-slate-950 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
