import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Globe2,
  MapPin,
  PhoneOff,
  RadioTower,
  ShieldCheck,
  Smartphone,
  TabletSmartphone,
  Waypoints,
  Wrench,
} from "lucide-react";
import { SimHealthBadge } from "@/components/sims/sim-health-badge";
import { Card } from "@/components/ui/card";
import { getUnifiedReminderItems } from "@/lib/current-reminders";
import { getDashboardInsights, type DashboardDistributionItem } from "@/lib/dashboard-insights";
import { getKeepAliveActivityLabel } from "@/lib/keep-alive";
import { getLifecycleToday } from "@/lib/lifecycle-engine";
import { getReminderRelativeLabel, getReminderTaskHref, type ReminderStatus } from "@/lib/reminders";
import { getSimHealthOverview } from "@/lib/sim-health";

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
  if (status === "overdue" || status === "grace" || status === "today") return "overdue";
  if (status === "condition") return "condition";
  return "warning";
}

function severityClass(severity: ActionItem["severity"]) {
  if (severity === "overdue") return "bg-rose-50 text-rose-700";
  if (severity === "condition") return "bg-sky-50 text-sky-700";
  return "bg-amber-50 text-amber-700";
}

function severityLabel(severity: ActionItem["severity"]) {
  if (severity === "overdue") return "立即处理";
  if (severity === "condition") return "条件触发";
  return "近期关注";
}

function addDaysIso(date: string, days: number) {
  const target = new Date(`${date}T00:00:00Z`);
  target.setUTCDate(target.getUTCDate() + days);
  return target.toISOString().slice(0, 10);
}

function countryFlag(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return "🌐";
  return String.fromCodePoint(...Array.from(normalized).map((char) => 127397 + char.charCodeAt(0)));
}

function formatMoney(amount: number | null, currencyCode: string | null) {
  if (amount === null) return null;
  const prefix = currencyCode?.trim().toUpperCase() || "";
  return `${prefix ? `${prefix} ` : ""}${amount.toLocaleString("zh-CN", { maximumFractionDigits: 6 })}`;
}

