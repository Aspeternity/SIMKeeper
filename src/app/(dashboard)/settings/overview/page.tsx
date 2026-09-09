import Link from "next/link";
import {
  Activity,
  ArrowRight,
  DatabaseBackup,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  Send,
} from "lucide-react";
import { APP_VERSION } from "@/components/layout/navigation";
import { Card } from "@/components/ui/card";

const sections = [
  {
    href: "/settings/dashboard",
    title: "概览个性化",
    description: "调整概览统计周期、重点号码和模块显示方式。",
    icon: LayoutDashboard,
  },
  {
    href: "/settings/security",
    title: "账号安全",
    description: "管理管理员账号、密码和当前登录会话。",
    icon: ShieldCheck,
  },
  {
    href: "/settings/carrier-connectors",
    title: "同步与诊断",
    description: "查看 Provider 能力、自动同步健康、重试状态和同步历史。",
    icon: Activity,
  },
  {
    href: "/settings/notifications",
    title: "通知渠道",
    description: "配置 Telegram、Bark、Gotify、Webhook 等外部通知渠道。",
    icon: Send,
  },
  {
    href: "/settings",
    title: "备份与恢复",
    description: "创建本地备份、导出加密备份并执行安全恢复。",
    icon: DatabaseBackup,
  },
];

export default function SettingsOverviewPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <Settings2 className="h-4 w-4" />系统设置
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">设置</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
          账号、安全、同步、通知和备份等系统维护能力集中在这里，主导航只保留日常号码管理相关功能。
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href} className="group block">
              <Card className="h-full p-5 transition group-hover:-translate-y-0.5 group-hover:border-slate-300 group-hover:shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <Icon className="h-4 w-4" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-slate-900">{section.title}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">{section.description}</p>
              </Card>
            </Link>
          );
        })}
      </section>

      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium text-slate-900">系统信息</div>
          <div className="mt-1 text-xs text-slate-500">当前运行 SIMKeeper v{APP_VERSION}</div>
        </div>
        <div className="text-xs text-slate-400">更多系统级选项后续统一扩展到设置中心，不再增加左侧主导航入口。</div>
      </Card>
    </div>
  );
}
