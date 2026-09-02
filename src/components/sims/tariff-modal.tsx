"use client";

import { FormEvent, useEffect, useState } from "react";
import { ExternalLink, Globe2, Loader2, MessageSquareText, PhoneCall, ReceiptText, Trash2, Wifi, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ROAMING_AVAILABILITY, SMS_RECEIVE_POLICIES } from "@/lib/tariff-options";

type SimSummary = {
  id: number;
  label: string;
  phoneNumber: string | null;
  carrierName: string;
  country: string;
  countryCode: string;
};

type TariffForm = {
  planName: string;
  localOutgoingCall: string;
  localIncomingCall: string;
  localOutgoingSms: string;
  localIncomingSms: string;
  localData: string;
  internationalOutgoingCall: string;
  internationalOutgoingSms: string;
  roamingOutgoingCall: string;
  roamingIncomingCall: string;
  roamingOutgoingSms: string;
  roamingIncomingSms: string;
  roamingData: string;
  localIncomingSmsPolicy: string;
  roamingIncomingSmsPolicy: string;
  roamingAvailable: string;
  usageSummary: string;
  sourceUrl: string;
  verifiedAt: string;
  notes: string;
};

const emptyTariff: TariffForm = {
  planName: "",
  localOutgoingCall: "",
  localIncomingCall: "",
  localOutgoingSms: "",
  localIncomingSms: "",
  localData: "",
  internationalOutgoingCall: "",
  internationalOutgoingSms: "",
  roamingOutgoingCall: "",
  roamingIncomingCall: "",
  roamingOutgoingSms: "",
  roamingIncomingSms: "",
  roamingData: "",
  localIncomingSmsPolicy: "unknown",
  roamingIncomingSmsPolicy: "unknown",
  roamingAvailable: "unknown",
  usageSummary: "",
  sourceUrl: "",
  verifiedAt: "",
  notes: "",
};

function tariffToForm(value: Record<string, unknown> | null): TariffForm {
  if (!value) return emptyTariff;
  return {
    planName: String(value.planName ?? ""),
    localOutgoingCall: String(value.localOutgoingCall ?? ""),
    localIncomingCall: String(value.localIncomingCall ?? ""),
    localOutgoingSms: String(value.localOutgoingSms ?? ""),
    localIncomingSms: String(value.localIncomingSms ?? ""),
    localData: String(value.localData ?? ""),
    internationalOutgoingCall: String(value.internationalOutgoingCall ?? ""),
    internationalOutgoingSms: String(value.internationalOutgoingSms ?? ""),
    roamingOutgoingCall: String(value.roamingOutgoingCall ?? ""),
    roamingIncomingCall: String(value.roamingIncomingCall ?? ""),
    roamingOutgoingSms: String(value.roamingOutgoingSms ?? ""),
    roamingIncomingSms: String(value.roamingIncomingSms ?? ""),
    roamingData: String(value.roamingData ?? ""),
    localIncomingSmsPolicy: String(value.localIncomingSmsPolicy ?? "unknown"),
    roamingIncomingSmsPolicy: String(value.roamingIncomingSmsPolicy ?? "unknown"),
    roamingAvailable: String(value.roamingAvailable ?? "unknown"),
    usageSummary: String(value.usageSummary ?? ""),
    sourceUrl: String(value.sourceUrl ?? ""),
    verifiedAt: String(value.verifiedAt ?? ""),
    notes: String(value.notes ?? ""),
  };
}

