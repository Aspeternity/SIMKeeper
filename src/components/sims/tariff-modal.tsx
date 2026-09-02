"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Loader2, MessageSquareText, Plus, ReceiptText, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { TariffRateFormValue } from "@/components/sims/tariff-rate-row";
import {
  TariffServiceEditor,
  type TariffConditionalRuleFormValue,
  type TariffRuleConditionFormValue,
} from "@/components/sims/tariff-service-editor";
import { CURRENCIES, getDefaultCurrency } from "@/lib/sim-options";
import {
  AUTO_RENEW_OPTIONS,
  CUSTOM_TARIFF_KINDS,
  getCustomBillingUnits,
  ROAMING_AVAILABILITY,
  TARIFF_PERIOD_UNITS,
  TARIFF_PLAN_TYPES,
  TARIFF_RATE_MODES,
  TARIFF_SERVICES,
  type TariffRuleConditionType,
  type TariffServiceCode,
} from "@/lib/tariff-options";

type SimSummary = {
  id: number;
  label: string;
  phoneNumber: string | null;
  carrierName: string;
  country: string;
  countryCode: string;
  currencyCode: string | null;
};

type CustomTariffItemFormValue = {
  label: string;
  kind: string;
  mode: string;
  amount: string;
  billingUnit: string;
  notes: string;
};

type TariffForm = {
  planName: string;
  planType: string;
  currencyCode: string;
  purchaseCost: string;
  recurringFee: string;
  recurringPeriodValue: string;
  recurringPeriodUnit: string;
  administrationFee: string;
  autoRenew: string;
  roamingAvailable: string;
  usageSummary: string;
  sourceUrl: string;
  verifiedAt: string;
  notes: string;
  rates: Record<TariffServiceCode, TariffRateFormValue>;
  rules: Record<TariffServiceCode, TariffConditionalRuleFormValue[]>;
  customItems: CustomTariffItemFormValue[];
};

const LOCAL_CORE_SERVICE_CODES: TariffServiceCode[] = [
  "localOutgoingCall",
  "localIncomingCall",
  "localOutgoingSms",
  "localIncomingSms",
  "localData",
];

const ROAMING_CORE_SERVICE_CODES: TariffServiceCode[] = [
  "roamingOutgoingCall",
  "roamingIncomingCall",
  "roamingOutgoingSms",
  "roamingIncomingSms",
  "roamingData",
];

const CORE_SERVICE_CODES: TariffServiceCode[] = [
  ...LOCAL_CORE_SERVICE_CODES,
  ...ROAMING_CORE_SERVICE_CODES,
];

const EXTENSION_SERVICE_CODES = TARIFF_SERVICES
  .map((item) => item.code)
  .filter((code) => !CORE_SERVICE_CODES.includes(code)) as TariffServiceCode[];

const selectClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100";

function createEmptyRates() {
  return Object.fromEntries(
    TARIFF_SERVICES.map((service) => [service.code, { mode: "unknown", amount: "", billingUnit: service.defaultUnit, legacyText: "" }]),
  ) as Record<TariffServiceCode, TariffRateFormValue>;
}

function createEmptyRules() {
  return TARIFF_SERVICES.reduce((result, service) => {
    result[service.code] = [];
    return result;
  }, {} as Record<TariffServiceCode, TariffConditionalRuleFormValue[]>);
}

function createEmptyTariff(currencyCode: string): TariffForm {
  return {
    planName: "",
    planType: "unknown",
    currencyCode,
    purchaseCost: "",
    recurringFee: "",
    recurringPeriodValue: "",
    recurringPeriodUnit: "",
    administrationFee: "",
    autoRenew: "unknown",
    roamingAvailable: "unknown",
    usageSummary: "",
    sourceUrl: "",
    verifiedAt: "",
    notes: "",
    rates: createEmptyRates(),
    rules: createEmptyRules(),
    customItems: [],
  };
}

