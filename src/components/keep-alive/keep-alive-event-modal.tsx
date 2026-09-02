"use client";

import { FormEvent, useMemo, useState } from "react";
import { Activity, Loader2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModalPortal } from "@/components/ui/modal-portal";
import { CURRENCIES } from "@/lib/sim-options";
import { KEEP_ALIVE_ACTIVITY_TYPES, getKeepAliveActivityLabel, localDateString } from "@/lib/keep-alive";
import type { KeepAliveRuleRecord, KeepAliveSimSummary } from "@/lib/keep-alive-types";

export function KeepAliveEventModal({
  sim,
  rules,
  onClose,
  onSaved,
}: {
  sim: KeepAliveSimSummary;
  rules: KeepAliveRuleRecord[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [activityType, setActivityType] = useState("recharge");
  const [activityDate, setActivityDate] = useState(localDateString());
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState(sim.currencyCode || "USD");
  const [balanceAfter, setBalanceAfter] = useState("");
  const [validUntilAfter, setValidUntilAfter] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const matchingRules = useMemo(
    () => rules.filter((rule) => rule.enabled && rule.qualifyingActions.includes(activityType)),
    [activityType, rules],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/keep-alive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          simId: sim.id,
          activityType,
          activityDate,
          amount,
          currencyCode,
          balanceAfter,
          validUntilAfter,
          notes,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保号记录保存失败");
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保号记录保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal onBackdropClick={saving ? undefined : onClose}>
      <Card className="w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b bg-white px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500"><Activity className="h-4 w-4" />保号活动</div>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">记录一次活动</h3>
            <p className="mt-1 text-xs text-slate-400">{sim.label} · {sim.phoneNumber || "未填写号码"}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={submit} className="space-y-5 bg-white p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">活动类型</span>
              <select value={activityType} onChange={(event) => setActivityType(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400" autoFocus>
                {KEEP_ALIVE_ACTIVITY_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">活动日期</span>
              <Input value={activityDate} onChange={(event) => setActivityDate(event.target.value)} type="date" required />
            </label>
          </div>

          <div className={`rounded-xl border px-4 py-3 text-sm ${matchingRules.length ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
            {matchingRules.length ? (
              <>这次“{getKeepAliveActivityLabel(activityType)}”会刷新 <strong>{matchingRules.length}</strong> 条规则：{matchingRules.map((rule) => rule.name).join("、")}。</>
            ) : (
              <>当前没有规则把“{getKeepAliveActivityLabel(activityType)}”设为有效保号动作；记录会保留，但不会自动改变下一次保号日期。</>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">本次金额</span>
              <Input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="0" step="any" inputMode="decimal" placeholder="可选，例如充值金额" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">币种</span>
              <select value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400">
                {CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.code}</option>)}
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">活动后余额</span>
              <Input value={balanceAfter} onChange={(event) => setBalanceAfter(event.target.value)} type="number" min="0" step="any" inputMode="decimal" placeholder="可选；填写后同步更新号码余额" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">活动后有效期</span>
              <Input value={validUntilAfter} onChange={(event) => setValidUntilAfter(event.target.value)} type="date" />
              <div className="text-xs text-slate-400">填写后会同步更新号码资料中的“有效期至”。</div>
            </label>
          </div>

          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">活动备注</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="例如：充值 HK$20，活动期延长 365 天；通过官方 App 完成" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
          </label>

          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

          <div className="flex justify-end gap-2 border-t pt-5">
            <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">取消</button>
            <button type="submit" disabled={saving} className="inline-flex h-10 min-w-28 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}保存记录
            </button>
          </div>
        </form>
      </Card>
    </ModalPortal>
  );
}
