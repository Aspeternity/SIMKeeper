import Link from "next/link";
import { eq } from "drizzle-orm";
import { AlertTriangle, BellRing, CheckCircle2, ChevronRight, Clock3, ShieldCheck, Smartphone, Waypoints } from "lucide-react";
import { Card } from "@/components/ui/card";
import { db } from "@/db";
import { carriers, simBoundServices, simCards, simKeepAliveRules } from "@/db/schema";
import { getUnifiedReminderItems } from "@/lib/current-reminders";
import { getReminderRelativeLabel, getReminderTaskHref, type ReminderStatus } from "@/lib/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ActionItem = {
  key: string;
  label: string;
  phoneNumber: string | null;
  carrierName: string;
  country: string;
  title: string;
  dueDate: string | null;
  relative: string;
  status: ReminderStatus;
  severity: "warning" | "overdue" | "condition";
  href: string;
};

function actionSeverity(status: ReminderStatus): ActionItem["severity"] {
  if (status === "overdue" || status === "grace") return "overdue";
  if (status === "condition") return "condition";
  return "warning";
}

function severityClass(severity: ActionItem["severity"]) {
  if (severity === "overdue") return "bg-rose-50 text-rose-700";
  if (severity === "condition") return "bg-sky-50 text-sky-700";
  return "bg-amber-50 text-amber-700";
}

function severityLabel(severity: ActionItem["severity"]) {
  if (severity === "overdue") return "已需处理";
  if (severity === "condition") return "条件触发";
  return "即将处理";
}

export default function DashboardPage() {
  const carrierCount = db.select({ id: carriers.id }).from(carriers).all().length;
  const boundServiceCount = db.select({ id: simBoundServices.id }).from(simBoundServices).all().length;
  const rows = db
    .select({
      id: simCards.id,
      label: simCards.label,
      status: simCards.status,
    })
    .from(simCards)
    .all();
  const keepAliveRules = db
    .select({ id: simKeepAliveRules.id, enabled: simKeepAliveRules.enabled })
    .from(simKeepAliveRules)
    .all();
  const reminders = getUnifiedReminderItems();
  const overdueSimIds = new Set<number>();

  for (const sim of rows) {
    if (sim.status === "expired") overdueSimIds.add(sim.id);
  }
  for (const reminder of reminders) {
    if (reminder.status === "overdue") overdueSimIds.add(reminder.simId);
  }

  const actions: ActionItem[] = reminders.map((reminder) => ({
    key: reminder.key,
    label: reminder.simLabel,
    phoneNumber: reminder.phoneNumber,
    carrierName: reminder.carrierName,
    country: reminder.country,
    title: reminder.title,
    dueDate: reminder.dueDate,
    relative: getReminderRelativeLabel(reminder),
    status: reminder.status,
    severity: actionSeverity(reminder.status),
    href: getReminderTaskHref(reminder),
  }));

  const activeCount = rows.filter((sim) => sim.status === "active" && !overdueSimIds.has(sim.id)).length;
  const actionable = actions.slice(0, 8);
  const enabledRuleCount = keepAliveRules.filter((rule) => rule.enabled).length;

  const stats = [
    { label: "号码总数", value: rows.length, icon: Smartphone },
    { label: "正常", value: activeCount, icon: CheckCircle2 },
    { label: "待处理事项", value: reminders.length, icon: Clock3 },
    { label: "已逾期 / 失效", value: overdueSimIds.size, icon: AlertTriangle },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">你的号码生命周期，一处管理</h2>
          <p className="mt-1 text-sm text-slate-500">号码、实名、资费、保号规则、处理任务、绑定服务与外部通知统一汇总成完整生命周期档案。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/services" className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium text-slate-700 transition hover:bg-white">
            <Waypoints className="h-4 w-4" />绑定服务
          </Link>
          <Link href="/reminders" className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium text-slate-700 transition hover:bg-white">
            <BellRing className="h-4 w-4" />处理中心
          </Link>
          <Link href="/history" className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium text-slate-700 transition hover:bg-white">
            <ShieldCheck className="h-4 w-4" />保号规则
          </Link>
          <Link href="/sims" className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800">
            <Smartphone className="h-4 w-4" />管理号码
          </Link>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">{stat.label}</span>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Icon className="h-4 w-4" /></div>
              </div>
              <div className="mt-4 text-3xl font-semibold tracking-tight">{stat.value}</div>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <Card className="min-h-80 overflow-hidden">
          <div className="flex items-start justify-between gap-4 border-b px-6 py-5">
            <div>
              <h3 className="font-semibold">需要处理</h3>
              <p className="mt-1 text-sm text-slate-500">与处理中心和右上角铃铛使用同一套统一事项，包含有效期、保号规则和低余额条件。</p>
            </div>
            <Link href="/reminders" className="shrink-0 text-xs font-medium text-slate-500 underline underline-offset-4">查看全部</Link>
          </div>
          {actionable.length ? (
            <div className="divide-y divide-slate-100">
              {actionable.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  data-dashboard-task-row={item.key}
                  aria-label={`处理 ${item.label} · ${item.title}`}
                  className="group flex flex-col gap-3 px-6 py-4 transition hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-200 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-800 transition group-hover:text-slate-950">{item.label}</span>
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${severityClass(item.severity)}`}>
                        {severityLabel(item.severity)}
                      </span>
                      <span className="text-xs text-slate-400">{item.title}</span>
                    </div>
                    <div className="mt-1 text-sm text-slate-500">{item.phoneNumber || "未填写手机号"} · {item.carrierName} · {item.country}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 self-stretch sm:self-auto">
                    <div className="min-w-0 flex-1 text-left sm:flex-none sm:text-right">
                      <div className={`text-sm font-medium ${item.severity === "overdue" ? "text-rose-700" : item.severity === "condition" ? "text-sky-700" : "text-amber-700"}`}>
                        {item.dueDate || item.relative}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">{item.dueDate ? item.relative : "点击整行进入处理"}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><CheckCircle2 className="h-5 w-5" /></div>
              <p className="mt-4 text-sm font-medium">当前没有待处理事项</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">号码进入生命周期提醒窗口，或低余额等条件被触发后，会同时出现在这里、处理中心和右上角铃铛。</p>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold">Alpha 进度</h3>
          <div className="mt-5 space-y-4 text-sm">
            {[
              ["SQLite 持久化", true],
              ["首次管理员创建", true],
              ["登录 / Session", true],
              ["Dashboard Shell", true],
              [`运营商管理 · ${carrierCount} 条`, true],
              [`号码管理 · ${rows.length} 条`, true],
              [`绑定服务 · ${boundServiceCount} 条`, true],
              [`保号规则 · ${enabledRuleCount} 条`, true],
              ["生命周期处理中心", true],
              ["外部通知渠道", true],
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
