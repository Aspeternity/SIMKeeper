"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Smartphone } from "lucide-react";
import { APP_VERSION, navigationItemIsActive, PRIMARY_NAV_ITEMS, SETTINGS_NAV_ITEM } from "@/components/layout/navigation";

export function Sidebar() {
  const pathname = usePathname();
  const SettingsIcon = SETTINGS_NAV_ITEM.icon;

  return (
    <aside className="hidden w-64 shrink-0 border-r bg-white lg:flex lg:flex-col">
      <div className="flex h-20 items-center gap-3 border-b px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white">
          <Smartphone className="h-5 w-5" />
        </div>
        <div>
          <div className="font-semibold tracking-tight">SIMKeeper</div>
          <div className="text-xs text-slate-400">v{APP_VERSION}</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {PRIMARY_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = navigationItemIsActive(pathname, item.href);
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
        <Link
          href={SETTINGS_NAV_ITEM.href}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
            navigationItemIsActive(pathname, SETTINGS_NAV_ITEM.href) ? "bg-slate-100 font-medium text-slate-950" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <SettingsIcon className="h-4 w-4" />
          {SETTINGS_NAV_ITEM.label}
        </Link>
      </div>
    </aside>
  );
}
