"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ExternalLink, Globe2, Loader2, MessageSquareText, PhoneCall, ReceiptText, Trash2, Wifi, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TariffRateRow, type TariffRateFormValue } from "@/components/sims/tariff-rate-row";
import { CURRENCIES, getDefaultCurrency } from "@/lib/sim-options";
import { ROAMING_AVAILABILITY, TARIFF_SERVICES, type TariffServiceCode } from "@/lib/tariff-options";

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
  currencyCode: string;
  roamingAvailable: string;
  usageSummary: string;
  sourceUrl: string;
  verifiedAt: string;
  notes: string;
  rates: Record<TariffServiceCode, TariffRateFormValue>;
};

function createEmptyRates() {
  return Object.fromEntries(
    TARIFF_SERVICES.map((service) => [
      service.code,
      { mode: "unknown", amount: "", billingUnit: service.defaultUnit, legacyText: "" },
    ]),
  ) as Record<TariffServiceCode, TariffRateFormValue>;
}

function createEmptyTariff(currencyCode: string): TariffForm {
  return {
    planName: "",
    currencyCode,
    roamingAvailable: "unknown",
    usageSummary: "",
    sourceUrl: "",
    verifiedAt: "",
    notes: "",
    rates: createEmptyRates(),
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

  return {
    planName: String(value.planName ?? ""),
    currencyCode: String(value.currencyCode ?? fallbackCurrency),
    roamingAvailable: String(value.roamingAvailable ?? "unknown"),
    usageSummary: String(value.usageSummary ?? ""),
    sourceUrl: String(value.sourceUrl ?? ""),
    verifiedAt: String(value.verifiedAt ?? ""),
    notes: String(value.notes ?? ""),
    rates,
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

  function setField<K extends Exclude<keyof TariffForm, "rates">>(field: K, value: TariffForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function setRate(serviceCode: TariffServiceCode, value: TariffRateFormValue) {
    setForm((current) => ({
      ...current,
      rates: {
        ...current.rates,
        [serviceCode]: value,
      },
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

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/35 p-4 backdrop-blur-sm">
      <Card className="my-4 w-full max-w-5xl overflow-hidden shadow-2xl">
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
                <h4 className="font-medium text-slate-900">资费档案</h4>
                <p className="mt-1 text-xs text-slate-400">资费项目全部使用统一状态、金额和计费单位；只有实际金额需要手动输入。</p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">套餐 / 资费名称</span>
                  <Input value={form.planName} onChange={(event) => setField("planName", event.target.value)} placeholder="可选，如预付费基础资费" />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">计费币种</span>
                  <select value={form.currencyCode} onChange={(event) => setField("currencyCode", event.target.value)} className={selectClass}>
                    {CURRENCIES.map((currency) => (
                      <option key={currency.code} value={currency.code}>{currency.code} · {currency.label}</option>
                    ))}
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
                <textarea
                  value={form.usageSummary}
                  onChange={(event) => setField("usageSummary", event.target.value)}
                  rows={2}
                  placeholder="可选，例如：适合长期保号和接验证码；不建议用于漫游通话或数据"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                />
              </label>
            </section>

            <section className="space-y-3 border-t pt-6">
              <div className="flex items-center gap-2">
                <PhoneCall className="h-4 w-4 text-slate-400" />
                <h4 className="font-medium text-slate-900">本地使用</h4>
              </div>
              {localServices.map((service) => (
                <TariffRateRow
                  key={service.code}
                  serviceCode={service.code}
                  label={service.label}
                  currencyCode={form.currencyCode}
                  value={form.rates[service.code]}
                  onChange={(value) => setRate(service.code, value)}
                />
              ))}
            </section>

            <section className="space-y-3 border-t pt-6">
              <div className="flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-slate-400" />
                <h4 className="font-medium text-slate-900">国际使用</h4>
              </div>
              {internationalServices.map((service) => (
                <TariffRateRow
                  key={service.code}
                  serviceCode={service.code}
                  label={service.label}
                  currencyCode={form.currencyCode}
                  value={form.rates[service.code]}
                  onChange={(value) => setRate(service.code, value)}
                />
              ))}
            </section>

            <section className="space-y-3 border-t pt-6">
              <div className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-slate-400" />
                <h4 className="font-medium text-slate-900">国际漫游</h4>
              </div>
              {roamingServices.map((service) => (
                <TariffRateRow
                  key={service.code}
                  serviceCode={service.code}
                  label={service.label}
                  currencyCode={form.currencyCode}
                  value={form.rates[service.code]}
                  onChange={(value) => setRate(service.code, value)}
                />
              ))}
            </section>

            <section className="space-y-4 border-t pt-6">
              <div className="flex items-center gap-2">
                <MessageSquareText className="h-4 w-4 text-slate-400" />
                <h4 className="font-medium text-slate-900">来源与备注</h4>
              </div>
              <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">资费来源</span>
                  <div className="flex gap-2">
                    <Input value={form.sourceUrl} onChange={(event) => setField("sourceUrl", event.target.value)} placeholder="运营商官网资费页面链接" />
                    {isSafeSourceUrl(form.sourceUrl) ? (
                      <a href={form.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-slate-500 transition hover:bg-slate-50 hover:text-slate-900" title="打开来源">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : null}
                  </div>
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">最后确认日期</span>
                  <Input value={form.verifiedAt} onChange={(event) => setField("verifiedAt", event.target.value)} type="date" />
                </label>
              </div>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">资费备注</span>
                <textarea
                  value={form.notes}
                  onChange={(event) => setField("notes", event.target.value)}
                  rows={3}
                  placeholder="可选：记录特殊计费周期、套餐限制、余额要求、漫游区域差异等"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                />
              </label>
            </section>

            {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

            <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {hasTariff ? (
                  <button type="button" onClick={() => void removeTariff()} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-200 px-4 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50">
                    <Trash2 className="h-4 w-4" />
                    清空资费信息
                  </button>
                ) : null}
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">取消</button>
                <button type="submit" disabled={saving} className="inline-flex h-10 min-w-28 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  保存资费
                </button>
              </div>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
