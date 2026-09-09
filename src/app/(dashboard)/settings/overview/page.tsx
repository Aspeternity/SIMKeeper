import { Settings2 } from "lucide-react";
import { APP_VERSION } from "@/components/layout/navigation";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { SiteSettingsForm } from "@/components/settings/site-settings-form";
import { Card } from "@/components/ui/card";
import { getSiteSettings } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

export default function SettingsOverviewPage() {
  const settings = getSiteSettings();

  return (
    <div className="space-y-6" data-settings-overview-polish="alpha.51.4">
      <SettingsPageHeader
        icon={Settings2}
        eyebrow="General"
        title="基础设置"
        description="管理当前 SIMKeeper 实例的名称、说明、Logo 与品牌强调色。这里的外观设置会同步到侧栏、移动端导航和登录界面。"
      />

      <SiteSettingsForm initial={settings} />

      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">系统信息</div>
          <div className="mt-1 text-xs text-ink-secondary">当前运行 SIMKeeper v{APP_VERSION}</div>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-medium text-ink-muted">
          <span className="rounded-lg border border-line bg-surface-subtle px-2.5 py-1.5">SQLite 持久化</span>
          <span className="rounded-lg border border-line bg-surface-subtle px-2.5 py-1.5">完整备份覆盖</span>
        </div>
      </Card>
    </div>
  );
}
