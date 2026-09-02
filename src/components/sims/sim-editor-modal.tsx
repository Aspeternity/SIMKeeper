"use client";

import { FormEvent, useMemo, useState } from "react";
import { getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { Loader2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModalPortal } from "@/components/ui/modal-portal";
import { CURRENCIES, getDefaultCurrency, SIM_STATUSES, SIM_TYPES } from "@/lib/sim-options";
import type { CarrierRecord, SimRecord } from "@/lib/sim-types";

type FormState = {
  label: string;
  phoneNumber: string;
  carrierId: string;
  simType: string;
  iccid: string;
  balance: string;
  currencyCode: string;
  status: string;
  activationDate: string;
  validUntil: string;
  notes: string;
};

function getCallingCode(countryCode: string) {
  if (!countryCode) return "";
  try {
    return `+${getCountryCallingCode(countryCode as CountryCode)}`;
  } catch {
    return "";
  }
}

function toNationalNumber(phoneNumber: string | null, countryCode: string) {
  if (!phoneNumber) return "";
  try {
    const parsed = parsePhoneNumberFromString(phoneNumber, countryCode as CountryCode);
    return parsed?.nationalNumber ?? phoneNumber;
  } catch {
    return phoneNumber;
  }
}

function initialForm(carriers: CarrierRecord[], editing: SimRecord | null): FormState {
  if (editing) {
    return {
      label: editing.label,
      phoneNumber: toNationalNumber(editing.phoneNumber, editing.countryCode),
      carrierId: String(editing.carrierId),
      simType: editing.simType,
      iccid: editing.iccid || "",
      balance: editing.balance === null ? "" : String(editing.balance),
      currencyCode: editing.currencyCode || getDefaultCurrency(editing.countryCode),
      status: editing.status,
      activationDate: editing.activationDate || "",
      validUntil: editing.validUntil || "",
      notes: editing.notes || "",
    };
  }

  const carrier = carriers[0];
  return {
    label: "",
    phoneNumber: "",
    carrierId: carrier ? String(carrier.id) : "",
    simType: "physical",
    iccid: "",
    balance: "",
    currencyCode: carrier ? getDefaultCurrency(carrier.countryCode) : "USD",
    status: "active",
    activationDate: "",
    validUntil: "",
    notes: "",
  };
}

export function SimEditorModal({ carriers, editing, onClose, onSaved }: { carriers: CarrierRecord[]; editing: SimRecord | null; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const [form, setForm] = useState<FormState>(() => initialForm(carriers, editing));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedCarrier = useMemo(
    () => carriers.find((carrier) => carrier.id === Number(form.carrierId)) ?? null,
    [carriers, form.carrierId],
  );
  const callingCode = useMemo(
    () => (selectedCarrier ? getCallingCode(selectedCarrier.countryCode) : ""),
    [selectedCarrier],
  );

  function changeCarrier(carrierId: string) {
    const carrier = carriers.find((item) => item.id === Number(carrierId));
    setForm((current) => ({
      ...current,
      carrierId,
      currencyCode: carrier ? getDefaultCurrency(carrier.countryCode) : current.currencyCode,
      phoneNumber: editing && Number(carrierId) !== editing.carrierId ? "" : current.phoneNumber,
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.carrierId) {
      setError("请选择运营商");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/sims", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, ...form } : form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败");
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal>
      <Card className="w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between border-b bg-white px-6 py-5">
          <div>
            <h3 className="font-semibold">{editing ? "编辑号码" : "新增号码"}</h3>
            <p className="mt-1 text-xs text-slate-400">国家/地区和国际区号会根据运营商自动匹配，号码保存为统一国际格式。</p>
          </div>
          <button onClick={onClose} disabled={saving} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5 bg-white p-6">
          <div className="grid gap-4 sm:grid-cols-[1.4fr_0.6fr]">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">运营商</span>
              <select
                value={form.carrierId}
                onChange={(event) => changeCarrier(event.target.value)}
                required
                autoFocus
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
              >
                <option value="">请选择运营商</option>
                {carriers.map((carrier) => <option key={carrier.id} value={carrier.id}>{carrier.name} · {carrier.country}</option>)}
              </select>
              {selectedCarrier ? <div className="text-xs text-slate-400">{selectedCarrier.country} · {selectedCarrier.countryCode} · 国际区号 {callingCode || "未知"}</div> : null}
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">SIM 类型</span>
              <select value={form.simType} onChange={(event) => setForm({ ...form, simType: event.target.value })} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100">
                {SIM_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">号码名称</span>
              <Input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="为这张号码设置一个易识别的名称" required />
            </label>
            <div className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">手机号 / MSISDN</span>
              <div className="flex h-10 overflow-hidden rounded-xl border border-slate-200 bg-white transition focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-100">
                <div className="flex min-w-[72px] items-center justify-center border-r border-slate-200 bg-slate-50 px-3 font-medium text-slate-600">{callingCode || "—"}</div>
                <input
                  value={form.phoneNumber}
                  onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })}
                  placeholder={selectedCarrier ? "输入本地号码" : "请先选择运营商"}
                  disabled={!selectedCarrier}
                  inputMode="tel"
                  autoComplete="tel-national"
                  className="min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50"
                />
              </div>
              <div className="text-xs text-slate-400">只需输入本地号码，保存时会自动规范为 E.164 国际格式。</div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1.4fr_0.6fr]">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">ICCID</span>
              <Input value={form.iccid} onChange={(event) => setForm({ ...form, iccid: event.target.value.replace(/\s+/g, "") })} placeholder="可选，10-32 位数字" inputMode="numeric" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">状态</span>
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100">
                {SIM_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">余额</span>
              <Input value={form.balance} onChange={(event) => setForm({ ...form, balance: event.target.value })} placeholder="可选" inputMode="decimal" type="number" min="0" step="any" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">币种</span>
              <select value={form.currencyCode} onChange={(event) => setForm({ ...form, currencyCode: event.target.value })} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100">
                {CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} · {currency.label}</option>)}
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">激活日期</span>
              <Input value={form.activationDate} onChange={(event) => setForm({ ...form, activationDate: event.target.value })} type="date" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">有效期至</span>
              <Input value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} type="date" />
            </label>
          </div>

          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">备注</span>
            <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="可记录套餐、用途、卡槽位置、实名信息提示等" rows={3} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
          </label>

          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">取消</button>
            <button type="submit" disabled={saving} className="inline-flex h-10 min-w-24 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editing ? "保存修改" : "添加号码"}
            </button>
          </div>
        </form>
      </Card>
    </ModalPortal>
  );
}
