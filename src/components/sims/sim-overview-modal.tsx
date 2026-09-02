"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CircleDollarSign,
  ExternalLink,
  Loader2,
  Pencil,
  ReceiptText,
  Smartphone,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { ModalPortal } from "@/components/ui/modal-portal";
import { getSimStatusLabel, getSimTypeLabel } from "@/lib/sim-options";
import type { SimRecord } from "@/lib/sim-types";
import {
  getBillingUnitLabel,
  getRoamingAvailabilityLabel,
  getTariffRateModeLabel,
  TARIFF_SERVICES,
  type TariffServiceCode,
} from "@/lib/tariff-options";

type TariffRate = {
  mode?: string;
  amount?: number | null;
  billingUnit?: string | null;
};

type TariffDetail = {
  planName?: string | null;
  planType?: string | null;
  currencyCode?: string | null;
  purchaseCost?: number | null;
  recurringFee?: number | null;
  recurringPeriodValue?: number | null;
  recurringPeriodUnit?: string | null;
  administrationFee?: number | null;
  autoRenew?: string | null;
  roamingAvailable?: string | null;
  usageSummary?: string | null;
  sourceUrl?: string | null;
  verifiedAt?: string | null;
  notes?: string | null;
  rates?: Record<string, TariffRate>;
  rules?: Record<string, unknown[]>;
};

const LOCAL_CODES: TariffServiceCode[] = [
  "localOutgoingCall",
  "localIncomingCall",
  "localOutgoingSms",
  "localIncomingSms",
  "localData",
];

const ROAMING_CODES: TariffServiceCode[] = [
  "roamingOutgoingCall",
  "roamingIncomingCall",
  "roamingOutgoingSms",
  "roamingIncomingSms",
  "roamingData",
];

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

function planTypeLabel(value: string | null | undefined) {
  if (value === "prepaid") return "储值 / 预付费";
  if (value === "postpaid") return "月费 / 后付费";
  return "未记录";
}

function periodLabel(value: number | null | undefined, unit: string | null | undefined) {
  if (value === null || value === undefined || !unit) return "";
  if (unit === "day") return `${value} 天`;
  if (unit === "month") return `${value} 个月`;
  if (unit === "year") return `${value} 年`;
  return "";
}

function formatMoney(value: number | null | undefined, currency: string | null | undefined) {
  if (value === null || value === undefined) return "未记录";
  return `${value} ${currency || ""}`.trim();
}

function rateText(tariff: TariffDetail | null, code: TariffServiceCode) {
  const rate = tariff?.rates?.[code];
  if (!rate) return "未记录";

  const ruleCount = Array.isArray(tariff?.rules?.[code]) ? tariff!.rules![code].length : 0;
  let value = getTariffRateModeLabel(rate.mode || "unknown");

  if (rate.mode === "charged" && rate.amount !== null && rate.amount !== undefined) {
    const unit = getBillingUnitLabel(rate.billingUnit);
    value = `${rate.amount} ${tariff?.currencyCode || ""}${unit ? ` / ${unit.replace(/^每/, "")}` : ""}`.trim();
  } else if (rate.mode === "included" && rate.amount !== null && rate.amount !== undefined) {
    const unit = getBillingUnitLabel(rate.billingUnit);
    value = `套餐内 ${rate.amount}${unit ? ` ${unit}` : ""}`;
  }

  return ruleCount > 0 ? `${value} · ${ruleCount} 条特殊规则` : value;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3.5 py-3">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="mt-1 break-words text-sm font-medium text-slate-700">{value || "未记录"}</div>
    </div>
  );
}

