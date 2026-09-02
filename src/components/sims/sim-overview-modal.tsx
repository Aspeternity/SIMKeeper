"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  CircleDollarSign,
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  ReceiptText,
  Smartphone,
  UserRoundCheck,
  X,
} from "lucide-react";
import { KeepAliveOverviewSection } from "@/components/keep-alive/keep-alive-overview-section";
import { Card } from "@/components/ui/card";
import { ModalPortal } from "@/components/ui/modal-portal";
import { COUNTRY_REGIONS } from "@/lib/countries";
import {
  getIdentityDocumentTypeLabel,
  getIdentityStatusLabel,
  getSimStatusLabel,
  getSimTypeLabel,
} from "@/lib/sim-options";
import type { SimRecord } from "@/lib/sim-types";
import {
  DESTINATION_SPECIAL_OPTIONS,
  getBillingUnitLabel,
  getRoamingAvailabilityLabel,
  getTariffRateModeLabel,
  NETWORK_SCOPE_OPTIONS,
  TARIFF_RULE_CONDITION_TYPES,
  TARIFF_SERVICES,
  type TariffServiceCode,
} from "@/lib/tariff-options";

type TariffRate = {
  mode?: string;
  amount?: number | null;
  billingUnit?: string | null;
};

type TariffRuleCondition = {
  type: string;
  value: string;
  value2?: string;
};

type TariffRule = {
  id?: number;
  label?: string | null;
  mode?: string;
  amount?: number | null;
  billingUnit?: string | null;
  packagePrice?: number | null;
  packageAllowanceAmount?: number | null;
  packageAllowanceUnit?: string | null;
  validityValue?: number | null;
  validityUnit?: string | null;
  autoRenew?: string | null;
  conditions?: TariffRuleCondition[];
};

