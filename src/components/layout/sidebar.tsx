"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SiteMark } from "@/components/branding/site-mark";
import { APP_VERSION, navigationItemIsActive, PRIMARY_NAV_ITEMS, SETTINGS_NAV_ITEM } from "@/components/layout/navigation";

export function Sidebar({ siteName, logoUrl }: { siteName: string; logoUrl: string | null }) {
  const pathname = usePathname();
  const SettingsIcon = SETTINGS_NAV_ITEM.icon;

  return (
    <aside className="hidden h-screen w-64 shrink-0 border-r bg-white lg:sticky lg:top-0 lg:flex lg:self-start lg:flex-col">
      <div className="flex h-20 shrink-0 items-center gap-3 border-b px-6">
        <SiteMark logoUrl={logoUrl} />
        <div className="min-w-0">
          <div className="truncate font-semibold tracking-tight">{siteName}</div>
          <div className="text-xs text-slate-400">v{APP_VERSION}</div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
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

      <div className="shrink-0 border-t bg-white p-4">
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
