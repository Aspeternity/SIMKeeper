import Link from "next/link";
import { eq } from "drizzle-orm";
import { AlertTriangle, CheckCircle2, Clock3, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { db } from "@/db";
import { carriers, simCards } from "@/db/schema";

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

  const today = dateInSingapore(new Date());
  const thirtyDaysLater = dateInSingapore(new Date(Date.now() + 30 * 86400000));
  const overdueCount = rows.filter((sim) => sim.status === "expired" || Boolean(sim.validUntil && sim.validUntil < today)).length;
  const activeCount = rows.filter((sim) => sim.status === "active" && !(sim.validUntil && sim.validUntil < today)).length;
  const dueSoonCount = rows.filter(
    (sim) => sim.status === "active" && Boolean(sim.validUntil && sim.validUntil >= today && sim.validUntil <= thirtyDaysLater),
  ).length;

  const actionable = rows
    .filter((sim) => sim.status !== "closed" && Boolean(sim.validUntil && sim.validUntil <= thirtyDaysLater))
    .sort((a, b) => (a.validUntil || "9999-12-31").localeCompare(b.validUntil || "9999-12-31"))
    .slice(0, 6);

  const stats = [
    { label: "号码总数", value: rows.length, icon: Smartphone },
    { label: "正常", value: activeCount, icon: CheckCircle2 },
    { label: "30 天内需处理", value: dueSoonCount, icon: Clock3 },
    { label: "已逾期 / 失效", value: overdueCount, icon: AlertTriangle },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">你的号码生命周期，一处管理</h2>
          <p className="mt-1 text-sm text-slate-500">alpha.3 已加入号码管理，首页开始使用真实号码、状态和有效期数据。</p>
        </div>
        <Link href="/sims" className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800">
          <Smartphone className="h-4 w-4" />
          管理号码
        </Link>
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
        <Card className="min-h-80 overflow-hidden">
          <div className="border-b px-6 py-5">
            <h3 className="font-semibold">需要处理</h3>
            <p className="mt-1 text-sm text-slate-500">显示已过有效期或未来 30 天内即将到期的号码。</p>
          </div>
          {actionable.length ? (
            <div className="divide-y">
              {actionable.map((sim) => {
                const overdue = Boolean(sim.validUntil && sim.validUntil < today);
                return (
                  <div key={sim.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-800">{sim.label}</span>
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${overdue ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
                          {overdue ? "已逾期" : "即将到期"}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {sim.phoneNumber || "未填写手机号"} · {sim.carrierName} · {sim.country}
                      </div>
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      <div className={`text-sm font-medium ${overdue ? "text-rose-700" : "text-amber-700"}`}>{sim.validUntil}</div>
                      <Link href="/sims" className="mt-1 inline-block text-xs text-slate-400 underline underline-offset-4">查看号码</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <p className="mt-4 text-sm font-medium">当前没有待处理事项</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">录入号码有效期后，SIMKeeper 会自动把临近到期和已逾期项目汇总到这里。</p>
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
              ["保号规则 / 充值记录", false],
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
