import {
  BellRing,
  LayoutDashboard,
  RadioTower,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

export type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const APP_VERSION = "0.1.0-alpha.15";

export const PRIMARY_NAV_ITEMS: NavigationItem[] = [
  { label: "概览", href: "/", icon: LayoutDashboard },
  { label: "号码管理", href: "/sims", icon: Smartphone },
  { label: "运营商", href: "/carriers", icon: RadioTower },
  { label: "绑定服务", href: "/services", icon: Waypoints },
  { label: "保号规则", href: "/history", icon: ShieldCheck },
  { label: "处理中心", href: "/reminders", icon: BellRing },
  { label: "通知渠道", href: "/notifications", icon: Send },
];

export const SETTINGS_NAV_ITEM: NavigationItem = {
  label: "设置与备份",
  href: "/settings",
  icon: Settings,
};

export function navigationItemIsActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function getPageTitle(pathname: string) {
  const item = [...PRIMARY_NAV_ITEMS, SETTINGS_NAV_ITEM].find((candidate) => navigationItemIsActive(pathname, candidate.href));
  return item?.label ?? "SIMKeeper";
}
