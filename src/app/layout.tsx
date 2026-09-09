import type { Metadata } from "next";
import { getSiteSettings } from "@/lib/site-settings";
import "./globals.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function generateMetadata(): Metadata {
  const settings = getSiteSettings();
  return {
    title: settings.siteName,
    description: settings.siteDescription || undefined,
    icons: settings.logoUrl
      ? {
          icon: settings.logoUrl,
          shortcut: settings.logoUrl,
          apple: settings.logoUrl,
        }
      : undefined,
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
