"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SiteMark } from "@/components/branding/site-mark";
import { APP_VERSION, navigationItemIsActive, PRIMARY_NAV_ITEMS, SETTINGS_NAV_ITEM } from "@/components/layout/navigation";

export function Sidebar({ siteName, logoUrl }: { siteName: string; logoUrl: string | null }) {
  const pathname = usePathname();
  const SettingsIcon = SETTINGS_NAV_ITEM.icon;
  const settingsActive = navigationItemIsActive(pathname, SETTINGS_NAV_ITEM.href);

  return (
    <aside className="hidden h-screen w-[15.5rem] shrink-0 border-r border-line bg-surface lg:sticky lg:top-0 lg:flex lg:self-start lg:flex-col">
      <div className="flex h-[68px] shrink-0 items-center gap-3 border-b border-line px-5">
        <SiteMark logoUrl={logoUrl} className="h-9 w-9" iconClassName="h-[18px] w-[18px]" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold tracking-[-0.01em] text-ink">{siteName}</div>
          <div className="mt-0.5 text-[10px] font-medium tracking-wide text-ink-muted">v{APP_VERSION}</div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {PRIMARY_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = navigationItemIsActive(pathname, item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-150 ${
                active
                  ? "bg-brand-soft font-medium text-brand"
                  : "text-ink-secondary hover:bg-surface-hover hover:text-ink"
              }`}
            >
              {active ? <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand" /> : null}
              <Icon className={`h-4 w-4 shrink-0 ${active ? "text-brand" : "text-ink-muted"}`} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-line bg-surface p-3">
        <Link
          href={SETTINGS_NAV_ITEM.href}
          className={`relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-150 ${
            settingsActive
              ? "bg-brand-soft font-medium text-brand"
              : "text-ink-secondary hover:bg-surface-hover hover:text-ink"
          }`}
        >
          {settingsActive ? <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand" /> : null}
          <SettingsIcon className={`h-4 w-4 ${settingsActive ? "text-brand" : "text-ink-muted"}`} />
          <span>{SETTINGS_NAV_ITEM.label}</span>
        </Link>
      </div>
    </aside>
  );
}