function RateGroup({ title, codes, tariff }: { title: string; codes: TariffServiceCode[]; tariff: TariffDetail | null }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="mb-3 text-sm font-medium text-slate-800">{title}</div>
      <div className="divide-y divide-slate-100">
        {codes.map((code) => {
          const service = TARIFF_SERVICES.find((item) => item.code === code)!;
          return (
            <div key={code} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
              <span className="text-xs text-slate-500">{service.label}</span>
              <span className="max-w-[65%] text-right text-xs font-medium text-slate-700">{rateText(tariff, code)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SimOverviewModal({
  sim,
  onClose,
  onEdit,
  onEditTariff,
}: {
  sim: SimRecord;
  onClose: () => void;
  onEdit: () => void;
  onEditTariff: () => void;
}) {
  const [tariff, setTariff] = useState<TariffDetail | null>(null);
  const [loadingTariff, setLoadingTariff] = useState(Boolean(sim.tariffId));
  const [tariffError, setTariffError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadTariff() {
      if (!sim.tariffId) {
        setTariff(null);
        setLoadingTariff(false);
        return;
      }

      setLoadingTariff(true);
      setTariffError("");
      try {
        const response = await fetch(`/api/tariffs?simId=${sim.id}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "资费信息加载失败");
        if (active) setTariff(data.tariff || null);
      } catch (error) {
        if (active) setTariffError(error instanceof Error ? error.message : "资费信息加载失败");
      } finally {
        if (active) setLoadingTariff(false);
      }
    }

    void loadTariff();
    return () => {
      active = false;
    };
  }, [sim.id, sim.tariffId]);

  const recurringText = useMemo(() => {
    if (!tariff || tariff.recurringFee === null || tariff.recurringFee === undefined) return "未记录";
    const period = periodLabel(tariff.recurringPeriodValue, tariff.recurringPeriodUnit);
    return `${formatMoney(tariff.recurringFee, tariff.currencyCode)}${period ? ` / ${period}` : ""}`;
  }, [tariff]);

  return (
    <ModalPortal>
      <Card className="flex w-full max-w-5xl flex-col overflow-hidden shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Smartphone className="h-4 w-4" />
              号码详情
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-semibold text-slate-900">{sim.label}</h3>
              <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${statusClass(sim.status)}`}>{getSimStatusLabel(sim.status)}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
              <span>{sim.phoneNumber || "未填写手机号"}</span>
              <span>{sim.carrierName}</span>
              <span>{sim.country} · {sim.countryCode}</span>
              <span>{getSimTypeLabel(sim.simType)}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto bg-white px-5 py-5 sm:px-6">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-slate-400" />
              <h4 className="font-medium text-slate-900">基本信息</h4>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <DetailItem label="手机号 / MSISDN" value={sim.phoneNumber || "未记录"} />
              <DetailItem label="运营商" value={`${sim.carrierName} · ${sim.country}`} />
              <DetailItem label="SIM 类型" value={getSimTypeLabel(sim.simType)} />
              <DetailItem label="ICCID" value={sim.iccid || "未记录"} />
              <DetailItem label="余额" value={sim.balance === null ? "未记录" : `${sim.balance} ${sim.currencyCode || ""}`} />
              <DetailItem label="激活日期" value={sim.activationDate || "未记录"} />
              <DetailItem label="有效期至" value={sim.validUntil || "未设置"} />
              <DetailItem label="状态" value={getSimStatusLabel(sim.status)} />
            </div>
            {sim.notes ? (
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 text-sm leading-6 text-slate-600">
                <div className="mb-1 text-[11px] text-slate-400">号码备注</div>
                {sim.notes}
              </div>
            ) : null}
          </section>

          <section className="space-y-3 border-t pt-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <ReceiptText className="h-4 w-4 text-slate-400" />
                  <h4 className="font-medium text-slate-900">资费概览</h4>
                </div>
                <p className="mt-1 text-xs text-slate-400">展示这张卡当前已记录的核心资费；特殊分档仍以资费编辑器为准。</p>
              </div>
              <button type="button" onClick={onEditTariff} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50">
                <ReceiptText className="h-3.5 w-3.5" />
                编辑资费
              </button>
            </div>

            {loadingTariff ? (
              <div className="flex min-h-36 items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载资费…
              </div>
            ) : tariffError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{tariffError}</div>
            ) : tariff ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <DetailItem label="套餐 / 资费" value={tariff.planName || "未命名资费"} />
                  <DetailItem label="套餐类型" value={planTypeLabel(tariff.planType)} />
                  <DetailItem label="购卡费用" value={formatMoney(tariff.purchaseCost, tariff.currencyCode)} />
                  <DetailItem label="基础 / 月费" value={recurringText} />
                  <DetailItem label="行政 / 附加费" value={formatMoney(tariff.administrationFee, tariff.currencyCode)} />
                  <DetailItem label="国际漫游" value={getRoamingAvailabilityLabel(tariff.roamingAvailable)} />
                  <DetailItem label="最后确认" value={tariff.verifiedAt || "未记录"} />
                  <DetailItem label="续订" value={tariff.autoRenew === "yes" ? "自动续订" : tariff.autoRenew === "no" ? "不自动续订" : "未知"} />
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <RateGroup title="本地使用" codes={LOCAL_CODES} tariff={tariff} />
                  <RateGroup title="国际漫游" codes={ROAMING_CODES} tariff={tariff} />
                </div>

                {tariff.usageSummary ? (
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                    <div className="mb-1 text-[11px] text-slate-400">使用结论</div>
                    {tariff.usageSummary}
                  </div>
                ) : null}

                {(tariff.notes || tariff.sourceUrl) ? (
                  <div className="flex flex-col gap-2 rounded-xl border border-slate-100 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-start sm:justify-between">
                    <div className="leading-5">{tariff.notes || "无额外资费备注"}</div>
                    {tariff.sourceUrl ? (
                      <a href={tariff.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 font-medium text-slate-700 hover:text-slate-950">
                        查看资费来源 <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-8 text-center">
                <CircleDollarSign className="mx-auto h-5 w-5 text-slate-300" />
                <div className="mt-2 text-sm font-medium text-slate-600">还没有录入资费</div>
                <p className="mt-1 text-xs text-slate-400">录入后，这里会集中展示本地和漫游核心资费。</p>
              </div>
            )}
          </section>

          <section className="border-t pt-6">
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                生命周期详情入口
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-400">后续绑定服务、保号规则与记录、充值记录开发完成后，会继续汇总到同一个号码详情中。</p>
            </div>
          </section>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-white px-5 py-4 sm:px-6">
          <div className="text-xs text-slate-400">创建于 {sim.createdAt.slice(0, 10)} · 更新于 {sim.updatedAt.slice(0, 10)}</div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-lg border px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50">关闭</button>
            <button type="button" onClick={onEdit} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-medium text-white transition hover:bg-slate-800">
              <Pencil className="h-3.5 w-3.5" />编辑号码
            </button>
          </div>
        </div>
      </Card>
    </ModalPortal>
  );
}