type CustomTariffItem = {
  id?: number;
  label?: string | null;
  kind?: string | null;
  mode?: string | null;
  amount?: number | null;
  billingUnit?: string | null;
  notes?: string | null;
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
  rules?: Record<string, TariffRule[]>;
  customItems?: CustomTariffItem[];
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

function stripBillingPrefix(value: string) {
  return value.replace(/^每\s?/, "");
}

function hasMeaningfulBaseRate(rate: TariffRate | undefined) {
  if (!rate) return false;
  if (["free", "included_unlimited", "unavailable"].includes(rate.mode || "")) return true;
  if (rate.mode === "charged" || rate.mode === "included") {
    return typeof rate.amount === "number" && Number.isFinite(rate.amount) && rate.amount > 0;
  }
  return false;
}

function baseRateText(tariff: TariffDetail | null, code: TariffServiceCode) {
  const rate = tariff?.rates?.[code];
  if (!rate) return "未记录";

  if (rate.mode === "charged" && rate.amount !== null && rate.amount !== undefined) {
    const unit = getBillingUnitLabel(rate.billingUnit);
    return `${rate.amount} ${tariff?.currencyCode || ""}${unit ? ` / ${stripBillingPrefix(unit)}` : ""}`.trim();
  }

  if (rate.mode === "included" && rate.amount !== null && rate.amount !== undefined) {
    const unit = getBillingUnitLabel(rate.billingUnit);
    return `套餐内 ${rate.amount}${unit ? ` ${unit}` : ""}`;
  }

  return getTariffRateModeLabel(rate.mode || "unknown");
}

function countryLabel(code: string) {
  const country = COUNTRY_REGIONS.find((item) => item.code === code);
  return country ? `${country.name} · ${code}` : code;
}

function conditionValueText(condition: TariffRuleCondition) {
  if (condition.type === "network_scope") {
    return NETWORK_SCOPE_OPTIONS.find((item) => item.value === condition.value)?.label ?? condition.value;
  }

  if (condition.type === "destination") {
    return DESTINATION_SPECIAL_OPTIONS.find((item) => item.value === condition.value)?.label ?? countryLabel(condition.value);
  }

  if (condition.type === "roaming_region") {
    return condition.value === "OTHER" ? "其他国家 / 地区" : countryLabel(condition.value);
  }

  if (condition.type === "time_window") {
    return condition.value2 ? `${condition.value}–${condition.value2}` : condition.value;
  }

  return condition.value;
}

function ruleConditionText(rule: TariffRule) {
  const groups = new Map<string, string[]>();
  for (const condition of rule.conditions ?? []) {
    const values = groups.get(condition.type) ?? [];
    const value = conditionValueText(condition);
    if (!values.includes(value)) values.push(value);
    groups.set(condition.type, values);
  }

  if (!groups.size) return "全局适用";

  return Array.from(groups.entries())
    .map(([type, values]) => {
      const label = TARIFF_RULE_CONDITION_TYPES.find((item) => item.value === type)?.label ?? type;
      return `${label}：${values.join(" / ")}`;
    })
    .join(" · ");
}

function ruleValueText(rule: TariffRule, currencyCode: string | null | undefined) {
  if (rule.mode === "charged") {
    const unit = getBillingUnitLabel(rule.billingUnit);
    if (rule.amount === null || rule.amount === undefined) return "收费";
    return `${rule.amount} ${currencyCode || ""}${unit ? ` / ${stripBillingPrefix(unit)}` : ""}`.trim();
  }

  if (rule.mode === "included") {
    const unit = getBillingUnitLabel(rule.billingUnit);
    return rule.amount === null || rule.amount === undefined
      ? "套餐内包含"
      : `套餐内 ${rule.amount}${unit ? ` ${unit}` : ""}`;
  }

  if (rule.mode === "package") {
    const parts = [
      `套餐 / 通行证 ${formatMoney(rule.packagePrice, currencyCode)}`,
      rule.packageAllowanceAmount !== null && rule.packageAllowanceAmount !== undefined
        ? `含 ${rule.packageAllowanceAmount} ${getBillingUnitLabel(rule.packageAllowanceUnit)}`.trim()
        : "",
      periodLabel(rule.validityValue, rule.validityUnit) ? `有效 ${periodLabel(rule.validityValue, rule.validityUnit)}` : "",
      rule.autoRenew === "yes" ? "自动续订" : rule.autoRenew === "no" ? "不自动续订" : "",
    ].filter(Boolean);
    return parts.join(" · ");
  }

  return getTariffRateModeLabel(rule.mode || "unknown");
}

async function writeClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function CopyValue({
  value,
  className = "",
  align = "left",
}: {
  value: string;
  className?: string;
  align?: "left" | "right";
}) {
  const [copied, setCopied] = useState(false);
  const displayValue = value || "未记录";
  const copyable = Boolean(value) && value !== "未记录" && value !== "未设置";

  async function copy() {
    if (!copyable) return;
    try {
      await writeClipboard(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={!copyable}
      title={copyable ? "点击复制" : undefined}
      className={`group inline-flex max-w-full items-center gap-1.5 break-words ${align === "right" ? "justify-end text-right" : "justify-start text-left"} ${copyable ? "cursor-copy transition hover:text-slate-950" : "cursor-default"} ${className}`}
    >
      <span className="min-w-0 break-words">{displayValue}</span>
      {copyable ? copied ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
      ) : (
        <Copy className="h-3.5 w-3.5 shrink-0 text-slate-300 opacity-0 transition group-hover:opacity-100" />
      ) : null}
    </button>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3.5 py-3">
      <div className="text-[11px] text-slate-400">{label}</div>
      <CopyValue value={value} className="mt-1 text-sm font-medium text-slate-700" />
    </div>
  );
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <div className="mb-1 text-[11px] text-slate-400">{label}</div>
      <CopyValue value={value} className="text-sm leading-6 text-slate-600" />
    </div>
  );
}

function RuleCard({ rule, index, currencyCode }: { rule: TariffRule; index: number; currencyCode?: string | null }) {
  const [copied, setCopied] = useState(false);
  const label = rule.label || `特殊规则 ${index + 1}`;
  const conditions = ruleConditionText(rule);
  const value = ruleValueText(rule, currencyCode);
  const copyText = `${label} · ${conditions} · ${value}`;

  async function copy() {
    try {
      await writeClipboard(copyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title="点击复制整条规则"
      className="group w-full rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-left transition hover:border-slate-200 hover:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-medium text-slate-600">{label}</span>
        <span className="flex items-center gap-1 text-right text-[11px] font-medium text-slate-700">
          {value}
          {copied ? <Check className="h-3 w-3 shrink-0 text-emerald-600" /> : <Copy className="h-3 w-3 shrink-0 text-slate-300 opacity-0 transition group-hover:opacity-100" />}
        </span>
      </div>
      <div className="mt-1 text-[10px] leading-4 text-slate-400">{conditions}</div>
    </button>
  );
}

function RateGroup({ title, codes, tariff }: { title: string; codes: TariffServiceCode[]; tariff: TariffDetail | null }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="mb-3 text-sm font-medium text-slate-800">{title}</div>
      <div className="divide-y divide-slate-100">
        {codes.map((code) => {
          const service = TARIFF_SERVICES.find((item) => item.code === code)!;
          const rules = tariff?.rules?.[code] ?? [];
          const rate = tariff?.rates?.[code];
          const hasBaseRate = hasMeaningfulBaseRate(rate);
          return (
            <div key={code} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="text-xs text-slate-500">{service.label}</span>
                  {rules.length ? <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-600">{rules.length} 条规则</span> : null}
                </div>
                {rules.length ? hasBaseRate ? (
                  <CopyValue value={`基础资费：${baseRateText(tariff, code)}`} align="right" className="max-w-[65%] text-xs font-medium text-slate-700" />
                ) : (
                  <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">按条件计费</span>
                ) : (
                  <CopyValue value={baseRateText(tariff, code)} align="right" className="max-w-[65%] text-xs font-medium text-slate-700" />
                )}
              </div>
              {rules.length ? (
                <div className="mt-2 space-y-1.5 border-l-2 border-indigo-100 pl-2.5">
                  {rules.map((rule, index) => (
                    <RuleCard key={rule.id ?? `${code}-${index}`} rule={rule} index={index} currencyCode={tariff?.currencyCode} />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CustomItems({ tariff }: { tariff: TariffDetail }) {
  const items = tariff.customItems ?? [];
  if (!items.length) return null;

  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="mb-3 text-sm font-medium text-slate-800">其他自定义资费</div>
      <div className="divide-y divide-slate-100">
        {items.map((item, index) => {
          const unit = getBillingUnitLabel(item.billingUnit);
          const value = item.mode === "charged" && item.amount !== null && item.amount !== undefined
            ? `${item.amount} ${tariff.currencyCode || ""}${unit ? ` / ${stripBillingPrefix(unit)}` : ""}`.trim()
            : getTariffRateModeLabel(item.mode || "unknown");
          const fullValue = item.notes ? `${value} · ${item.notes}` : value;
          return (
            <div key={item.id ?? index} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
              <span className="text-xs text-slate-500">{item.label || `自定义资费 ${index + 1}`}</span>
              <CopyValue value={fullValue} align="right" className="max-w-[70%] text-xs font-medium text-slate-700" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  description,
  icon,
  open,
  onToggle,
  action,
}: {
  title: string;
  description?: string;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <button type="button" onClick={onToggle} className="group flex min-w-0 flex-1 items-start gap-2 text-left" title={open ? "收起" : "展开"}>
        <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`} />
        <span className="mt-0.5 shrink-0 text-slate-400">{icon}</span>
        <span className="min-w-0">
          <span className="block font-medium text-slate-900">{title}</span>
          {description ? <span className="mt-1 block text-xs font-normal leading-5 text-slate-400">{description}</span> : null}
        </span>
      </button>
      {action}
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
  const [basicOpen, setBasicOpen] = useState(true);
  const [identityOpen, setIdentityOpen] = useState(true);
  const [tariffOpen, setTariffOpen] = useState(true);

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
    <ModalPortal onBackdropClick={onClose}>
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
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <CopyValue value={sim.phoneNumber || ""} className="text-xs text-slate-400" />
              <CopyValue value={sim.carrierName} className="text-xs text-slate-400" />
              <CopyValue value={`${sim.country} · ${sim.countryCode}`} className="text-xs text-slate-400" />
              <CopyValue value={getSimTypeLabel(sim.simType)} className="text-xs text-slate-400" />
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto bg-white px-5 py-5 sm:px-6">
          <section className="space-y-3">
            <SectionHeader
              title="基本信息"
              icon={<Smartphone className="h-4 w-4" />}
              open={basicOpen}
              onToggle={() => setBasicOpen((value) => !value)}
              action={(
                <button type="button" onClick={onEdit} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50">
                  <Pencil className="h-3.5 w-3.5" />编辑号码
                </button>
              )}
            />

            {basicOpen ? (
              <>
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
                {sim.notes ? <CopyBlock label="号码备注" value={sim.notes} /> : null}
              </>
            ) : null}
          </section>

          <section className="space-y-3 border-t pt-6">
            <SectionHeader
              title="实名信息"
              description="备份号码开户 / KYC 时使用的实名主体、证件或辅助材料。"
              icon={<UserRoundCheck className="h-4 w-4" />}
              open={identityOpen}
              onToggle={() => setIdentityOpen((value) => !value)}
              action={(
                <button type="button" onClick={onEdit} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50">
                  <Pencil className="h-3.5 w-3.5" />编辑实名信息
                </button>
              )}
            />

            {identityOpen ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <DetailItem label="实名状态" value={getIdentityStatusLabel(sim.identityStatus)} />
                  <DetailItem label="实名姓名 / 主体" value={sim.identityName || "未记录"} />
                  <DetailItem label="证件 / 材料类型" value={getIdentityDocumentTypeLabel(sim.identityDocumentType, sim.identityDocumentTypeCustom)} />
                  <DetailItem label="证件 / 材料编号" value={sim.identityDocumentNumber || "未记录"} />
                  <DetailItem label="证件 / 材料国家 / 地区" value={sim.identityCountryCode ? countryLabel(sim.identityCountryCode) : "未记录"} />
                </div>
                {sim.identityNotes ? <CopyBlock label="实名备注" value={sim.identityNotes} /> : null}
              </>
            ) : null}
          </section>

          <KeepAliveOverviewSection simId={sim.id} />

          <section className="space-y-3 border-t pt-6">
            <SectionHeader
              title="资费概览"
              description="展示这张卡当前已记录的核心资费和特殊规则。"
              icon={<ReceiptText className="h-4 w-4" />}
              open={tariffOpen}
              onToggle={() => setTariffOpen((value) => !value)}
              action={(
                <button type="button" onClick={onEditTariff} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50">
                  <ReceiptText className="h-3.5 w-3.5" />编辑资费
                </button>
              )}
            />

            {tariffOpen ? loadingTariff ? (
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

                <CustomItems tariff={tariff} />

                {tariff.usageSummary ? <CopyBlock label="使用结论" value={tariff.usageSummary} /> : null}

                {(tariff.notes || tariff.sourceUrl) ? (
                  <div className="flex flex-col gap-3 rounded-xl border border-slate-100 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 text-[11px] text-slate-400">资费备注</div>
                      <CopyValue value={tariff.notes || "无额外资费备注"} className="text-xs leading-5 text-slate-500" />
                    </div>
                    {tariff.sourceUrl ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <CopyValue value={tariff.sourceUrl} className="text-xs font-medium text-slate-500" />
                        <a href={tariff.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-950">
                          打开来源 <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
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
            ) : null}
          </section>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-white px-5 py-4 sm:px-6">
          <div className="text-xs text-slate-400">创建于 {sim.createdAt.slice(0, 10)} · 更新于 {sim.updatedAt.slice(0, 10)}</div>
          <button type="button" onClick={onClose} className="h-9 rounded-lg border px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50">关闭</button>
        </div>
      </Card>
    </ModalPortal>
  );
}
