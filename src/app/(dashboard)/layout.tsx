import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { buildAttentionItems, sortAttentionItems } from "@/lib/attention-items";
import { getCurrentUser, hasAdmin } from "@/lib/auth";
import { getUnifiedReminderItems } from "@/lib/current-reminders";
import { getRemoteBackupAttentionItems } from "@/lib/remote-backups";
import { getSiteSettings } from "@/lib/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!hasAdmin()) {
    redirect("/setup");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const siteSettings = getSiteSettings();
  const attentionItems = sortAttentionItems([
    ...buildAttentionItems(getUnifiedReminderItems()),
    ...getRemoteBackupAttentionItems(),
  ]);

  return (
    <div
      className="flex min-h-screen bg-[var(--background)]"
      data-reminder-count={attentionItems.length}
      data-visual-foundation="alpha.51"
      data-mobile-shell="alpha.52.0"
    >
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
        <main
          data-mobile-shell-main="alpha.52.0"
          className="p-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(6.75rem+env(safe-area-inset-bottom))] lg:p-7 lg:pb-7"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