export function TariffModal({ sim, onClose, onSaved }: { sim: SimSummary; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const [form, setForm] = useState<TariffForm>(emptyTariff);
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
        setForm(tariffToForm(data.tariff));
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
  }, [sim.id]);

  function setField<K extends keyof TariffForm>(field: K, value: TariffForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
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
      setForm(tariffToForm(data.tariff));
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

  const inputClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100";

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/35 p-4 backdrop-blur-sm">
      <Card className="my-4 w-full max-w-4xl overflow-hidden shadow-2xl">
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
                <h4 className="font-medium text-slate-900">资费档案与核心结论</h4>
                <p className="mt-1 text-xs text-slate-400">优先记录收短信和漫游结论，方便以后快速判断是否适合接验证码和长期保号。</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">套餐 / 资费名称</span>
                  <Input value={form.planName} onChange={(event) => setField("planName", event.target.value)} placeholder="可选，如预付费基础资费" />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">本地接收短信</span>
                  <select value={form.localIncomingSmsPolicy} onChange={(event) => setField("localIncomingSmsPolicy", event.target.value)} className={inputClass}>
                    {SMS_RECEIVE_POLICIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">国际漫游</span>
                  <select value={form.roamingAvailable} onChange={(event) => setField("roamingAvailable", event.target.value)} className={inputClass}>
                    {ROAMING_AVAILABILITY.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">漫游接收短信</span>
                  <select value={form.roamingIncomingSmsPolicy} onChange={(event) => setField("roamingIncomingSmsPolicy", event.target.value)} className={inputClass}>
                    {SMS_RECEIVE_POLICIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
              </div>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">使用结论</span>
                <textarea value={form.usageSummary} onChange={(event) => setField("usageSummary", event.target.value)} rows={2} placeholder="例如：适合长期保号和接验证码；不建议用于漫游通话或数据" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
              </label>
            </section>

            <section className="space-y-4 border-t pt-6">
              <div className="flex items-center gap-2">
                <PhoneCall className="h-4 w-4 text-slate-400" />
                <h4 className="font-medium text-slate-900">本地使用</h4>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[
                  ["localOutgoingCall", "拨打电话"],
                  ["localIncomingCall", "接听电话"],
                  ["localOutgoingSms", "发送短信"],
                  ["localIncomingSms", "接收短信"],
                  ["localData", "移动数据"],
                ].map(([field, label]) => (
                  <label key={field} className="space-y-1.5 text-sm">
                    <span className="font-medium text-slate-700">{label}</span>
                    <Input value={form[field as keyof TariffForm]} onChange={(event) => setField(field as keyof TariffForm, event.target.value)} placeholder="免费 / 单价 / 套餐内包含" />
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-4 border-t pt-6">
              <div className="flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-slate-400" />
                <h4 className="font-medium text-slate-900">国际使用</h4>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">国际电话</span>
                  <Input value={form.internationalOutgoingCall} onChange={(event) => setField("internationalOutgoingCall", event.target.value)} placeholder="可记录不同目的地或统一资费" />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">国际短信</span>
                  <Input value={form.internationalOutgoingSms} onChange={(event) => setField("internationalOutgoingSms", event.target.value)} placeholder="可记录每条价格或套餐规则" />
                </label>
              </div>
            </section>

            <section className="space-y-4 border-t pt-6">
              <div className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-slate-400" />
                <h4 className="font-medium text-slate-900">国际漫游</h4>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[
                  ["roamingOutgoingCall", "漫游拨打电话"],
                  ["roamingIncomingCall", "漫游接听电话"],
                  ["roamingOutgoingSms", "漫游发送短信"],
                  ["roamingIncomingSms", "漫游接收短信"],
                  ["roamingData", "漫游数据"],
                ].map(([field, label]) => (
                  <label key={field} className="space-y-1.5 text-sm">
                    <span className="font-medium text-slate-700">{label}</span>
                    <Input value={form[field as keyof TariffForm]} onChange={(event) => setField(field as keyof TariffForm, event.target.value)} placeholder="免费 / 单价 / 漫游包规则" />
                  </label>
                ))}
              </div>
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
                    {form.sourceUrl ? (
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
                <textarea value={form.notes} onChange={(event) => setField("notes", event.target.value)} rows={3} placeholder="可记录计费周期、套餐限制、余额要求、特殊漫游条件等" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
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
