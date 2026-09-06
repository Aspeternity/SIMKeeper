"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cable, DatabaseBackup } from "lucide-react";

const items = [
  { href: "/settings", label: "备份与维护", icon: DatabaseBackup },
  { href: "/settings/carrier-connectors", label: "运营商连接", icon: Cable },
];

export function SettingsSectionNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2">
      {items.map((item) => {
        const active = item.href === "/settings"
          ? pathname === "/settings"
          : pathname.startsWith(item.href);
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