function DistributionList({ items, kind }: { items: DashboardDistributionItem[]; kind: "country" | "carrier" }) {
  const max = Math.max(...items.map((item) => item.count), 1);
  if (!items.length) return <div className="py-10 text-center text-xs text-slate-400">暂无数据</div>;

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.key}>
          <div className="flex items-center justify-between gap-4 text-sm">
            <div className="min-w-0 truncate font-medium text-slate-700">
              {kind === "country" ? <span className="mr-2">{countryFlag(item.key)}</span> : null}
              {item.label}
            </div>
            <div className="shrink-0 text-xs font-medium text-slate-500">{item.count}</div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-slate-700" style={{ width: `${Math.max(8, (item.count / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const today = getLifecycleToday();
  const sevenDays = addDaysIso(today, 7);
  const thirtyDays = addDaysIso(today, 30);
  const reminders = getUnifiedReminderItems();
  const health = getSimHealthOverview(today);
  const insights = getDashboardInsights();

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

  const actionable = actions.slice(0, 8);
  const healthAttention = health.items
    .filter((item) => item.healthStatus === "critical" || item.healthStatus === "attention" || item.healthStatus === "setup")
    .slice(0, 6);

  const immediateCount = reminders.filter((item) => ["overdue", "grace", "today", "condition"].includes(item.status)).length;
  const sevenDayCount = reminders.filter((item) => item.dueDate && item.dueDate > today && item.dueDate <= sevenDays).length;
  const laterMonthCount = reminders.filter((item) => item.dueDate && item.dueDate > sevenDays && item.dueDate <= thirtyDays).length;
  const setupCount = reminders.filter((item) => item.status === "unscheduled").length;
  const managedCount = Math.max(0, health.summary.total - health.summary.inactive);
  const healthyPercent = managedCount ? Math.round((health.summary.healthy / managedCount) * 100) : 100;

  const stats = [
    { label: "号码总数", value: health.summary.total, icon: Smartphone, href: "/sims", hint: `${managedCount} 张仍在管理` },
    { label: "健康正常", value: health.summary.healthy, icon: CheckCircle2, href: "/sims?health=healthy", hint: `${healthyPercent}% 管理中号码正常` },
    { label: "需要关注", value: health.summary.needsAttention, icon: CircleAlert, href: "/sims?health=needs_attention", hint: `关注 ${health.summary.attention} · 待配置 ${health.summary.setup}` },
    { label: "紧急", value: health.summary.critical, icon: AlertTriangle, href: "/sims?health=critical", hint: health.summary.critical ? "建议优先处理" : "当前没有紧急风险" },
  ];

  const configurationRows = [
    { label: "未配置保号规则", value: insights.configuration.noKeepAliveRule, icon: ShieldCheck, href: "/history" },
    { label: "未绑定任何服务", value: insights.configuration.noBoundService, icon: Waypoints, href: "/services" },
    { label: "未分配设备", value: insights.configuration.unassignedDevice, icon: TabletSmartphone, href: "/sims?device=unassigned" },
    { label: "未填写手机号", value: insights.configuration.missingPhoneNumber, icon: PhoneOff, href: "/sims" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6" data-dashboard-version="alpha.43">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-400"><Activity className="h-3.5 w-3.5" />Operations overview</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">号码资产总览</h2>
          <p className="mt-1 text-sm text-slate-500">先看风险，再看未来 30 天安排、资产结构和配置缺口；首页中的关键数字都尽量直接落到可处理入口。</p>
        </div>
        <div className="flex flex-wrap gap-2">
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
            <Link key={stat.label} href={stat.href} className="group block">
              <Card className="h-full p-5 transition group-hover:-translate-y-0.5 group-hover:border-slate-300 group-hover:shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">{stat.label}</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Icon className="h-4 w-4" /></div>
                </div>
                <div className="mt-4 text-3xl font-semibold tracking-tight">{stat.value}</div>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400">
                  <span>{stat.hint}</span><ChevronRight className="h-3.5 w-3.5 shrink-0 transition group-hover:translate-x-0.5" />
                </div>
              </Card>
            </Link>
          );
        })}
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden">
          <div className="border-b px-5 py-4">
            <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-400" /><h3 className="font-semibold">未来 30 天</h3></div>
            <p className="mt-1 text-xs leading-5 text-slate-400">按真实 Reminder/Condition 状态统计，不受忽略或延后操作影响 Health 判断。</p>
          </div>
          <div className="grid grid-cols-2 gap-px bg-slate-100">
            <Link href="/reminders" className="bg-white p-4 transition hover:bg-slate-50">
              <div className="text-2xl font-semibold text-rose-700">{immediateCount}</div><div className="mt-1 text-xs text-slate-500">立即处理 / 条件触发</div>
            </Link>
            <Link href="/reminders" className="bg-white p-4 transition hover:bg-slate-50">
              <div className="text-2xl font-semibold text-amber-700">{sevenDayCount}</div><div className="mt-1 text-xs text-slate-500">未来 7 天</div>
            </Link>
            <Link href="/reminders" className="bg-white p-4 transition hover:bg-slate-50">
              <div className="text-2xl font-semibold text-slate-800">{laterMonthCount}</div><div className="mt-1 text-xs text-slate-500">第 8–30 天</div>
            </Link>
            <Link href="/history" className="bg-white p-4 transition hover:bg-slate-50">
              <div className="text-2xl font-semibold text-sky-700">{setupCount}</div><div className="mt-1 text-xs text-slate-500">待设置日期</div>
            </Link>
          </div>
          <div className="border-t bg-slate-50/70 px-5 py-3 text-[11px] text-slate-400">统计日期：{today} · 当前共有 {reminders.length} 项可执行任务</div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b px-5 py-4">
            <div className="flex items-center gap-2"><Globe2 className="h-4 w-4 text-slate-400" /><h3 className="font-semibold">资产结构</h3></div>
            <p className="mt-1 text-xs leading-5 text-slate-400">已注销号码只计入状态总数，不进入当前实体/eSIM 与地区结构统计。</p>
          </div>
          <div className="grid grid-cols-2 gap-3 p-5 text-sm">
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-400">实体 SIM</div><div className="mt-1 text-xl font-semibold">{insights.asset.physical}</div></div>
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-400">eSIM</div><div className="mt-1 text-xl font-semibold">{insights.asset.esim}</div></div>
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-400">国家 / 地区</div><div className="mt-1 text-xl font-semibold">{insights.asset.countries}</div></div>
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-400">运营商</div><div className="mt-1 text-xl font-semibold">{insights.asset.carriers}</div></div>
          </div>
          <div className="border-t px-5 py-3 text-[11px] leading-5 text-slate-400">
            正常 {insights.asset.active} · 暂停 {insights.asset.paused} · 已失效 {insights.asset.expired} · 已注销 {insights.asset.inactive}<br />
            已绑定服务 {insights.asset.boundServices} · 启用保号规则 {insights.asset.enabledRules}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b px-5 py-4">
            <div className="flex items-center gap-2"><Wrench className="h-4 w-4 text-slate-400" /><h3 className="font-semibold">配置检查</h3></div>
            <p className="mt-1 text-xs leading-5 text-slate-400">这些不一定是风险，但会影响 SIMKeeper 能否完整管理该号码。</p>
          </div>
          <div className="divide-y divide-slate-100">
            {configurationRows.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.label} href={item.href} className="flex items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-slate-50">
                  <div className="flex min-w-0 items-center gap-3"><Icon className="h-4 w-4 shrink-0 text-slate-400" /><span className="truncate text-sm text-slate-600">{item.label}</span></div>
                  <div className="flex items-center gap-2"><span className={`text-sm font-semibold ${item.value ? "text-amber-700" : "text-emerald-700"}`}>{item.value}</span><ChevronRight className="h-3.5 w-3.5 text-slate-300" /></div>
                </Link>
              );
            })}
          </div>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="min-h-80 overflow-hidden">
          <div className="flex items-start justify-between gap-4 border-b px-6 py-5">
            <div><h3 className="font-semibold">需要处理</h3><p className="mt-1 text-sm text-slate-500">只展示当前最优先的 8 项任务；处理中心仍是完整任务入口。</p></div>
            <Link href="/reminders" className="shrink-0 text-xs font-medium text-slate-500 underline underline-offset-4">查看全部</Link>
          </div>
          {actionable.length ? (
            <div className="divide-y divide-slate-100">
              {actionable.map((item) => (
                <Link key={item.key} href={item.href} data-dashboard-task-row={item.key} className="group flex flex-col gap-3 px-6 py-4 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-slate-800">{item.label}</span><span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${severityClass(item.severity)}`}>{severityLabel(item.severity)}</span><span className="text-xs text-slate-400">{item.title}</span></div>
                    <div className="mt-1 text-sm text-slate-500">{item.phoneNumber || "未填写手机号"} · {item.carrierName} · {item.country}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3"><div className="text-right"><div className={`text-sm font-medium ${item.severity === "overdue" ? "text-rose-700" : item.severity === "condition" ? "text-sky-700" : "text-amber-700"}`}>{item.dueDate || item.relative}</div><div className="mt-0.5 text-xs text-slate-400">{item.dueDate ? item.relative : "点击进入处理"}</div></div><ChevronRight className="h-4 w-4 text-slate-300" /></div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center"><CheckCircle2 className="h-7 w-7 text-emerald-500" /><p className="mt-3 text-sm font-medium">当前没有待处理事项</p><p className="mt-1 text-xs leading-5 text-slate-400">生命周期、余额或同步条件触发后会自动出现在这里。</p></div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-start justify-between gap-4 border-b px-6 py-5">
            <div><h3 className="font-semibold">号码健康</h3><p className="mt-1 text-sm text-slate-500">当前最值得关注的号码与主要原因。</p></div>
            <Link href="/sims" className="shrink-0 text-xs font-medium text-slate-500 underline underline-offset-4">查看号码</Link>
          </div>
          {healthAttention.length ? (
            <div className="divide-y divide-slate-100">
              {healthAttention.map((item) => (
                <Link key={item.simId} href={`/sims?health=${item.healthStatus === "setup" ? "needs_attention" : item.healthStatus}`} className="block px-6 py-4 transition hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-medium text-slate-800">{item.simLabel}</span><SimHealthBadge status={item.healthStatus} /></div><div className="mt-1 text-xs text-slate-400">{item.carrierName} · {item.phoneNumber || "未填写手机号"}</div></div><ChevronRight className="h-4 w-4 shrink-0 text-slate-300" /></div>
                  <div className="mt-2 text-xs font-medium text-slate-600">{item.summary}</div>{item.primaryReason?.detail ? <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-400">{item.primaryReason.detail}</div> : null}
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center"><CheckCircle2 className="h-7 w-7 text-emerald-500" /><p className="mt-3 text-sm font-medium text-slate-700">当前没有健康风险</p><p className="mt-1 text-xs leading-5 text-slate-400">暂停 {health.summary.paused} · 已停用 {health.summary.inactive}</p></div>
          )}
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card className="p-5">
          <div className="mb-5 flex items-center justify-between"><div><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-400" /><h3 className="font-semibold">地区分布</h3></div><p className="mt-1 text-xs text-slate-400">当前仍在管理的号码</p></div><span className="text-xs text-slate-400">Top 6</span></div>
          <DistributionList items={insights.countryDistribution} kind="country" />
        </Card>

        <Card className="p-5">
          <div className="mb-5 flex items-center justify-between"><div><div className="flex items-center gap-2"><RadioTower className="h-4 w-4 text-slate-400" /><h3 className="font-semibold">运营商分布</h3></div><p className="mt-1 text-xs text-slate-400">当前仍在管理的号码</p></div><span className="text-xs text-slate-400">Top 6</span></div>
          <DistributionList items={insights.carrierDistribution} kind="carrier" />
        </Card>

        <Card className="overflow-hidden lg:col-span-2 xl:col-span-1">
          <div className="flex items-start justify-between gap-4 border-b px-5 py-4"><div><div className="flex items-center gap-2"><Activity className="h-4 w-4 text-slate-400" /><h3 className="font-semibold">最近保号记录</h3></div><p className="mt-1 text-xs text-slate-400">只展示保号/充值事实记录，不扩展为完整操作时间线。</p></div><Link href="/history" className="text-xs font-medium text-slate-500 underline underline-offset-4">保号规则</Link></div>
          {insights.recentActivities.length ? (
            <div className="divide-y divide-slate-100">
              {insights.recentActivities.map((activity) => {
                const amount = formatMoney(activity.amount, activity.currencyCode);
                return (
                  <div key={activity.id} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-medium text-slate-700">{activity.simLabel}</span><span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{getKeepAliveActivityLabel(activity.activityType)}</span></div><div className="mt-1 text-[11px] text-slate-400">{activity.carrierName} · {activity.phoneNumber || "未填写手机号"}</div></div><span className="shrink-0 text-xs font-medium text-slate-500">{activity.activityDate}</span></div>
                    {(amount || activity.validUntilAfter) ? <div className="mt-2 text-[11px] leading-5 text-slate-500">{amount ? `金额 ${amount}` : ""}{amount && activity.validUntilAfter ? " · " : ""}{activity.validUntilAfter ? `有效期更新至 ${activity.validUntilAfter}` : ""}</div> : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center"><ShieldCheck className="h-6 w-6 text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-600">暂无保号活动记录</p><p className="mt-1 text-xs text-slate-400">充值、拨号、短信或延期等记录会显示在这里。</p></div>
          )}
        </Card>
      </section>
    </div>
  );
}
