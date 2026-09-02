"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, ReceiptText, Search, Smartphone, Trash2 } from "lucide-react";
import { SimEditorModal } from "@/components/sims/sim-editor-modal";
import { TariffModal } from "@/components/sims/tariff-modal";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getSimStatusLabel, getSimTypeLabel, SIM_STATUSES } from "@/lib/sim-options";
import type { CarrierRecord, SimRecord } from "@/lib/sim-types";
import { getRoamingAvailabilityLabel, getSmsReceivePolicyLabel } from "@/lib/tariff-options";

function todayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysUntil(date: string) {
  const today = new Date(`${todayDate()}T00:00:00`);
  const target = new Date(`${date}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function dateHint(sim: SimRecord) {
  if (!sim.validUntil) return null;
  const days = daysUntil(sim.validUntil);
  if (days < 0) return `已过期 ${Math.abs(days)} 天`;
  if (days === 0) return "今天到期";
  if (days <= 30) return `剩余 ${days} 天`;
  return null;
}

function statusClass(status: string) {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-700 ring-emerald-100";
    case "paused":
      return "bg-amber-50 text-amber-700 ring-amber-100";
    case "expired":
      return "bg-rose-50 text-rose-700 ring-rose-100";
    default:
      return "bg-slate-100 text-slate-500 ring-slate-200";
  }
}

function smsPolicyClass(value: string | null) {
  switch (value) {
    case "free":
      return "bg-emerald-50 text-emerald-700 ring-emerald-100";
    case "charged":
      return "bg-amber-50 text-amber-700 ring-amber-100";
    case "unavailable":
      return "bg-rose-50 text-rose-700 ring-rose-100";
    default:
      return "bg-slate-100 text-slate-500 ring-slate-200";
  }
}

function planTypeLabel(value: string | null) {
  if (value === "prepaid") return "储值 / 预付费";
  if (value === "postpaid") return "月费 / 后付费";
  return null;
}

function periodLabel(value: number | null, unit: string | null) {
  if (value === null || !unit) return null;
  if (unit === "day") return `${value} 天`;
  if (unit === "month") return `${value} 个月`;
  if (unit === "year") return `${value} 年`;
  return null;
}

function planFeeLabel(sim: SimRecord) {
  if (sim.tariffRecurringFee === null) return null;
  const currency = sim.tariffCurrencyCode || "";
  const period = periodLabel(sim.tariffRecurringPeriodValue, sim.tariffRecurringPeriodUnit);
  return `${currency} ${sim.tariffRecurringFee}${period ? ` / ${period}` : ""}`.trim();
}

export default function SimsPage() {
  const [sims, setSims] = useState<SimRecord[]>([]);
  const [carriers, setCarriers] = useState<CarrierRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [carrierFilter, setCarrierFilter] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SimRecord | null>(null);
  const [tariffSim, setTariffSim] = useState<SimRecord | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [simsResponse, carriersResponse] = await Promise.all([
        fetch("/api/sims", { cache: "no-store" }),
        fetch("/api/carriers", { cache: "no-store" }),
      ]);
      const [simsData, carriersData] = await Promise.all([simsResponse.json(), carriersResponse.json()]);
      if (!simsResponse.ok) throw new Error(simsData.error || "号码数据加载失败");
      if (!carriersResponse.ok) throw new Error(carriersData.error || "运营商数据加载失败");
      setSims(simsData.sims || []);
      setCarriers(carriersData.carriers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "号码数据加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return sims.filter((sim) => {
      const matchesQuery =
        !value ||
        [
          sim.label,
          sim.phoneNumber || "",
          sim.carrierName,
          sim.country,
          sim.countryCode,
          sim.iccid || "",
          sim.notes || "",
          sim.tariffPlanName || "",
          sim.tariffUsageSummary || "",
        ].some((field) => field.toLowerCase().includes(value));
      const matchesStatus = statusFilter === "all" || sim.status === statusFilter;
      const matchesCarrier = carrierFilter === "all" || sim.carrierId === Number(carrierFilter);
      return matchesQuery && matchesStatus && matchesCarrier;
    });
  }, [carrierFilter, query, sims, statusFilter]);

  const tariffCount = useMemo(() => sims.filter((sim) => Boolean(sim.tariffId)).length, [sims]);

  function openCreate() {
    if (!carriers.length) return;
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(sim: SimRecord) {
    setEditing(sim);
    setEditorOpen(true);
  }

  async function remove(sim: SimRecord) {
    if (!window.confirm(`确定删除“${sim.label}”吗？号码和对应资费资料将被永久移除。`)) return;
    setError("");
    try {
      const response = await fetch(`/api/sims?id=${sim.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除失败");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <Smartphone className="h-4 w-4" />
            生命周期
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">号码管理</h2>
          <p className="mt-1 text-sm text-slate-500">集中管理号码基础资料、余额、有效期和资费信息。</p>
        </div>
        {carriers.length ? (
          <button onClick={openCreate} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800">
            <Plus className="h-4 w-4" />
            新增号码
          </button>
        ) : (
          <Link href="/carriers" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800">
            先添加运营商
          </Link>
        )}
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      {!loading && carriers.length === 0 ? (
        <Card className="border-dashed p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium">号码需要关联运营商</div>
              <p className="mt-1 text-sm text-slate-500">先建立至少一个运营商，再录入号码。国家/地区和国际区号都会自动从运营商继承。</p>
            </div>
            <Link href="/carriers" className="text-sm font-medium text-slate-950 underline underline-offset-4">前往运营商管理</Link>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="space-y-3 border-b p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="font-medium">号码列表</div>
              <div className="mt-1 text-xs text-slate-400">显示 {filtered.length} / {sims.length} 个号码 · 已录入资费 {tariffCount} / {sims.length}</div>
            </div>
            <div className="relative w-full lg:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索号码、名称、运营商、套餐或 ICCID" className="pl-9" />
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 outline-none focus:border-slate-400">
              <option value="all">全部状态</option>
              {SIM_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
            <select value={carrierFilter} onChange={(event) => setCarrierFilter(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 outline-none focus:border-slate-400">
              <option value="all">全部运营商</option>
              {carriers.map((carrier) => <option key={carrier.id} value={carrier.id}>{carrier.name} · {carrier.country}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载号码…</div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><Smartphone className="h-5 w-5" /></div>
            <p className="mt-4 text-sm font-medium">{sims.length ? "没有匹配的号码" : "还没有录入号码"}</p>
            <p className="mt-1 max-w-md text-xs leading-5 text-slate-400">{sims.length ? "尝试调整搜索关键词或筛选条件。" : "录入第一张 SIM / eSIM 后，就可以继续维护资费和生命周期信息。"}</p>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((sim) => {
              const hint = dateHint(sim);
              const isDateOverdue = Boolean(sim.validUntil && sim.validUntil < todayDate());
              const feeLabel = planFeeLabel(sim);
              const typeLabel = planTypeLabel(sim.tariffPlanType);
              return (
                <div key={sim.id} className="p-4 transition hover:bg-slate-50/70">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Smartphone className="h-4 w-4" /></div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-slate-900">{sim.label}</span>
                          <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${statusClass(sim.status)}`}>{getSimStatusLabel(sim.status)}</span>
                          {isDateOverdue && sim.status !== "expired" && sim.status !== "closed" ? <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-inset ring-rose-100">有效期已过</span> : null}
                          {sim.tariffId ? (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">{sim.tariffPlanName || "已录入资费"}</span>
                          ) : (
                            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-100">未录入资费</span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500">
                          <span>{sim.phoneNumber || "未填写手机号"}</span>
                          <span>{sim.carrierName}</span>
                          <span>{sim.country} · {sim.countryCode}</span>
                          <span>{getSimTypeLabel(sim.simType)}</span>
                        </div>
                        {sim.tariffId ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {typeLabel ? <span className="rounded-md bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-100">{typeLabel}</span> : null}
                            {feeLabel ? <span className="rounded-md bg-sky-50 px-2 py-1 text-[10px] font-medium text-sky-700 ring-1 ring-inset ring-sky-100">{feeLabel}</span> : null}
                            {sim.tariffAutoRenew === "yes" ? <span className="rounded-md bg-violet-50 px-2 py-1 text-[10px] font-medium text-violet-700 ring-1 ring-inset ring-violet-100">自动续订</span> : null}
                            <span className={`rounded-md px-2 py-1 text-[10px] font-medium ring-1 ring-inset ${smsPolicyClass(sim.localIncomingSmsPolicy)}`}>本地收短信 {getSmsReceivePolicyLabel(sim.localIncomingSmsPolicy)}</span>
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">{getRoamingAvailabilityLabel(sim.roamingAvailable)}</span>
                            <span className={`rounded-md px-2 py-1 text-[10px] font-medium ring-1 ring-inset ${smsPolicyClass(sim.roamingIncomingSmsPolicy)}`}>漫游收短信 {getSmsReceivePolicyLabel(sim.roamingIncomingSmsPolicy)}</span>
                            {sim.tariffVerifiedAt ? <span className="rounded-md bg-slate-50 px-2 py-1 text-[10px] text-slate-400 ring-1 ring-inset ring-slate-100">确认于 {sim.tariffVerifiedAt}</span> : null}
                          </div>
                        ) : null}
                        {sim.tariffUsageSummary ? <div className="mt-1.5 line-clamp-1 text-xs text-slate-500">{sim.tariffUsageSummary}</div> : sim.notes ? <div className="mt-1.5 line-clamp-1 text-xs text-slate-400">{sim.notes}</div> : null}
                      </div>
                    </div>

                    <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4 xl:w-[620px]">
                      <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <div className="text-[11px] text-slate-400">余额</div>
                        <div className="mt-1 text-sm font-medium text-slate-700">{sim.balance === null ? "未记录" : `${sim.balance} ${sim.currencyCode || ""}`}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <div className="text-[11px] text-slate-400">有效期至</div>
                        <div className={`mt-1 text-sm font-medium ${hint ? "text-amber-700" : "text-slate-700"}`}>{sim.validUntil || "未设置"}</div>
                        {hint ? <div className="mt-0.5 text-[10px] text-amber-600">{hint}</div> : null}
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <div className="text-[11px] text-slate-400">接验证码</div>
                        <div className="mt-1 text-xs font-medium text-slate-700">本地：{sim.tariffId ? getSmsReceivePolicyLabel(sim.localIncomingSmsPolicy) : "未记录"}</div>
                        <div className="mt-0.5 text-[10px] text-slate-500">漫游：{sim.tariffId ? getSmsReceivePolicyLabel(sim.roamingIncomingSmsPolicy) : "未记录"}</div>
                      </div>
                      <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 sm:col-span-1">
                        <button onClick={() => setTariffSim(sim)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-700 transition hover:bg-white hover:text-slate-950">
                          <ReceiptText className="h-3.5 w-3.5" />资费
                        </button>
                        <button onClick={() => openEdit(sim)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-slate-950"><Pencil className="h-3.5 w-3.5" />编辑</button>
                        <button onClick={() => void remove(sim)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-medium text-rose-600 transition hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />删除</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {editorOpen ? (
        <SimEditorModal
          carriers={carriers}
          editing={editing}
          onClose={() => {
            setEditorOpen(false);
            setEditing(null);
          }}
          onSaved={loadData}
        />
      ) : null}

      {tariffSim ? <TariffModal sim={tariffSim} onClose={() => setTariffSim(null)} onSaved={loadData} /> : null}
    </div>
  );
}
