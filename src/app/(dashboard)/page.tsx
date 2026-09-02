import Link from "next/link";
import { eq } from "drizzle-orm";
import { AlertTriangle, BellRing, CheckCircle2, Clock3, ShieldCheck, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { db } from "@/db";
import { carriers, simCards, simKeepAliveRules } from "@/db/schema";
import { getKeepAliveRuleStatus } from "@/lib/keep-alive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function dateInSingapore(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

type ActionItem = {
  key: string;
  simId: number;
  label: string;
  phoneNumber: string | null;
  carrierName: string;
  country: string;
  title: string;
  date: string;
  severity: "warning" | "overdue";
  href: string;
};

export default function DashboardPage() {
  const carrierCount = db.select({ id: carriers.id }).from(carriers).all().length;
  const rows = db
    .select({
      id: simCards.id,
      label: simCards.label,
      phoneNumber: simCards.phoneNumber,
      status: simCards.status,
      validUntil: simCards.validUntil,
      carrierName: carriers.name,
      country: carriers.country,
    })
    .from(simCards)
    .innerJoin(carriers, eq(simCards.carrierId, carriers.id))
    .all();
  const keepAliveRules = db.select().from(simKeepAliveRules).all();

  const today = dateInSingapore(new Date());
  const thirtyDaysLater = dateInSingapore(new Date(Date.now() + 30 * 86400000));
  const rulesBySim = new Map<number, typeof keepAliveRules>();
  for (const rule of keepAliveRules) {
    const list = rulesBySim.get(rule.simId) ?? [];
    list.push(rule);
    rulesBySim.set(rule.simId, list);
  }

  const overdueSimIds = new Set<number>();
  const attentionSimIds = new Set<number>();
  const actions: ActionItem[] = [];

  for (const sim of rows) {
    const validOverdue = Boolean(sim.validUntil && sim.validUntil < today);
    if (sim.status === "expired" || validOverdue) overdueSimIds.add(sim.id);
    if (sim.status !== "closed" && sim.validUntil && sim.validUntil <= thirtyDaysLater) {
      if (!validOverdue) attentionSimIds.add(sim.id);
      actions.push({
        key: `valid-${sim.id}`,
        simId: sim.id,
        label: sim.label,
        phoneNumber: sim.phoneNumber,
        carrierName: sim.carrierName,
        country: sim.country,
        title: "号码有效期",
        date: sim.validUntil,
        severity: validOverdue ? "overdue" : "warning",
        href: "/reminders",
      });
    }

    for (const rule of rulesBySim.get(sim.id) ?? []) {
      const state = getKeepAliveRuleStatus({
        enabled: rule.enabled,
        nextDueDate: rule.nextDueDate,
        warningDays: rule.warningDays,
        gracePeriodDays: rule.gracePeriodDays,
        today,
      });
      if (!rule.nextDueDate || !rule.enabled) continue;
      if (state.status === "overdue") {
        overdueSimIds.add(sim.id);
        actions.push({
          key: `rule-${rule.id}`,
          simId: sim.id,
          label: sim.label,
          phoneNumber: sim.phoneNumber,
          carrierName: sim.carrierName,
          country: sim.country,
          title: `保号 · ${rule.name}`,
          date: rule.nextDueDate,
          severity: "overdue",
          href: "/reminders",
        });
      } else if (state.status === "grace" || state.status === "due_soon") {
        attentionSimIds.add(sim.id);
        actions.push({
          key: `rule-${rule.id}`,
          simId: sim.id,
          label: sim.label,
          phoneNumber: sim.phoneNumber,
          carrierName: sim.carrierName,
          country: sim.country,
          title: `保号 · ${rule.name}`,
          date: rule.nextDueDate,
          severity: state.status === "grace" ? "overdue" : "warning",
          href: "/reminders",
        });
      }
    }
  }

  for (const id of overdueSimIds) attentionSimIds.delete(id);

  const activeCount = rows.filter((sim) => sim.status === "active" && !(sim.validUntil && sim.validUntil < today) && !overdueSimIds.has(sim.id)).length;
  const actionable = actions.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  const enabledRuleCount = keepAliveRules.filter((rule) => rule.enabled).length;

  const stats = [
    { label: "号码总数", value: rows.length, icon: Smartphone },
    { label: "正常", value: activeCount, icon: CheckCircle2 },
    { label: "待处理", value: attentionSimIds.size, icon: Clock3 },
    { label: "已逾期 / 失效", value: overdueSimIds.size, icon: AlertTriangle },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">你的号码生命周期，一处管理</h2>
          <p className="mt-1 text-sm text-slate-500">alpha.5 已加入提醒中心：首页保留关键待处理摘要，完整提醒可集中筛选和查看。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/reminders" className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium text-slate-700 transition hover:bg-white">
            <BellRing className="h-4 w-4" />提醒中心
          </Link>
          <Link href="/history" className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium text-slate-700 transition hover:bg-white">
            <ShieldCheck className="h-4 w-4" />保号管理
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
              <p className="mt-1 text-sm text-slate-500">这里只显示最优先的待处理事项，完整列表请前往提醒中心。</p>
            </div>
            <Link href="/reminders" className="shrink-0 text-xs font-medium text-slate-500 underline underline-offset-4">查看全部</Link>
          </div>
          {actionable.length ? (
            <div className="divide-y">
              {actionable.map((item) => (
                <div key={item.key} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-800">{item.label}</span>
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${item.severity === "overdue" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
                        {item.severity === "overdue" ? "已需处理" : "即将处理"}
                      </span>
                      <span className="text-xs text-slate-400">{item.title}</span>
                    </div>
                    <div className="mt-1 text-sm text-slate-500">{item.phoneNumber || "未填写手机号"} · {item.carrierName} · {item.country}</div>
                  </div>
                  <div className="shrink-0 text-left sm:text-right">
                    <div className={`text-sm font-medium ${item.severity === "overdue" ? "text-rose-700" : "text-amber-700"}`}>{item.date}</div>
                    <Link href={item.href} className="mt-1 inline-block text-xs text-slate-400 underline underline-offset-4">查看提醒</Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><CheckCircle2 className="h-5 w-5" /></div>
              <p className="mt-4 text-sm font-medium">当前没有待处理事项</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">号码进入有效期提醒窗口或保号规则提醒窗口后，会自动汇总到首页和提醒中心。</p>
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
              [`保号规则 · ${enabledRuleCount} 条`, true],
              ["站内提醒中心", true],
              ["外部通知渠道", false],
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
