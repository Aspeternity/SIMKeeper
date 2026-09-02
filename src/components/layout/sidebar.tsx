"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, History, LayoutDashboard, RadioTower, Settings, Smartphone, Waypoints } from "lucide-react";

const nav = [
  { label: "概览", href: "/", icon: LayoutDashboard },
  { label: "号码管理", href: "/sims", icon: Smartphone },
  { label: "运营商", href: "/carriers", icon: RadioTower },
  { label: "绑定服务", href: "/services", icon: Waypoints, disabled: true },
  { label: "保号管理", href: "/history", icon: History },
  { label: "提醒中心", href: "/reminders", icon: BellRing },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r bg-white lg:flex lg:flex-col">
      <div className="flex h-20 items-center gap-3 border-b px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white">
          <Smartphone className="h-5 w-5" />
        </div>
        <div>
          <div className="font-semibold tracking-tight">SIMKeeper</div>
          <div className="text-xs text-slate-400">v0.1.0-alpha.5</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {nav.map((item) => {
          const Icon = item.icon;
          if (item.disabled) {
            return (
              <div key={item.label} className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400">
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
                <span className="ml-auto text-[10px] uppercase tracking-wider">Soon</span>
              </div>
            );
          }

          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                active ? "bg-slate-100 font-medium text-slate-950" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-4">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500">
          <Settings className="h-4 w-4" />
          设置
          <span className="ml-auto text-[10px] uppercase tracking-wider">Soon</span>
        </div>
      </div>
    </aside>
  );
}
