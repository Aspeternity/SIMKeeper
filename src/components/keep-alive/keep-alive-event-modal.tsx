"use client";

import { FormEvent, useMemo, useState } from "react";
import { Activity, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogAlert, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { FormField, FormGrid, FormSection } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
    ? "border-line bg-surface-subtle text-ink-secondary"
    : blockedRules.length
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <Dialog onClose={onClose} busy={saving} size="md" dataAttribute="keep-alive-event-editor">
      <DialogHeader
        eyebrow={completionReminder ? "完成生命周期提醒" : "保号活动"}
        icon={completionReminder ? <CheckCircle2 className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
        title={completionReminder ? "记录实际处理结果" : "记录一次活动"}
        description={`${sim.label} · ${sim.phoneNumber || "未填写号码"}`}
        onClose={onClose}
        busy={saving}
      />

      <form onSubmit={submit} className="contents">
        <DialogBody className="space-y-5">
          {completionReminder ? (
            <DialogAlert tone="success">
              <div className="font-semibold">完成本轮：{completionReminder.title}</div>
              <div className="mt-1 text-xs leading-5 opacity-80">
                本轮截止：{completionReminder.dueDate || "未设置日期"}。只有本次真实活动满足对应规则，并推动下一次保号日期或号码有效期后，这条提醒才会完成；单纯打开此窗口不会隐藏提醒。
              </div>
              {targetRule ? <div className="mt-1 text-xs font-medium">对应规则：{targetRule.name}</div> : null}
            </DialogAlert>
          ) : null}

          {error ? <DialogAlert>{error}</DialogAlert> : null}

          <FormSection title="活动信息" description="记录实际发生的动作和日期，SIMKeeper 会按当前保号规则判断是否满足刷新条件。">
            <FormGrid>
              <FormField label="活动类型" required>
                <Select value={activityType} onChange={(event) => setActivityType(event.target.value)} autoFocus>
                  {KEEP_ALIVE_ACTIVITY_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </Select>
              </FormField>
              <FormField label="活动日期" required>
                <Input value={activityDate} onChange={(event) => setActivityDate(event.target.value)} type="date" required />
              </FormField>
            </FormGrid>

            <div className={`rounded-xl border px-4 py-3 text-sm leading-6 ${statusTone}`}>
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
          </FormSection>

          <FormSection title="金额与结果" description="充值金额用于判断最低充值要求；活动后余额和有效期会同步回号码资料。">
            <FormGrid className="sm:grid-cols-[1fr_150px]">
              <FormField
                label={activityType === "recharge" ? "充值金额" : "本次金额"}
                hint={activityType === "recharge" && actionMatchedRules.some((rule) => rule.minimumRechargeAmount !== null)
                  ? "存在最低充值金额要求；金额不足或留空时，相关规则不会被刷新。"
                  : undefined}
              >
                <Input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="0" step="any" inputMode="decimal" placeholder={activityType === "recharge" ? "填写本次实际充值金额" : "可选"} />
              </FormField>
              <FormField label="币种">
                <Select value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)}>
                  {CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.code}</option>)}
                </Select>
              </FormField>
            </FormGrid>

            <FormGrid>
              <FormField label="活动后余额" hint="填写后会同步更新号码余额。">
                <Input value={balanceAfter} onChange={(event) => setBalanceAfter(event.target.value)} type="number" min="0" step="any" inputMode="decimal" placeholder="可选" />
              </FormField>
              <FormField
                label="活动后有效期"
                required={completionReminder?.kind === "sim_validity"}
                hint={completionReminder?.kind === "sim_validity"
                  ? `完成本轮有效期提醒必须填写运营商确认的新有效期${completionReminder.dueDate ? `，且需要晚于 ${completionReminder.dueDate}` : ""}。`
                  : linkedValidityRules.length
                    ? "这次活动已满足跟随号码有效期规则的条件；运营商显示新有效期后建议填写，保存后号码管理与保号管理会同时更新。"
                    : "填写后会同步更新号码资料中的“有效期至”。"}
              >
                <Input
                  value={validUntilAfter}
                  onChange={(event) => setValidUntilAfter(event.target.value)}
                  type="date"
                  required={completionReminder?.kind === "sim_validity"}
                />
              </FormField>
            </FormGrid>
          </FormSection>

          <FormField label="活动备注">
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="例如：充值 PHP 20，有效期延长至运营商显示的新日期；通过官方 App 完成" />
          </FormField>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>取消</Button>
          <Button
            type="submit"
            disabled={saving}
            className={`min-w-28 gap-2 ${completionReminder ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {completionReminder ? "确认完成并记录" : "保存记录"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
