"use client";

import { FormEvent, useMemo, useState } from "react";
import { Activity, CheckCircle2, Loader2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModalPortal } from "@/components/ui/modal-portal";
import { CURRENCIES } from "@/lib/sim-options";
import {
  KEEP_ALIVE_ACTIVITY_TYPES,
  evaluateKeepAliveActivityRequirement,
  getKeepAliveActivityLabel,
  getKeepAliveRechargeRequirementLabel,
  localDateString,
} from "@/lib/keep-alive";
import type { KeepAliveRuleRecord, KeepAliveSimSummary } from "@/lib/keep-alive-types";
import type { ReminderItem } from "@/lib/reminders";

function qualificationReason(rule: KeepAliveRuleRecord, reason: string | null) {
  const requirement = getKeepAliveRechargeRequirementLabel(rule.minimumRechargeAmount, rule.rechargeCurrencyCode);
  if (reason === "action_not_allowed") return `该规则不把“当前活动类型”作为有效保号动作`;
  if (reason === "missing_amount") return `${requirement || "该规则有充值金额要求"}，请填写本次实际充值金额`;
  if (reason === "currency_mismatch") return `${requirement || "充值币种不一致"}，本次币种与规则不一致`;
  if (reason === "below_minimum") return `本次充值未达到${requirement ? `“${requirement}”` : "最低充值金额"}`;
  return "本次活动未满足规则条件";
}

function reminderTargetRule(reminder: ReminderItem | undefined, rules: KeepAliveRuleRecord[]) {
  if (!reminder) return null;
  if (reminder.kind === "sim_validity") {
    return rules.find((rule) => rule.enabled && rule.dueDateSource === "sim_validity") ?? null;
  }
  const match = /^keep-alive-(\d+)$/.exec(reminder.key);
  const id = match ? Number(match[1]) : 0;
  return rules.find((rule) => rule.id === id) ?? null;
}

function preferredActivityType(reminder: ReminderItem | undefined, rules: KeepAliveRuleRecord[]) {
  const target = reminderTargetRule(reminder, rules);
  if (target?.qualifyingActions.includes("recharge")) return "recharge";
  if (target?.qualifyingActions[0]) return target.qualifyingActions[0];
  return reminder?.kind === "sim_validity" ? "manual_extension" : "recharge";
}

