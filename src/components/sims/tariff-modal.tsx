"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ExternalLink, Globe2, Loader2, MessageSquareText, PhoneCall, ReceiptText, Trash2, Wifi, X } from "lucide-react";
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
  ROAMING_AVAILABILITY,
  TARIFF_PERIOD_UNITS,
  TARIFF_PLAN_TYPES,
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

type TariffForm = {
  planName: string;
  planType: string;
  currencyCode: string;
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
};

function createEmptyRates() {
  return Object.fromEntries(
    TARIFF_SERVICES.map((service) => [
      service.code,
      { mode: "unknown", amount: "", billingUnit: service.defaultUnit, legacyText: "" },
    ]),
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
  };
}

function conditionToForm(value: unknown): TariffRuleConditionFormValue | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const type = String(raw.type ?? "") as TariffRuleConditionType;
  if (!type) return null;
  return {
    type,
    value: String(raw.value ?? ""),
    value2: String(raw.value2 ?? ""),
  };
}

function ruleToForm(value: unknown, serviceCode: TariffServiceCode): TariffConditionalRuleFormValue | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const service = TARIFF_SERVICES.find((item) => item.code === serviceCode)!;
  const conditions = Array.isArray(raw.conditions)
    ? raw.conditions.map(conditionToForm).filter((item): item is TariffRuleConditionFormValue => Boolean(item))
    : [];
  if (!conditions.length) return null;

  return {
    label: String(raw.label ?? ""),
    mode: String(raw.mode ?? "charged"),
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

function tariffToForm(value: Record<string, unknown> | null, fallbackCurrency: string): TariffForm {
  if (!value) return createEmptyTariff(fallbackCurrency);

  const rawRates = value.rates && typeof value.rates === "object" ? (value.rates as Record<string, unknown>) : {};
  const rates = Object.fromEntries(
    TARIFF_SERVICES.map((service) => {
      const raw = rawRates[service.code] && typeof rawRates[service.code] === "object"
        ? (rawRates[service.code] as Record<string, unknown>)
        : {};
      return [
        service.code,
        {
          mode: String(raw.mode ?? "unknown"),
          amount: raw.amount === null || raw.amount === undefined ? "" : String(raw.amount),
          billingUnit: String(raw.billingUnit ?? service.defaultUnit),
          legacyText: String(raw.legacyText ?? ""),
        },
      ];
    }),
  ) as Record<TariffServiceCode, TariffRateFormValue>;

  const rawRules = value.rules && typeof value.rules === "object" ? (value.rules as Record<string, unknown>) : {};
  const rules = TARIFF_SERVICES.reduce((result, service) => {
    const list = Array.isArray(rawRules[service.code]) ? rawRules[service.code] as unknown[] : [];
    result[service.code] = list
      .map((item) => ruleToForm(item, service.code))
      .filter((item): item is TariffConditionalRuleFormValue => Boolean(item));
    return result;
  }, {} as Record<TariffServiceCode, TariffConditionalRuleFormValue[]>);

  return {
    planName: String(value.planName ?? ""),
    planType: String(value.planType ?? "unknown"),
    currencyCode: String(value.currencyCode ?? fallbackCurrency),
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

function MoneyInput({
  currencyCode,
  value,
  onChange,
  placeholder = "0.00",
}: {
  currencyCode: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex h-10 overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-100">
      <div className="flex min-w-[58px] items-center justify-center border-r border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-500">
        {currencyCode}
      </div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-700 outline-none placeholder:text-slate-300"
      />
    </div>
  );
}

export function TariffModal({ sim, onClose, onSaved }: { sim: SimSummary; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const fallbackCurrency = useMemo(
    () => sim.currencyCode || getDefaultCurrency(sim.countryCode),
    [sim.countryCode, sim.currencyCode],
  );
  const [form, setForm] = useState<TariffForm>(() => createEmptyTariff(fallbackCurrency));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasTariff, setHasTariff] = useState(false);
  const [error, setError] = useState("");

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
        setHasTariff(Boolean(data.tariff));
        setForm(tariffToForm(data.tariff, fallbackCurrency));
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

  function setField<K extends Exclude<keyof TariffForm, "rates" | "rules">>(field: K, value: TariffForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function setRate(serviceCode: TariffServiceCode, value: TariffRateFormValue) {
    setForm((current) => ({
      ...current,
      rates: { ...current.rates, [serviceCode]: value },
    }));
  }

  function setRules(serviceCode: TariffServiceCode, value: TariffConditionalRuleFormValue[]) {
    setForm((current) => ({
      ...current,
      rules: { ...current.rules, [serviceCode]: value },
    }));
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
      setHasTariff(true);
      setForm(tariffToForm(data.tariff, fallbackCurrency));
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

  const selectClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100";
  const localServices = TARIFF_SERVICES.filter((service) => service.group === "local");
  const internationalServices = TARIFF_SERVICES.filter((service) => service.group === "international");
  const roamingServices = TARIFF_SERVICES.filter((service) => service.group === "roaming");

  const renderService = (service: (typeof TARIFF_SERVICES)[number]) => (
    <TariffServiceEditor
      key={service.code}
      serviceCode={service.code}
      label={service.label}
      currencyCode={form.currencyCode}
      baseRate={form.rates[service.code]}
      rules={form.rules[service.code]}
      onBaseRateChange={(value) => setRate(service.code, value)}
      onRulesChange={(value) => setRules(service.code, value)}
    />
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/35 p-4 backdrop-blur-sm">
      <Card className="my-4 w-full max-w-6xl overflow-hidden shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b bg-white px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <ReceiptText className="h-4 w-4" />
              资费信息
            </div>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{sim.label}</h3>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
              <span>{sim.phoneNumber || "未填写号码"}</span>
              <span>{sim.carrierName}</span>
              <span>{sim.country} · {sim.countryCode}</span>
            </div>
          </div>
          <button onClick={onClose} disabled={saving} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex min-h-96 items-center justify-center text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            正在加载资费信息…
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-6 bg-white p-6">
            <section className="space-y-4">
              <div>
                <h4 className="font-medium text-slate-900">套餐概况</h4>
                <p className="mt-1 text-xs text-slate-400">基础信息只记录当前号码的主套餐；一次性通行证和分地区价格请在对应项目中添加条件资费。</p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">套餐 / 资费名称</span>
                  <Input value={form.planName} onChange={(event) => setField("planName", event.target.value)} placeholder="可选，填写运营商套餐名称" />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">套餐类型</span>
                  <select value={form.planType} onChange={(event) => setField("planType", event.target.value)} className={selectClass}>
                    {TARIFF_PLAN_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">计费币种</span>
                  <select value={form.currencyCode} onChange={(event) => setField("currencyCode", event.target.value)} className={selectClass}>
                    {CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} · {currency.label}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">基础 / 月费</span>
                  <MoneyInput currencyCode={form.currencyCode} value={form.recurringFee} onChange={(value) => setField("recurringFee", value)} />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">计费周期</span>
                  <div className="grid grid-cols-[1fr_92px] gap-2">
                    <Input value={form.recurringPeriodValue} onChange={(event) => setField("recurringPeriodValue", event.target.value)} type="number" min="1" step="1" inputMode="numeric" placeholder="例如 30" />
                    <select value={form.recurringPeriodUnit} onChange={(event) => setField("recurringPeriodUnit", event.target.value)} className={selectClass}>
                      <option value="">单位</option>
                      {TARIFF_PERIOD_UNITS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </div>
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">行政 / 附加费</span>
                  <MoneyInput currencyCode={form.currencyCode} value={form.administrationFee} onChange={(value) => setField("administrationFee", value)} />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">续订方式</span>
                  <select value={form.autoRenew} onChange={(event) => setField("autoRenew", event.target.value)} className={selectClass}>
                    {AUTO_RENEW_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">国际漫游</span>
                  <select value={form.roamingAvailable} onChange={(event) => setField("roamingAvailable", event.target.value)} className={selectClass}>
                    {ROAMING_AVAILABILITY.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
              </div>

              <label className="block space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">使用结论</span>
                <textarea value={form.usageSummary} onChange={(event) => setField("usageSummary", event.target.value)} rows={2} placeholder="可选，例如：适合长期保号和接验证码；不建议用于漫游通话或数据" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
              </label>
            </section>

            <section className="space-y-4 border-t pt-6">
              <div className="flex items-center gap-2"><PhoneCall className="h-4 w-4 text-slate-400" /><h4 className="font-medium text-slate-900">本地使用</h4></div>
              <p className="text-xs text-slate-400">没有分档时只填写默认资费；同网/异网或分时段收费时，再添加条件资费。</p>
              {localServices.map(renderService)}
            </section>

            <section className="space-y-4 border-t pt-6">
              <div className="flex items-center gap-2"><Globe2 className="h-4 w-4 text-slate-400" /><h4 className="font-medium text-slate-900">国际使用</h4></div>
              <p className="text-xs text-slate-400">可以按目的国家/地区分别保存国际电话或短信价格。</p>
              {internationalServices.map(renderService)}
            </section>

            <section className="space-y-4 border-t pt-6">
              <div className="flex items-center gap-2"><Wifi className="h-4 w-4 text-slate-400" /><h4 className="font-medium text-slate-900">国际漫游</h4></div>
              <p className="text-xs text-slate-400">条件规则可以组合漫游地区与目的地；套餐/通行证还可记录价格、包含量、有效期和续订方式。</p>
              {roamingServices.map(renderService)}
            </section>

            <section className="space-y-4 border-t pt-6">
              <div className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-slate-400" /><h4 className="font-medium text-slate-900">来源与备注</h4></div>
              <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">资费来源</span>
                  <div className="flex gap-2">
                    <Input value={form.sourceUrl} onChange={(event) => setField("sourceUrl", event.target.value)} placeholder="运营商官网资费页面链接" />
                    {isSafeSourceUrl(form.sourceUrl) ? <a href={form.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-slate-500 transition hover:bg-slate-50 hover:text-slate-900" title="打开来源"><ExternalLink className="h-4 w-4" /></a> : null}
                  </div>
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">最后确认日期</span>
                  <Input value={form.verifiedAt} onChange={(event) => setField("verifiedAt", event.target.value)} type="date" />
                </label>
              </div>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">资费备注</span>
                <textarea value={form.notes} onChange={(event) => setField("notes", event.target.value)} rows={3} placeholder="可选：只记录无法结构化的例外条款或说明" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
              </label>
            </section>

            {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

            <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div>{hasTariff ? <button type="button" onClick={() => void removeTariff()} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-200 px-4 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-4 w-4" />清空资费信息</button> : null}</div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">取消</button>
                <button type="submit" disabled={saving} className="inline-flex h-10 min-w-28 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}保存资费</button>
              </div>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
