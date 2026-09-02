"use client";

import { FormEvent, useMemo, useState } from "react";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModalPortal } from "@/components/ui/modal-portal";
import {
  KEEP_ALIVE_ACTIVITY_TYPES,
  KEEP_ALIVE_INTERVAL_UNITS,
  getKeepAliveActivityLabel,
} from "@/lib/keep-alive";
import type { KeepAliveRuleRecord } from "@/lib/keep-alive-types";

export function KeepAliveRuleModal({
  simId,
  simLabel,
  rule,
  onClose,
  onSaved,
}: {
  simId: number;
  simLabel: string;
  rule: KeepAliveRuleRecord | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [name, setName] = useState(rule?.name || "");
  const [intervalValue, setIntervalValue] = useState(rule ? String(rule.intervalValue) : "");
  const [intervalUnit, setIntervalUnit] = useState(rule?.intervalUnit || "day");
  const [qualifyingActions, setQualifyingActions] = useState<string[]>(rule?.qualifyingActions || ["recharge"]);
  const [nextDueDate, setNextDueDate] = useState(rule?.nextDueDate || "");
  const [warningDays, setWarningDays] = useState(rule ? String(rule.warningDays) : "30");
  const [gracePeriodDays, setGracePeriodDays] = useState(rule ? String(rule.gracePeriodDays) : "0");
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [notes, setNotes] = useState(rule?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const actionSummary = useMemo(
    () => qualifyingActions.map(getKeepAliveActivityLabel).join("、") || "未选择",
    [qualifyingActions],
  );

  function toggleAction(value: string) {
    setQualifyingActions((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/keep-alive", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: rule?.id,
          simId,
          name,
          intervalValue,
          intervalUnit,
          qualifyingActions,
          nextDueDate,
          warningDays,
          gracePeriodDays,
          enabled,
          notes,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保号规则保存失败");
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保号规则保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal onBackdropClick={saving ? undefined : onClose}>
      <Card className="w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b bg-white px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500"><ShieldCheck className="h-4 w-4" />保号规则</div>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{rule ? "编辑规则" : "新增规则"}</h3>
            <p className="mt-1 text-xs text-slate-400">{simLabel} · 一张卡可以同时配置多条独立规则。</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={submit} className="space-y-5 bg-white p-6">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">规则名称</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：号码有效期、活跃要求" autoFocus required />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">保号周期</span>
              <div className="grid grid-cols-[1fr_120px] gap-2">
                <Input value={intervalValue} onChange={(event) => setIntervalValue(event.target.value)} type="number" min="1" step="1" inputMode="numeric" placeholder="例如 180" required />
                <select value={intervalUnit} onChange={(event) => setIntervalUnit(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400">
                  {KEEP_ALIVE_INTERVAL_UNITS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">当前下次操作日期</span>
              <Input value={nextDueDate} onChange={(event) => setNextDueDate(event.target.value)} type="date" />
              <div className="text-xs text-slate-400">可直接按运营商当前显示的到期/保号日期初始化；留空时会尝试根据最近匹配记录计算。</div>
            </label>
          </div>

          <div className="space-y-2">
            <div>
              <div className="text-sm font-medium text-slate-700">哪些活动可以刷新这条规则</div>
              <div className="mt-1 text-xs text-slate-400">当前：{actionSummary}</div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {KEEP_ALIVE_ACTIVITY_TYPES.filter((item) => item.value !== "other").map((item) => (
                <label key={item.value} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50">
                  <input type="checkbox" checked={qualifyingActions.includes(item.value)} onChange={() => toggleAction(item.value)} className="h-4 w-4 rounded border-slate-300" />
                  {item.label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">提前提醒</span>
              <div className="flex h-10 overflow-hidden rounded-xl border border-slate-200 bg-white">
                <input value={warningDays} onChange={(event) => setWarningDays(event.target.value)} type="number" min="0" max="365" className="min-w-0 flex-1 px-3 text-sm outline-none" />
                <span className="flex items-center border-l bg-slate-50 px-3 text-xs text-slate-500">天</span>
              </div>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">宽限期</span>
              <div className="flex h-10 overflow-hidden rounded-xl border border-slate-200 bg-white">
                <input value={gracePeriodDays} onChange={(event) => setGracePeriodDays(event.target.value)} type="number" min="0" max="365" className="min-w-0 flex-1 px-3 text-sm outline-none" />
                <span className="flex items-center border-l bg-slate-50 px-3 text-xs text-slate-500">天</span>
              </div>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">规则状态</span>
              <select value={enabled ? "enabled" : "disabled"} onChange={(event) => setEnabled(event.target.value === "enabled")} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400">
                <option value="enabled">启用</option>
                <option value="disabled">停用</option>
              </select>
            </label>
          </div>

          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">规则备注</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="可记录运营商原文、最低充值金额、特殊限制等" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
          </label>

          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

          <div className="flex justify-end gap-2 border-t pt-5">
            <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">取消</button>
            <button type="submit" disabled={saving} className="inline-flex h-10 min-w-28 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}保存规则
            </button>
          </div>
        </form>
      </Card>
    </ModalPortal>
  );
}
