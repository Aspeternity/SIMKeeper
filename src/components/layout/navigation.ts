import {
  BellRing,
  Box,
  LayoutDashboard,
  RadioTower,
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

export const APP_VERSION = "0.1.0-alpha.55.1";

export const PRIMARY_NAV_ITEMS: NavigationItem[] = [
  { label: "概览", href: "/", icon: LayoutDashboard },
  { label: "号码管理", href: "/sims", icon: Smartphone },
  { label: "设备管理", href: "/devices", icon: Box },
  { label: "运营商", href: "/carriers", icon: RadioTower },
  { label: "绑定服务", href: "/services", icon: Waypoints },
  { label: "保号规则", href: "/history", icon: ShieldCheck },
  { label: "处理中心", href: "/reminders", icon: BellRing },
];

export const SETTINGS_NAV_ITEM: NavigationItem = {
  label: "设置",
  href: "/settings/overview",
  icon: Settings,
};

export function navigationItemIsActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === SETTINGS_NAV_ITEM.href) {
    return pathname.startsWith("/settings") || pathname.startsWith("/notifications") || pathname.startsWith("/security");
  }
  return pathname.startsWith(href);
}

export function getPageTitle(pathname: string) {
  if (pathname === "/settings") return "设置";
  if (pathname.startsWith("/settings/backup")) return "备份与恢复";
  if (pathname.startsWith("/settings/system")) return "系统与数据库";
  if (pathname.startsWith("/settings/overview")) return "设置";
  if (pathname.startsWith("/settings/dashboard")) return "概览个性化";
  if (pathname.startsWith("/settings/carrier-connectors")) return "同步与诊断";
  if (pathname.startsWith("/settings/notifications") || pathname.startsWith("/notifications")) return "通知渠道";
  if (pathname.startsWith("/settings/security") || pathname.startsWith("/security")) return "账号安全";
  const item = [...PRIMARY_NAV_ITEMS, SETTINGS_NAV_ITEM].find((candidate) => navigationItemIsActive(pathname, candidate.href));
  return item?.label ?? "SIMKeeper";
}
