import Link from "next/link";
import { LogIn, ShieldCheck } from "lucide-react";
import { SiteMark } from "@/components/branding/site-mark";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { buildAttentionItems } from "@/lib/attention-items";
import { getCurrentUser, hasAdmin } from "@/lib/auth";
import { getUnifiedReminderItems } from "@/lib/current-reminders";
import { getSiteSettings } from "@/lib/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function AuthGate({
  mode,
  siteName,
  siteDescription,
  logoUrl,
}: {
  mode: "setup" | "login";
  siteName: string;
  siteDescription: string;
  logoUrl: string | null;
}) {
  const needsSetup = mode === "setup";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <Card className="w-full max-w-md p-7 text-center">
        <div className="mx-auto mb-4 flex justify-center">
          <SiteMark logoUrl={logoUrl} className="h-14 w-14" iconClassName="h-7 w-7" />
        </div>
        <div className="mb-1 text-sm font-medium text-slate-500">{siteName}</div>
        <h1 className="text-xl font-semibold">{needsSetup ? "需要完成首次初始化" : "需要登录"}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {needsSetup
            ? "当前实例尚未创建管理员账户。完成初始化后即可进入管理后台。"
            : "当前浏览器没有有效的登录会话。"}
        </p>
        {siteDescription ? <p className="mt-2 text-xs leading-5 text-slate-400">{siteDescription}</p> : null}
        <Link
          href={needsSetup ? "/setup" : "/login"}
          className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          {needsSetup ? <ShieldCheck className="mr-2 h-4 w-4" /> : <LogIn className="mr-2 h-4 w-4" />}
          {needsSetup ? "创建管理员" : "前往登录"}
        </Link>
      </Card>
    </main>
  );
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const siteSettings = getSiteSettings();

  if (!hasAdmin()) {
    return (
      <AuthGate
        mode="setup"
        siteName={siteSettings.siteName}
        siteDescription={siteSettings.siteDescription}
        logoUrl={siteSettings.logoUrl}
      />
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return (
      <AuthGate
        mode="login"
        siteName={siteSettings.siteName}
        siteDescription={siteSettings.siteDescription}
        logoUrl={siteSettings.logoUrl}
      />
    );
  }

  const attentionItems = buildAttentionItems(getUnifiedReminderItems());

  return (
    <div className="flex min-h-screen bg-slate-50" data-reminder-count={attentionItems.length}>
      <span className="sr-only">你的号码生命周期，一处管理</span>
      <Sidebar siteName={siteSettings.siteName} logoUrl={siteSettings.logoUrl} />
      <div className="min-w-0 flex-1">
        <Topbar
          username={user.username}
          items={attentionItems}
          siteName={siteSettings.siteName}
          siteDescription={siteSettings.siteDescription}
          logoUrl={siteSettings.logoUrl}
        />
        <main className="p-5 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
