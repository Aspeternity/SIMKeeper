import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, CalendarClock, Pencil, ShieldCheck, Smartphone } from "lucide-react";
import { notFound } from "next/navigation";
import { KeepAliveOverviewSection } from "@/components/keep-alive/keep-alive-overview-section";
import { Card } from "@/components/ui/card";
import { db } from "@/db";
import { carriers, simCards } from "@/db/schema";
import { getIdentityStatusLabel, getSimStatusLabel, getSimTypeLabel } from "@/lib/sim-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function statusClass(status: string) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (status === "paused") return "bg-amber-50 text-amber-700 ring-amber-100";
  if (status === "expired") return "bg-rose-50 text-rose-700 ring-rose-100";
  return "bg-slate-100 text-slate-500 ring-slate-200";
}

function DetailItem({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl px-3.5 py-3 ${highlight ? "bg-amber-50 ring-1 ring-inset ring-amber-200" : "bg-slate-50"}`}>
      <div className={`text-[11px] ${highlight ? "text-amber-600" : "text-slate-400"}`}>{label}</div>
      <div className={`mt-1 break-words text-sm font-medium ${highlight ? "text-amber-800" : "text-slate-700"}`}>{value}</div>
    </div>
  );
}

export default async function SimDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string; rule?: string }>;
}) {
  const [{ id: rawId }, query] = await Promise.all([params, searchParams]);
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const sim = db
    .select({
      id: simCards.id,
      label: simCards.label,
      phoneNumber: simCards.phoneNumber,
      simType: simCards.simType,
      iccid: simCards.iccid,
      balance: simCards.balance,
      currencyCode: simCards.currencyCode,
      status: simCards.status,
      activationDate: simCards.activationDate,
      validUntil: simCards.validUntil,
      identityStatus: simCards.identityStatus,
      notes: simCards.notes,
      carrierName: carriers.name,
      country: carriers.country,
      countryCode: carriers.countryCode,
    })
    .from(simCards)
    .innerJoin(carriers, eq(simCards.carrierId, carriers.id))
    .where(eq(simCards.id, id))
    .get();

  if (!sim) notFound();

  const section = query.section === "keep-alive" ? "keep-alive" : query.section === "validity" ? "validity" : "overview";
  const ruleId = Number(query.rule);
  const focusRuleId = Number.isInteger(ruleId) && ruleId > 0 ? ruleId : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/sims" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition hover:text-slate-700">
            <ArrowLeft className="h-3.5 w-3.5" />返回号码管理
          </Link>
          <div className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-500">
            <Smartphone className="h-4 w-4" />号码详情
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{sim.label}</h2>
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${statusClass(sim.status)}`}>{getSimStatusLabel(sim.status)}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">{sim.phoneNumber || "未填写手机号"} · {sim.carrierName} · {sim.country}</p>
        </div>
        <Link href="/sims" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
          <Pencil className="h-4 w-4" />进入号码管理编辑
        </Link>
      </div>

      {section === "validity" ? (
        <Card className="border-amber-200 bg-amber-50/60 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-amber-600 ring-1 ring-amber-100"><CalendarClock className="h-4 w-4" /></div>
            <div>
              <div className="text-sm font-semibold text-amber-900">当前提醒定位：号码有效期</div>
              <div className="mt-1 text-sm text-amber-800">有效期至 {sim.validUntil || "尚未设置"}</div>
              <div className="mt-1 text-xs leading-5 text-amber-700/80">本页已直接定位到这张卡的生命周期资料；处理完成后可返回提醒中心标记当前这一轮提醒。</div>
            </div>
          </div>
        </Card>
      ) : section === "keep-alive" ? (
        <Card className="border-sky-200 bg-sky-50/60 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sky-600 ring-1 ring-sky-100"><ShieldCheck className="h-4 w-4" /></div>
            <div>
              <div className="text-sm font-semibold text-sky-900">当前提醒定位：保号规则</div>
              <div className="mt-1 text-xs leading-5 text-sky-700/80">下方“保号状态”已自动展开；若提醒来自具体规则，对应规则会高亮显示。</div>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-800"><Smartphone className="h-4 w-4 text-slate-400" />基本信息</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DetailItem label="手机号 / MSISDN" value={sim.phoneNumber || "未记录"} />
          <DetailItem label="运营商" value={`${sim.carrierName} · ${sim.country}`} />
          <DetailItem label="SIM 类型" value={getSimTypeLabel(sim.simType)} />
          <DetailItem label="ICCID" value={sim.iccid || "未记录"} />
          <DetailItem label="余额" value={sim.balance === null ? "未记录" : `${sim.balance} ${sim.currencyCode || ""}`.trim()} />
          <DetailItem label="激活日期" value={sim.activationDate || "未记录"} />
          <DetailItem label="有效期至" value={sim.validUntil || "未设置"} highlight={section === "validity"} />
          <DetailItem label="实名状态" value={getIdentityStatusLabel(sim.identityStatus)} />
        </div>
        {sim.notes ? <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">{sim.notes}</div> : null}
      </Card>

      <Card className="p-5 sm:p-6">
        <KeepAliveOverviewSection simId={sim.id} initialOpen={section === "keep-alive"} focusRuleId={focusRuleId} showServices={false} />
      </Card>
    </div>
  );
}
