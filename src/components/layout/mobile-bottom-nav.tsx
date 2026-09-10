"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, LayoutDashboard, Settings, Smartphone, type LucideIcon } from "lucide-react";
import { navigationItemIsActive } from "@/components/layout/navigation";

type MobileNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  attention?: boolean;
};

const MOBILE_NAV_ITEMS: MobileNavItem[] = [
  { label: "概览", href: "/", icon: LayoutDashboard },
  { label: "号码", href: "/sims", icon: Smartphone },
  { label: "处理", href: "/reminders", icon: BellRing, attention: true },
  { label: "设置", href: "/settings/overview", icon: Settings },
];

export function MobileBottomNav({
  attentionCount,
  onNavigate,
}: {
  attentionCount: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="移动端主导航"
      data-mobile-bottom-nav="alpha.52.0"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-floating lg:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = navigationItemIsActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              data-mobile-nav-item={item.href}
              data-mobile-nav-active={active ? "true" : "false"}
              aria-current={active ? "page" : undefined}
              className={`group flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium transition ${active ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface-hover hover:text-ink"}`}
            >
              <span className="relative flex h-6 items-center justify-center">
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.3 : 2} />
                {item.attention && attentionCount > 0 ? (
                  <span className="absolute -right-3 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-semibold leading-4 text-white ring-2 ring-white">
                    {attentionCount > 99 ? "99+" : attentionCount}
                  </span>
                ) : null}
              </span>
              <span className="leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
