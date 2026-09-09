"use client";

import { FormEvent, useMemo, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogAlert, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { FormField, FormGrid, FormSection } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  KEEP_ALIVE_ACTIVITY_TYPES,
  KEEP_ALIVE_DUE_DATE_SOURCES,
  KEEP_ALIVE_INTERVAL_UNITS,
  getKeepAliveActivityLabel,
  type KeepAliveDueDateSource,
} from "@/lib/keep-alive";
import type { KeepAliveRuleRecord } from "@/lib/keep-alive-types";
import { CURRENCIES } from "@/lib/sim-options";

export function KeepAliveRuleModal({
  simId,
  simLabel,
  simValidUntil,
  simCurrencyCode,
  rule,
  onClose,
  onSaved,
}: {
  simId: number;
  simLabel: string;
  simValidUntil: string | null;
  simCurrencyCode: string | null;
  rule: KeepAliveRuleRecord | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [name, setName] = useState(rule?.name || "");
  const [intervalValue, setIntervalValue] = useState(rule ? String(rule.intervalValue) : "");
  const [intervalUnit, setIntervalUnit] = useState(rule?.intervalUnit || "day");
  const [qualifyingActions, setQualifyingActions] = useState<string[]>(rule?.qualifyingActions || ["recharge"]);
  const [minimumRechargeAmount, setMinimumRechargeAmount] = useState(rule?.minimumRechargeAmount === null || rule?.minimumRechargeAmount === undefined ? "" : String(rule.minimumRechargeAmount));
  const [rechargeCurrencyCode, setRechargeCurrencyCode] = useState(rule?.rechargeCurrencyCode || simCurrencyCode || "USD");
  const [dueDateSource, setDueDateSource] = useState<KeepAliveDueDateSource>(
    rule?.dueDateSource || (simValidUntil ? "sim_validity" : "independent"),
  );
  const [nextDueDate, setNextDueDate] = useState(rule?.dueDateSource === "sim_validity" ? "" : rule?.nextDueDate || "");
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
  const rechargeEnabled = qualifyingActions.includes("recharge");

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
          minimumRechargeAmount: rechargeEnabled ? minimumRechargeAmount : "",
          rechargeCurrencyCode: rechargeEnabled ? rechargeCurrencyCode : "",
          dueDateSource,
          nextDueDate: dueDateSource === "independent" ? nextDueDate : "",
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
    <Dialog onClose={onClose} busy={saving} size="lg" dataAttribute="keep-alive-rule-editor">
      <DialogHeader
        eyebrow="保号规则"
        icon={<ShieldCheck className="h-4 w-4" />}
        title={rule ? "编辑规则" : "新增规则"}
        description={`${simLabel} · 一张卡可以同时配置多条独立规则。`}
        onClose={onClose}
        busy={saving}
      />

      <form onSubmit={submit} className="contents">
        <DialogBody className="space-y-5">
          {error ? <DialogAlert>{error}</DialogAlert> : null}

          <FormSection title="规则基础" description="定义规则名称、日期来源与刷新周期。">
            <FormField label="规则名称" required>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：号码有效期、活跃要求" autoFocus required />
            </FormField>

            <div className="space-y-2">
              <div className="text-sm font-medium text-ink-secondary">下一次日期来源</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {KEEP_ALIVE_DUE_DATE_SOURCES.map((item) => (
                  <label
                    key={item.value}
                    className={`cursor-pointer rounded-xl border px-4 py-3 transition ${
                      dueDateSource === item.value
                        ? "border-brand bg-brand-soft ring-2 ring-focus"
                        : "border-line bg-surface hover:border-line-strong hover:bg-surface-hover"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium text-ink-secondary">
                      <input type="radio" name="dueDateSource" checked={dueDateSource === item.value} onChange={() => setDueDateSource(item.value)} />
                      {item.label}
                    </div>
                    <div className="mt-1 pl-5 text-xs leading-5 text-ink-muted">
                      {item.value === "sim_validity"
                        ? "用于充值或续期延长号码有效期的规则；日期始终跟随号码管理里的“有效期至”。"
                        : "用于 90 天活跃、定期短信等独立要求；单独维护自己的下一次操作日期。"}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <FormGrid>
              <FormField label="保号周期" required>
                <div className="grid grid-cols-[1fr_120px] gap-2">
                  <Input value={intervalValue} onChange={(event) => setIntervalValue(event.target.value)} type="number" min="1" step="1" inputMode="numeric" placeholder="例如 180" required />
                  <Select value={intervalUnit} onChange={(event) => setIntervalUnit(event.target.value)}>
                    {KEEP_ALIVE_INTERVAL_UNITS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </Select>
                </div>
              </FormField>
              <FormField
                label={dueDateSource === "sim_validity" ? "号码有效期（自动同步）" : "当前下次操作日期"}
                hint={dueDateSource === "sim_validity"
                  ? simValidUntil
                    ? "来自号码管理；修改号码“有效期至”后这里会立即同步。"
                    : "当前号码尚未设置“有效期至”，请先在号码管理中填写。"
                  : "可手动初始化；留空时会尝试根据最近一次真正满足规则条件的活动计算。"}
              >
                <Input
                  value={dueDateSource === "sim_validity" ? simValidUntil || "" : nextDueDate}
                  onChange={(event) => setNextDueDate(event.target.value)}
                  type="date"
                  disabled={dueDateSource === "sim_validity"}
                />
              </FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="满足条件" description={`当前可刷新规则的活动：${actionSummary}`}>
            <div className="grid gap-2 sm:grid-cols-2">
              {KEEP_ALIVE_ACTIVITY_TYPES.filter((item) => item.value !== "other").map((item) => (
                <label key={item.value} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink-secondary transition hover:border-line-strong hover:bg-surface-hover">
                  <input type="checkbox" checked={qualifyingActions.includes(item.value)} onChange={() => toggleAction(item.value)} className="h-4 w-4 rounded border-line-strong accent-brand" />
                  {item.label}
                </label>
              ))}
            </div>

            {rechargeEnabled ? (
              <div className="rounded-xl border border-line bg-surface-subtle p-4">
                <div className="text-sm font-semibold text-ink">充值要求</div>
                <p className="mt-1 text-xs leading-5 text-ink-muted">可设置一次充值至少达到多少才算满足保号规则。留空表示任意金额充值都有效。</p>
                <FormGrid className="mt-3">
                  <FormField label="最低充值金额">
                    <Input value={minimumRechargeAmount} onChange={(event) => setMinimumRechargeAmount(event.target.value)} type="number" min="0.000001" step="any" inputMode="decimal" placeholder="例如 20" />
                  </FormField>
                  <FormField label="充值币种">
                    <Select value={rechargeCurrencyCode} onChange={(event) => setRechargeCurrencyCode(event.target.value)} disabled={!minimumRechargeAmount}>
                      {CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} · {currency.label}</option>)}
                    </Select>
                  </FormField>
                </FormGrid>
                {minimumRechargeAmount ? <div className="mt-2 text-xs font-medium text-ink-muted">当前要求：单次充值至少 {rechargeCurrencyCode} {minimumRechargeAmount}</div> : null}
              </div>
            ) : null}
          </FormSection>

          <FormSection title="提醒与状态" description="设置提前提醒、宽限期以及规则是否参与当前生命周期计算。">
            <FormGrid columns={3}>
              <FormField label="提前提醒">
                <div className="flex h-10 overflow-hidden rounded-lg border border-line bg-surface shadow-sm focus-within:border-brand focus-within:ring-4 focus-within:ring-focus">
                  <input value={warningDays} onChange={(event) => setWarningDays(event.target.value)} type="number" min="0" max="365" className="min-w-0 flex-1 bg-transparent px-3 text-sm text-ink outline-none" />
                  <span className="flex items-center border-l border-line bg-surface-subtle px-3 text-xs text-ink-muted">天</span>
                </div>
              </FormField>
              <FormField label="宽限期">
                <div className="flex h-10 overflow-hidden rounded-lg border border-line bg-surface shadow-sm focus-within:border-brand focus-within:ring-4 focus-within:ring-focus">
                  <input value={gracePeriodDays} onChange={(event) => setGracePeriodDays(event.target.value)} type="number" min="0" max="365" className="min-w-0 flex-1 bg-transparent px-3 text-sm text-ink outline-none" />
                  <span className="flex items-center border-l border-line bg-surface-subtle px-3 text-xs text-ink-muted">天</span>
                </div>
              </FormField>
              <FormField label="规则状态">
                <Select value={enabled ? "enabled" : "disabled"} onChange={(event) => setEnabled(event.target.value === "enabled")}>
                  <option value="enabled">启用</option>
                  <option value="disabled">停用</option>
                </Select>
              </FormField>
            </FormGrid>

            <FormField label="规则备注">
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="可记录运营商原文、特殊限制或核实来源等" />
            </FormField>
          </FormSection>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>取消</Button>
          <Button type="submit" disabled={saving} className="min-w-28 gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            保存规则
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
