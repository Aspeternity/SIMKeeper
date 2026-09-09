import { Settings2 } from "lucide-react";
import { APP_VERSION } from "@/components/layout/navigation";
import { SiteSettingsForm } from "@/components/settings/site-settings-form";
import { Card } from "@/components/ui/card";
import { getSiteSettings } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

export default function SettingsOverviewPage() {
  const settings = getSiteSettings();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <Settings2 className="h-4 w-4" />系统设置
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">基础设置</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
          设置当前实例的网站名称、说明和站点图标。这里不再重复展示其他设置模块，顶部设置导航已经负责模块切换。
        </p>
      </div>

      <SiteSettingsForm initial={settings} />

      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium text-slate-900">系统信息</div>
          <div className="mt-1 text-xs text-slate-500">当前运行 SIMKeeper v{APP_VERSION}</div>
        </div>
        <div className="text-xs text-slate-400">基础品牌配置保存在 SQLite settings 表中，并包含在现有完整备份中。</div>
      </Card>
    </div>
  );
}