function conditionToForm(value: unknown): TariffRuleConditionFormValue | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const type = String(raw.type ?? "") as TariffRuleConditionType;
  if (!type) return null;
  return { type, value: String(raw.value ?? ""), value2: String(raw.value2 ?? "") };
}

function ruleToForm(value: unknown, serviceCode: TariffServiceCode): TariffConditionalRuleFormValue | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const service = TARIFF_SERVICES.find((item) => item.code === serviceCode)!;
  const mode = String(raw.mode ?? "charged");
  const conditions = Array.isArray(raw.conditions)
    ? raw.conditions.map(conditionToForm).filter((item): item is TariffRuleConditionFormValue => Boolean(item))
    : [];
  if (!conditions.length && mode !== "package") return null;

  return {
    label: String(raw.label ?? ""),
    mode,
    amount: raw.amount === null || raw.amount === undefined ? "" : String(raw.amount),
    billingUnit: String(raw.billingUnit ?? service.defaultUnit),
    packagePrice: raw.packagePrice === null || raw.packagePrice === undefined ? "" : String(raw.packagePrice),
    packageAllowanceAmount: raw.packageAllowanceAmount === null || raw.packageAllowanceAmount === undefined ? "" : String(raw.packageAllowanceAmount),
    packageAllowanceUnit: String(raw.packageAllowanceUnit ?? service.defaultAllowanceUnit),
    validityValue: raw.validityValue === null || raw.validityValue === undefined ? "" : String(raw.validityValue),
    validityUnit: String(raw.validityUnit ?? ""),
    autoRenew: String(raw.autoRenew ?? "unknown"),
    conditions,
  };
}

function customItemToForm(value: unknown): CustomTariffItemFormValue | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const kind = String(raw.kind ?? "generic");
  return {
    label: String(raw.label ?? ""),
    kind,
    mode: String(raw.mode ?? "unknown"),
    amount: raw.amount === null || raw.amount === undefined ? "" : String(raw.amount),
    billingUnit: String(raw.billingUnit ?? getCustomBillingUnits(kind)[0]?.value ?? "one_time"),
    notes: String(raw.notes ?? ""),
  };
}

function tariffToForm(value: Record<string, unknown> | null, fallbackCurrency: string): TariffForm {
  if (!value) return createEmptyTariff(fallbackCurrency);

  const rawRates = value.rates && typeof value.rates === "object" ? value.rates as Record<string, unknown> : {};
  const rates = Object.fromEntries(
    TARIFF_SERVICES.map((service) => {
      const raw = rawRates[service.code] && typeof rawRates[service.code] === "object"
        ? rawRates[service.code] as Record<string, unknown>
        : {};
      return [service.code, {
        mode: String(raw.mode ?? "unknown"),
        amount: raw.amount === null || raw.amount === undefined ? "" : String(raw.amount),
        billingUnit: String(raw.billingUnit ?? service.defaultUnit),
        legacyText: String(raw.legacyText ?? ""),
      }];
    }),
  ) as Record<TariffServiceCode, TariffRateFormValue>;

  const rawRules = value.rules && typeof value.rules === "object" ? value.rules as Record<string, unknown> : {};
  const rules = TARIFF_SERVICES.reduce((result, service) => {
    const list = Array.isArray(rawRules[service.code]) ? rawRules[service.code] as unknown[] : [];
    result[service.code] = list
      .map((item) => ruleToForm(item, service.code))
      .filter((item): item is TariffConditionalRuleFormValue => Boolean(item));
    return result;
  }, {} as Record<TariffServiceCode, TariffConditionalRuleFormValue[]>);

  const customItems = Array.isArray(value.customItems)
    ? value.customItems.map(customItemToForm).filter((item): item is CustomTariffItemFormValue => Boolean(item))
    : [];

  return {
    planName: String(value.planName ?? ""),
    planType: String(value.planType ?? "unknown"),
    currencyCode: String(value.currencyCode ?? fallbackCurrency),
    purchaseCost: value.purchaseCost === null || value.purchaseCost === undefined ? "" : String(value.purchaseCost),
    recurringFee: value.recurringFee === null || value.recurringFee === undefined ? "" : String(value.recurringFee),
    recurringPeriodValue: value.recurringPeriodValue === null || value.recurringPeriodValue === undefined ? "" : String(value.recurringPeriodValue),
    recurringPeriodUnit: String(value.recurringPeriodUnit ?? ""),
    administrationFee: value.administrationFee === null || value.administrationFee === undefined ? "" : String(value.administrationFee),
    autoRenew: String(value.autoRenew ?? "unknown"),
    roamingAvailable: String(value.roamingAvailable ?? "unknown"),
    usageSummary: String(value.usageSummary ?? ""),
    sourceUrl: String(value.sourceUrl ?? ""),
    verifiedAt: String(value.verifiedAt ?? ""),
    notes: String(value.notes ?? ""),
    rates,
    rules,
    customItems,
  };
}

function isSafeSourceUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function hasServiceData(form: TariffForm, code: TariffServiceCode) {
  return form.rates[code].mode !== "unknown" || Boolean(form.rates[code].legacyText) || form.rules[code].length > 0;
}

function MoneyInput({ currencyCode, value, onChange, placeholder = "0.00" }: { currencyCode: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div className="flex h-10 overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-100">
      <input value={value} onChange={(event) => onChange(event.target.value)} type="number" min="0" step="any" inputMode="decimal" placeholder={placeholder} className="min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-700 outline-none placeholder:text-slate-300" />
      <div className="flex min-w-[58px] items-center justify-center border-l border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-500">{currencyCode}</div>
    </div>
  );
}

function CustomTariffRow({
  value,
  currencyCode,
  onChange,
  onRemove,
}: {
  value: CustomTariffItemFormValue;
  currencyCode: string;
  onChange: (value: CustomTariffItemFormValue) => void;
  onRemove: () => void;
}) {
  const units = getCustomBillingUnits(value.kind);
  const charged = value.mode === "charged";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="grid gap-2.5 lg:grid-cols-[minmax(160px,1.2fr)_120px_130px_minmax(260px,1.5fr)_36px] lg:items-center">
        <Input value={value.label} onChange={(event) => onChange({ ...value, label: event.target.value })} placeholder="自定义资费名称" />
        <select value={value.kind} onChange={(event) => { const kind = event.target.value; onChange({ ...value, kind, billingUnit: getCustomBillingUnits(kind)[0]?.value ?? "one_time" }); }} className={selectClass}>
          {CUSTOM_TARIFF_KINDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select value={value.mode} onChange={(event) => onChange({ ...value, mode: event.target.value, amount: event.target.value === "charged" ? value.amount : "" })} className={selectClass}>
          {TARIFF_RATE_MODES.filter((item) => ["unknown", "free", "charged", "unavailable"].includes(item.value)).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        {charged ? (
          <div className="flex h-10 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <input value={value.amount} onChange={(event) => onChange({ ...value, amount: event.target.value })} type="number" min="0" step="any" inputMode="decimal" placeholder="0.00" className="min-w-0 flex-1 px-3 text-sm outline-none" />
            <span className="flex items-center border-l border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-500">{currencyCode}</span>
            <select value={value.billingUnit} onChange={(event) => onChange({ ...value, billingUnit: event.target.value })} className="min-w-[96px] border-l border-slate-200 bg-slate-50 px-2 text-xs text-slate-600 outline-none">
              {units.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
        ) : (
          <Input value={value.notes} onChange={(event) => onChange({ ...value, notes: event.target.value })} placeholder="备注（可选）" />
        )}
        <button type="button" onClick={onRemove} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
      </div>
      {charged ? <Input value={value.notes} onChange={(event) => onChange({ ...value, notes: event.target.value })} placeholder="备注（可选）" className="mt-2" /> : null}
    </div>
  );
}

export function TariffModal({ sim, onClose, onSaved }: { sim: SimSummary; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const fallbackCurrency = useMemo(() => sim.currencyCode || getDefaultCurrency(sim.countryCode), [sim.countryCode, sim.currencyCode]);
  const [mounted, setMounted] = useState(false);
  const [form, setForm] = useState<TariffForm>(() => createEmptyTariff(fallbackCurrency));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasTariff, setHasTariff] = useState(false);
  const [error, setError] = useState("");
  const [enabledExtensions, setEnabledExtensions] = useState<TariffServiceCode[]>([]);
  const [extensionToAdd, setExtensionToAdd] = useState("");

  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/tariffs?simId=${sim.id}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "资费信息加载失败");
        if (!active) return;
        const nextForm = tariffToForm(data.tariff, fallbackCurrency);
        setHasTariff(Boolean(data.tariff));
        setForm(nextForm);
        setEnabledExtensions(EXTENSION_SERVICE_CODES.filter((code) => hasServiceData(nextForm, code)));
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "资费信息加载失败");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [fallbackCurrency, sim.id]);

  function setField<K extends Exclude<keyof TariffForm, "rates" | "rules" | "customItems">>(field: K, value: TariffForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function setRate(serviceCode: TariffServiceCode, value: TariffRateFormValue) {
    setForm((current) => ({ ...current, rates: { ...current.rates, [serviceCode]: value } }));
  }

  function setRules(serviceCode: TariffServiceCode, value: TariffConditionalRuleFormValue[]) {
    setForm((current) => ({ ...current, rules: { ...current.rules, [serviceCode]: value } }));
  }

  function removeExtension(code: TariffServiceCode) {
    const service = TARIFF_SERVICES.find((item) => item.code === code)!;
    setForm((current) => ({
      ...current,
      rates: { ...current.rates, [code]: { mode: "unknown", amount: "", billingUnit: service.defaultUnit, legacyText: "" } },
      rules: { ...current.rules, [code]: [] },
    }));
    setEnabledExtensions((current) => current.filter((item) => item !== code));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/tariffs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simId: sim.id, ...form }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "资费信息保存失败");
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "资费信息保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function removeTariff() {
    if (!hasTariff || !window.confirm(`确定清空“${sim.label}”的全部资费信息吗？`)) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/tariffs?simId=${sim.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除资费信息失败");
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除资费信息失败");
    } finally {
      setSaving(false);
    }
  }

  const renderService = (code: TariffServiceCode) => {
    const service = TARIFF_SERVICES.find((item) => item.code === code)!;
    return (
      <TariffServiceEditor
        key={code}
        serviceCode={code}
        label={service.label}
        currencyCode={form.currencyCode}
        baseRate={form.rates[code]}
        rules={form.rules[code]}
        onBaseRateChange={(value) => setRate(code, value)}
        onRulesChange={(value) => setRules(code, value)}
      />
    );
  };

  const availableExtensions = EXTENSION_SERVICE_CODES.filter((code) => !enabledExtensions.includes(code));

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex h-[100dvh] items-stretch justify-center bg-slate-950/40 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (!saving && event.target === event.currentTarget) onClose();
      }}
    >
      <Card className="flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden rounded-none border-0 shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl sm:border">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b bg-white px-5 py-4 sm:px-6">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500"><ReceiptText className="h-4 w-4" />资费信息</div>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{sim.label}</h3>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400"><span>{sim.phoneNumber || "未填写号码"}</span><span>{sim.carrierName}</span><span>{sim.country} · {sim.countryCode}</span></div>
          </div>
          <button onClick={onClose} disabled={saving} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"><X className="h-4 w-4" /></button>
        </div>

        {loading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center bg-white text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载资费信息…</div>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col bg-white">
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
              <section className="space-y-4">
                <div>
                  <h4 className="font-medium text-slate-900">资费概况</h4>
                  <p className="mt-1 text-xs text-slate-400">只记录长期稳定的核心信息。购卡费用为一次性成本，不参与续订周期。</p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <label className="space-y-1.5 text-sm"><span className="font-medium text-slate-700">套餐 / 资费名称</span><Input value={form.planName} onChange={(event) => setField("planName", event.target.value)} placeholder="可选" /></label>
                  <label className="space-y-1.5 text-sm"><span className="font-medium text-slate-700">套餐类型</span><select value={form.planType} onChange={(event) => setField("planType", event.target.value)} className={selectClass}>{TARIFF_PLAN_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <label className="space-y-1.5 text-sm"><span className="font-medium text-slate-700">计费币种</span><select value={form.currencyCode} onChange={(event) => setField("currencyCode", event.target.value)} className={selectClass}>{CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} · {currency.label}</option>)}</select></label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="space-y-1.5 text-sm"><span className="font-medium text-slate-700">购卡费用</span><MoneyInput currencyCode={form.currencyCode} value={form.purchaseCost} onChange={(value) => setField("purchaseCost", value)} /></label>
                  <label className="space-y-1.5 text-sm"><span className="font-medium text-slate-700">基础 / 月费</span><MoneyInput currencyCode={form.currencyCode} value={form.recurringFee} onChange={(value) => setField("recurringFee", value)} /></label>
                  <label className="space-y-1.5 text-sm"><span className="font-medium text-slate-700">计费周期</span><div className="flex h-10 overflow-hidden rounded-xl border border-slate-200 bg-white"><input value={form.recurringPeriodValue} onChange={(event) => setField("recurringPeriodValue", event.target.value)} type="number" min="1" step="1" inputMode="numeric" placeholder="例如 30" className="min-w-0 flex-1 px-3 text-sm outline-none" /><select value={form.recurringPeriodUnit} onChange={(event) => setField("recurringPeriodUnit", event.target.value)} className="min-w-[92px] border-l border-slate-200 bg-slate-50 px-2 text-xs text-slate-600 outline-none"><option value="">单位</option>{TARIFF_PERIOD_UNITS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div></label>
                  <label className="space-y-1.5 text-sm"><span className="font-medium text-slate-700">行政 / 附加费</span><MoneyInput currencyCode={form.currencyCode} value={form.administrationFee} onChange={(value) => setField("administrationFee", value)} /></label>
                  <label className="space-y-1.5 text-sm"><span className="font-medium text-slate-700">续订方式</span><select value={form.autoRenew} onChange={(event) => setField("autoRenew", event.target.value)} className={selectClass}>{AUTO_RENEW_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <label className="space-y-1.5 text-sm"><span className="font-medium text-slate-700">国际漫游</span><select value={form.roamingAvailable} onChange={(event) => setField("roamingAvailable", event.target.value)} className={selectClass}>{ROAMING_AVAILABILITY.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                </div>

                <label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">使用结论</span><textarea value={form.usageSummary} onChange={(event) => setField("usageSummary", event.target.value)} rows={2} placeholder="可选，例如：适合长期保号和接验证码" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100" /></label>
              </section>

              <section className="space-y-4 border-t pt-6">
                <div><h4 className="font-medium text-slate-900">常用资费</h4><p className="mt-1 text-xs text-slate-400">默认覆盖本地和漫游最常查询的通话、短信与数据资费；特殊分档请在对应项目的“特殊规则”里维护。</p></div>
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">本地使用</div>
                  {LOCAL_CORE_SERVICE_CODES.map(renderService)}
                </div>
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">国际漫游</div>
                  {ROAMING_CORE_SERVICE_CODES.map(renderService)}
                </div>
              </section>

              <section className="space-y-3 border-t pt-6">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                  <div><h4 className="font-medium text-slate-900">扩展资费</h4><p className="mt-1 text-xs text-slate-400">国际电话、国际短信等非日常项目只有需要时才添加。</p></div>
                  {availableExtensions.length ? (
                    <div className="flex gap-2">
                      <select value={extensionToAdd} onChange={(event) => setExtensionToAdd(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 outline-none"><option value="">选择扩展项目</option>{availableExtensions.map((code) => { const service = TARIFF_SERVICES.find((item) => item.code === code)!; return <option key={code} value={code}>{service.label}</option>; })}</select>
                      <button type="button" disabled={!extensionToAdd} onClick={() => { const code = extensionToAdd as TariffServiceCode; setEnabledExtensions((current) => [...current, code]); setExtensionToAdd(""); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"><Plus className="h-3.5 w-3.5" />添加</button>
                    </div>
                  ) : null}
                </div>
                {enabledExtensions.length ? (
                  <div className="space-y-3">
                    {enabledExtensions.map((code) => (
                      <div key={code} className="rounded-xl border border-slate-100 bg-slate-50/40 p-2.5">
                        <div className="mb-2 flex justify-end"><button type="button" onClick={() => removeExtension(code)} className="text-xs text-slate-400 transition hover:text-rose-600">移除该扩展项</button></div>
                        {renderService(code)}
                      </div>
                    ))}
                  </div>
                ) : <div className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-xs text-slate-400">没有添加扩展资费。大多数号码保持这样即可。</div>}
              </section>

              <section className="space-y-3 border-t pt-6">
                <div className="flex items-center justify-between gap-3">
                  <div><h4 className="font-medium text-slate-900">自定义资费项</h4><p className="mt-1 text-xs text-slate-400">仅用于模板没有覆盖的特殊收费项目。</p></div>
                  <button type="button" onClick={() => setForm((current) => ({ ...current, customItems: [...current.customItems, { label: "", kind: "generic", mode: "unknown", amount: "", billingUnit: "one_time", notes: "" }] }))} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"><Plus className="h-3.5 w-3.5" />添加自定义项</button>
                </div>
                {form.customItems.length ? <div className="space-y-2">{form.customItems.map((item, index) => <CustomTariffRow key={index} value={item} currencyCode={form.currencyCode} onChange={(next) => setForm((current) => ({ ...current, customItems: current.customItems.map((value, itemIndex) => itemIndex === index ? next : value) }))} onRemove={() => setForm((current) => ({ ...current, customItems: current.customItems.filter((_, itemIndex) => itemIndex !== index) }))} />)}</div> : null}
              </section>

              <section className="space-y-4 border-t pt-6">
                <div className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-slate-400" /><h4 className="font-medium text-slate-900">来源与备注</h4></div>
                <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                  <label className="space-y-1.5 text-sm"><span className="font-medium text-slate-700">资费来源</span><div className="flex gap-2"><Input value={form.sourceUrl} onChange={(event) => setField("sourceUrl", event.target.value)} placeholder="运营商官网资费页面链接" />{isSafeSourceUrl(form.sourceUrl) ? <a href={form.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-slate-500 transition hover:bg-slate-50 hover:text-slate-900" title="打开来源"><ExternalLink className="h-4 w-4" /></a> : null}</div></label>
                  <label className="space-y-1.5 text-sm"><span className="font-medium text-slate-700">最后确认日期</span><Input value={form.verifiedAt} onChange={(event) => setField("verifiedAt", event.target.value)} type="date" /></label>
                </div>
                <label className="block space-y-1.5 text-sm"><span className="font-medium text-slate-700">资费备注</span><textarea value={form.notes} onChange={(event) => setField("notes", event.target.value)} rows={3} placeholder="只记录无法结构化的例外条款或临时促销" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100" /></label>
              </section>

              {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>{hasTariff ? <button type="button" onClick={() => void removeTariff()} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-200 px-4 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-4 w-4" />清空资费信息</button> : null}</div>
              <div className="flex justify-end gap-2"><button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">取消</button><button type="submit" disabled={saving} className="inline-flex h-10 min-w-28 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}保存资费</button></div>
            </div>
          </form>
        )}
      </Card>
    </div>,
    document.body,
  );
}
