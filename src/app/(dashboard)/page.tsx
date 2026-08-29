import { AlertTriangle, CheckCircle2, Clock3, Plus, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/card";

const stats = [
  { label: "号码总数", value: "0", icon: Smartphone },
  { label: "正常", value: "0", icon: CheckCircle2 },
  { label: "30 天内需处理", value: "0", icon: Clock3 },
  { label: "已逾期", value: "0", icon: AlertTriangle },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">你的号码生命周期，一处管理</h2>
          <p className="mt-1 text-sm text-slate-500">alpha.1 已完成初始化、登录、SQLite 和 Dashboard 基础框架。</p>
        </div>
        <button disabled className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-xl bg-slate-200 px-4 text-sm font-medium text-slate-500">
          <Plus className="h-4 w-4" />
          添加号码 · alpha.2
        </button>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">{stat.label}</span>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4 text-3xl font-semibold tracking-tight">{stat.value}</div>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <Card className="min-h-80 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">需要处理</h3>
              <p className="mt-1 text-sm text-slate-500">未来这里会显示即将到期、需要充值或产生有效活动的号码。</p>
            </div>
          </div>
          <div className="flex min-h-56 flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm font-medium">当前没有待处理事项</p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">下一阶段加入号码管理与保号规则后，这里会成为 SIMKeeper 的主要待办中心。</p>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold">Alpha 进度</h3>
          <div className="mt-5 space-y-4 text-sm">
            {[
              ["SQLite 持久化", true],
              ["首次管理员创建", true],
              ["登录 / Session", true],
              ["Dashboard Shell", true],
              ["运营商管理", false],
              ["号码管理", false],
            ].map(([label, done]) => (
              <div key={String(label)} className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${done ? "bg-emerald-500" : "bg-slate-200"}`} />
                <span className={done ? "text-slate-700" : "text-slate-400"}>{String(label)}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