export function KeepAliveEventModal({
  sim,
  rules,
  onClose,
  onSaved,
  completionReminder,
}: {
  sim: KeepAliveSimSummary;
  rules: KeepAliveRuleRecord[];
  onClose: () => void;
  onSaved: (result?: unknown) => Promise<void> | void;
  completionReminder?: ReminderItem;
}) {
  const [activityType, setActivityType] = useState(() => preferredActivityType(completionReminder, rules));
  const [activityDate, setActivityDate] = useState(localDateString());
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState(sim.currencyCode || "USD");
  const [balanceAfter, setBalanceAfter] = useState("");
  const [validUntilAfter, setValidUntilAfter] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const targetRule = useMemo(() => reminderTargetRule(completionReminder, rules), [completionReminder, rules]);
  const actionMatchedRules = useMemo(
    () => rules.filter((rule) => rule.enabled && rule.qualifyingActions.includes(activityType)),
    [activityType, rules],
  );
  const ruleEvaluations = useMemo(() => {
    const parsedAmount = amount.trim() === "" ? null : Number(amount);
    return actionMatchedRules.map((rule) => ({
      rule,
      qualification: evaluateKeepAliveActivityRequirement({
        qualifyingActions: rule.qualifyingActions,
        minimumRechargeAmount: rule.minimumRechargeAmount,
        rechargeCurrencyCode: rule.rechargeCurrencyCode,
        activityType,
        amount: Number.isFinite(parsedAmount) ? parsedAmount : null,
        currencyCode,
      }),
    }));
  }, [actionMatchedRules, activityType, amount, currencyCode]);
  const qualifiedRules = useMemo(
    () => ruleEvaluations.filter((item) => item.qualification.qualifies).map((item) => item.rule),
    [ruleEvaluations],
  );
  const blockedRules = useMemo(
    () => ruleEvaluations.filter((item) => !item.qualification.qualifies),
    [ruleEvaluations],
  );
  const linkedValidityRules = useMemo(
    () => qualifiedRules.filter((rule) => rule.dueDateSource === "sim_validity"),
    [qualifiedRules],
  );
  const independentRules = useMemo(
    () => qualifiedRules.filter((rule) => rule.dueDateSource !== "sim_validity"),
    [qualifiedRules],
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
          reminderCompletion: completionReminder
            ? { reminderKey: completionReminder.key, dueDate: completionReminder.dueDate }
            : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || (completionReminder ? "本次活动不能完成当前提醒" : "保号记录保存失败"));
      await onSaved(data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保号记录保存失败");
    } finally {
      setSaving(false);
    }
  }

  const statusTone = !actionMatchedRules.length
    ? "border-slate-200 bg-slate-50 text-slate-500"
    : blockedRules.length
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <ModalPortal onBackdropClick={saving ? undefined : onClose}>
      <Card className="w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b bg-white px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              {completionReminder ? <CheckCircle2 className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
              {completionReminder ? "完成生命周期提醒" : "保号活动"}
            </div>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{completionReminder ? "记录实际处理结果" : "记录一次活动"}</h3>
            <p className="mt-1 text-xs text-slate-400">{sim.label} · {sim.phoneNumber || "未填写号码"}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={submit} className="space-y-5 bg-white p-6">
          {completionReminder ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="text-sm font-semibold text-emerald-900">完成本轮：{completionReminder.title}</div>
              <div className="mt-1 text-xs leading-5 text-emerald-800/80">
                本轮截止：{completionReminder.dueDate || "未设置日期"}。只有本次真实活动满足对应规则，并推动下一次保号日期或号码有效期后，这条提醒才会完成；单纯打开此窗口不会隐藏提醒。
              </div>
              {targetRule ? <div className="mt-1 text-xs font-medium text-emerald-800">对应规则：{targetRule.name}</div> : null}
            </div>
          ) : null}

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

          <div className={`rounded-xl border px-4 py-3 text-sm ${statusTone}`}>
            {!actionMatchedRules.length ? (
              <>当前没有规则把“{getKeepAliveActivityLabel(activityType)}”设为有效保号动作；记录会保留，但不会自动改变保号日期。</>
            ) : (
              <div className="space-y-1.5">
                <div>“{getKeepAliveActivityLabel(activityType)}”关联 <strong>{actionMatchedRules.length}</strong> 条规则；按当前填写内容，<strong>{qualifiedRules.length}</strong> 条满足刷新条件。</div>
                {blockedRules.map(({ rule, qualification }) => (
                  <div key={rule.id} className="text-xs">• {rule.name}：{qualificationReason(rule, qualification.reason)}</div>
                ))}
                {independentRules.length ? <div className="text-xs">满足条件的 {independentRules.length} 条独立规则会按各自周期自动推进。</div> : null}
                {linkedValidityRules.length ? <div className="text-xs">满足条件的 {linkedValidityRules.length} 条规则跟随号码有效期；请以下方“活动后有效期”为准，不会仅凭周期猜测新的到期日。</div> : null}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">{activityType === "recharge" ? "充值金额" : "本次金额"}</span>
              <Input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="0" step="any" inputMode="decimal" placeholder={activityType === "recharge" ? "填写本次实际充值金额" : "可选"} />
              {activityType === "recharge" && actionMatchedRules.some((rule) => rule.minimumRechargeAmount !== null) ? <div className="text-xs text-slate-400">存在最低充值金额要求；金额不足或留空时，相关规则不会被刷新。</div> : null}
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
              <span className="font-medium text-slate-700">活动后有效期{completionReminder?.kind === "sim_validity" ? " *" : ""}</span>
              <Input
                value={validUntilAfter}
                onChange={(event) => setValidUntilAfter(event.target.value)}
                type="date"
                required={completionReminder?.kind === "sim_validity"}
              />
              <div className={`text-xs ${completionReminder?.kind === "sim_validity" || linkedValidityRules.length ? "font-medium text-amber-600" : "text-slate-400"}`}>
                {completionReminder?.kind === "sim_validity"
                  ? `完成本轮有效期提醒必须填写运营商确认的新有效期${completionReminder.dueDate ? `，且需要晚于 ${completionReminder.dueDate}` : ""}。`
                  : linkedValidityRules.length
                    ? "这次活动已满足跟随号码有效期规则的条件；运营商显示新有效期后建议填写，保存后号码管理与保号管理会同时更新。"
                    : "填写后会同步更新号码资料中的“有效期至”。"}
              </div>
            </label>
          </div>

          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">活动备注</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="例如：充值 PHP 20，有效期延长至运营商显示的新日期；通过官方 App 完成" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
          </label>

          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

          <div className="flex justify-end gap-2 border-t pt-5">
            <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">取消</button>
            <button type="submit" disabled={saving} className={`inline-flex h-10 min-w-28 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium text-white transition disabled:opacity-60 ${completionReminder ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-950 hover:bg-slate-800"}`}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {completionReminder ? "确认完成并记录" : "保存记录"}
            </button>
          </div>
        </form>
      </Card>
    </ModalPortal>
  );
}
