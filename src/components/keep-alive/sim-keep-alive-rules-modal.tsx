"use client";

import { useState } from "react";
import { CalendarClock, Loader2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { KeepAliveRuleModal } from "@/components/keep-alive/keep-alive-rule-modal";
import { Button } from "@/components/ui/button";
import { Dialog, DialogAlert, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import {
  getKeepAliveActivityLabel,
  getKeepAliveDueDateSourceLabel,
  getKeepAliveIntervalLabel,
  getKeepAliveRechargeRequirementLabel,
  getKeepAliveRuleStatusLabel,
  type KeepAliveRuleStatus,
} from "@/lib/keep-alive";
import type { KeepAliveRuleRecord, KeepAliveSimSummary } from "@/lib/keep-alive-types";
import { REMINDER_STATE_CHANGED_EVENT } from "@/lib/reminders";

function ruleStatusClass(status: KeepAliveRuleStatus) {
  switch (status) {
    case "ok":
      return "bg-emerald-50 text-emerald-700 ring-emerald-100";
    case "due_soon":
      return "bg-amber-50 text-amber-700 ring-amber-100";
    case "grace":
      return "bg-orange-50 text-orange-700 ring-orange-100";
    case "overdue":
      return "bg-rose-50 text-rose-700 ring-rose-100";
    case "disabled":
      return "bg-slate-100 text-slate-400 ring-slate-200";
    default:
      return "bg-sky-50 text-sky-700 ring-sky-100";
  }
}

export function SimKeepAliveRulesModal({
  sim,
  onClose,
  onChanged,
}: {
  sim: KeepAliveSimSummary;
  onClose: () => void;
  onChanged?: (sim: KeepAliveSimSummary) => Promise<void> | void;
}) {
  const [current, setCurrent] = useState(sim);
  const [ruleEditor, setRuleEditor] = useState<KeepAliveRuleRecord | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function announceReminderStateChanged() {
    window.dispatchEvent(new Event(REMINDER_STATE_CHANGED_EVENT));
  }

  async function refresh() {
    const response = await fetch("/api/keep-alive", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "保号规则加载失败");
    const next = (data.sims || []).find((item: KeepAliveSimSummary) => item.id === current.id);
    if (!next) throw new Error("没有找到当前号码的保号规则数据");
    setCurrent(next);
    announceReminderStateChanged();
    await onChanged?.(next);
  }

  async function deleteRule(rule: KeepAliveRuleRecord) {
    if (!window.confirm(`确定删除保号规则“${rule.name}”吗？历史活动记录不会删除。`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/keep-alive?type=rule&id=${rule.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除规则失败");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除规则失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog onClose={onClose} busy={busy} size="lg" dataAttribute="sim-keep-alive-rules">
        <DialogHeader
          eyebrow="号码生命周期"
          icon={<ShieldCheck className="h-4 w-4" />}
          title="保号规则"
          description={`${current.label}${current.phoneNumber ? ` · ${current.phoneNumber}` : ""} · ${current.carrierName}`}
          onClose={onClose}
          busy={busy}
        />

        <DialogBody className="space-y-4">
          {error ? <DialogAlert>{error}</DialogAlert> : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-ink">这张号码的保号规则</div>
              <p className="mt-1 text-xs leading-5 text-ink-muted">一张号码可以同时配置多条规则；每条规则都可以独立编辑、停用或删除。</p>
            </div>
            <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={() => setRuleEditor(null)} disabled={busy}>
              <Plus className="h-3.5 w-3.5" />添加规则
            </Button>
          </div>

          {current.rules.length ? (
            <div className="space-y-3">
              {current.rules.map((rule) => (
                <div key={rule.id} className={`rounded-2xl border p-4 ${rule.enabled ? "border-line bg-surface" : "border-line-subtle bg-surface-subtle"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink">{rule.name}</span>
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${ruleStatusClass(rule.status)}`}>{getKeepAliveRuleStatusLabel(rule.status)}</span>
                        <span className="rounded-md bg-surface-subtle px-2 py-0.5 text-[10px] text-ink-muted ring-1 ring-inset ring-line">{getKeepAliveDueDateSourceLabel(rule.dueDateSource)}</span>
                      </div>
                      <div className="mt-1.5 text-xs leading-5 text-ink-muted">
                        每 {getKeepAliveIntervalLabel(rule.intervalValue, rule.intervalUnit)} · {rule.qualifyingActions.map(getKeepAliveActivityLabel).join(" / ")}
                      </div>
                      {getKeepAliveRechargeRequirementLabel(rule.minimumRechargeAmount, rule.rechargeCurrencyCode) ? (
                        <div className="mt-1 text-xs font-medium text-ink-secondary">充值要求：{getKeepAliveRechargeRequirementLabel(rule.minimumRechargeAmount, rule.rechargeCurrencyCode)}</div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRuleEditor(rule)} disabled={busy} title="编辑规则" aria-label={`编辑 ${rule.name}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => void deleteRule(rule)} disabled={busy} title="删除规则" aria-label={`删除 ${rule.name}`}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between rounded-xl bg-surface-subtle px-3 py-2.5">
                    <div>
                      <div className="text-[10px] text-ink-faint">{rule.dueDateSource === "sim_validity" ? "下一次操作日期 · 跟随号码有效期" : "下一次操作日期"}</div>
                      <div className="mt-0.5 text-sm font-medium tabular-nums text-ink-secondary">{rule.nextDueDate || "待设置"}</div>
                    </div>
                    <CalendarClock className="h-4 w-4 text-ink-faint" />
                  </div>

                  {rule.notes ? <div className="mt-2 line-clamp-2 text-xs leading-5 text-ink-muted">{rule.notes}</div> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-8 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="mt-4 text-sm font-medium text-ink">目前还没有保号规则</div>
              <p className="mt-1 max-w-md text-xs leading-5 text-ink-muted">添加规则后，可以分别维护充值、短信、通话、流量或其他运营商要求的保号周期。</p>
              <Button type="button" variant="secondary" size="sm" className="mt-4 gap-1.5" onClick={() => setRuleEditor(null)}>
                <Plus className="h-3.5 w-3.5" />添加规则
              </Button>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>关闭</Button>
        </DialogFooter>
      </Dialog>

      {ruleEditor !== undefined ? (
        <KeepAliveRuleModal
          simId={current.id}
          simLabel={current.label}
          simValidUntil={current.validUntil}
          simCurrencyCode={current.currencyCode}
          rule={ruleEditor}
          onClose={() => setRuleEditor(undefined)}
          onSaved={refresh}
        />
      ) : null}
    </>
  );
}
