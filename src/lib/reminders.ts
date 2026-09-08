import { getKeepAliveRechargeRequirementLabel, getKeepAliveRuleStatus } from "@/lib/keep-alive";
import { isLifecycleEligibleSimStatus } from "@/lib/lifecycle-engine";

export type ReminderKind = "sim_validity" | "keep_alive" | "low_balance" | "sync_health";
export type ReminderStatus = "overdue" | "grace" | "today" | "upcoming" | "unscheduled" | "condition";

export const REMINDER_STATE_CHANGED_EVENT = "simkeeper:reminder-state-changed";
export const REMINDER_TASK_FOCUS_EVENT = "simkeeper:reminder-task-focus";

export type ReminderItem = {
  key: string;
  simId: number;
  simLabel: string;
  phoneNumber: string | null;
  carrierName: string;
  country: string;
  kind: ReminderKind;
  title: string;
  dueDate: string | null;
  status: ReminderStatus;
  days: number | null;
  href: string;
  detail: string;
  requirement?: string | null;
  warningDays?: number;
  gracePeriodDays?: number;
  conditionState?: "active" | "recovered";
  notificationPolicy?: "default" | "once";
};

type ReminderSim = {
  id: number;
  label: string;
  phoneNumber: string | null;
  status: string;
  validUntil: string | null;
  carrierName: string;
  country: string;
};

type ReminderRule = {
  id: number;
  simId: number;
  name: string;
  dueDateSource?: string | null;
  nextDueDate: string | null;
  warningDays: number;
  gracePeriodDays: number;
  enabled: boolean;
  minimumRechargeAmount?: number | null;
  rechargeCurrencyCode?: string | null;
};

const statusRank: Record<ReminderStatus, number> = {
  overdue: 0,
  grace: 1,
  today: 2,
  condition: 3,
  upcoming: 4,
  unscheduled: 5,
};

function reminderStatusFromRuleState(state: { status: string; days: number | null }): ReminderStatus | null {
  if (state.status === "ok" || state.status === "disabled") return null;
  if (state.status === "overdue") return "overdue";
  if (state.status === "grace") return "grace";
  if (state.status === "unscheduled") return "unscheduled";
  return state.days === 0 ? "today" : "upcoming";
}

function ruleRequirement(rule: ReminderRule) {
  return getKeepAliveRechargeRequirementLabel(rule.minimumRechargeAmount, rule.rechargeCurrencyCode);
}

export function getReminderTaskAnchor(item: Pick<ReminderItem, "key" | "dueDate">) {
  return `task-${item.key}-${item.dueDate ?? "none"}`;
}

export function getReminderTaskHref(item: Pick<ReminderItem, "key" | "dueDate">) {
  return `/reminders#${getReminderTaskAnchor(item)}`;
}

export function buildReminderItems({
  sims,
  rules,
  today,
  validityWarningDays = 30,
}: {
  sims: ReminderSim[];
  rules: ReminderRule[];
  today: string;
  validityWarningDays?: number;
}) {
  const rulesBySim = new Map<number, ReminderRule[]>();
  for (const rule of rules) {
    const list = rulesBySim.get(rule.simId) ?? [];
    list.push(rule);
    rulesBySim.set(rule.simId, list);
  }

  const reminders: ReminderItem[] = [];

  for (const sim of sims) {
    if (!isLifecycleEligibleSimStatus(sim.status)) continue;

    const simRules = rulesBySim.get(sim.id) ?? [];
    const linkedValidityRule = simRules.find((rule) => rule.enabled && rule.dueDateSource === "sim_validity");

    if (linkedValidityRule) {
      const state = getKeepAliveRuleStatus({
        enabled: linkedValidityRule.enabled,
        nextDueDate: sim.validUntil,
        warningDays: linkedValidityRule.warningDays,
        gracePeriodDays: linkedValidityRule.gracePeriodDays,
        today,
      });
      const status = reminderStatusFromRuleState(state);
      if (status) {
        const requirement = ruleRequirement(linkedValidityRule);
        reminders.push({
          key: `validity-${sim.id}`,
          simId: sim.id,
          simLabel: sim.label,
          phoneNumber: sim.phoneNumber,
          carrierName: sim.carrierName,
          country: sim.country,
          kind: "sim_validity",
          title: requirement ? `号码有效期 · ${requirement}` : "号码有效期",
          dueDate: sim.validUntil,
          status,
          days: state.days,
          href: "/sims",
          detail: sim.validUntil
            ? `号码有效期将在 ${sim.validUntil} 到期 · 跟随保号规则“${linkedValidityRule.name}” · 提前 ${linkedValidityRule.warningDays} 天提醒${linkedValidityRule.gracePeriodDays > 0 ? ` · 宽限 ${linkedValidityRule.gracePeriodDays} 天` : ""}${requirement ? ` · 操作要求：${requirement}` : ""}`
            : `跟随号码有效期的保号规则“${linkedValidityRule.name}”已启用，但号码尚未设置有效期${requirement ? ` · 操作要求：${requirement}` : ""}`,
          requirement,
          warningDays: linkedValidityRule.warningDays,
          gracePeriodDays: linkedValidityRule.gracePeriodDays,
        });
      }
    } else if (sim.validUntil) {
      const state = getKeepAliveRuleStatus({
        enabled: true,
        nextDueDate: sim.validUntil,
        warningDays: validityWarningDays,
        gracePeriodDays: 0,
        today,
      });
      const status = reminderStatusFromRuleState(state);
      if (status) {
        reminders.push({
          key: `validity-${sim.id}`,
          simId: sim.id,
          simLabel: sim.label,
          phoneNumber: sim.phoneNumber,
          carrierName: sim.carrierName,
          country: sim.country,
          kind: "sim_validity",
          title: "号码有效期",
          dueDate: sim.validUntil,
          status,
          days: state.days,
          href: "/sims",
          detail: `号码有效期将在 ${sim.validUntil} 到期 · 提前 ${validityWarningDays} 天提醒`,
          requirement: null,
          warningDays: validityWarningDays,
          gracePeriodDays: 0,
        });
      }
    }

    for (const rule of simRules) {
      if (!rule.enabled || rule.dueDateSource === "sim_validity") continue;
      const state = getKeepAliveRuleStatus({
        enabled: rule.enabled,
        nextDueDate: rule.nextDueDate,
        warningDays: rule.warningDays,
        gracePeriodDays: rule.gracePeriodDays,
        today,
      });
      const status = reminderStatusFromRuleState(state);
      if (!status) continue;
      const requirement = ruleRequirement(rule);

      reminders.push({
        key: `keep-alive-${rule.id}`,
        simId: sim.id,
        simLabel: sim.label,
        phoneNumber: sim.phoneNumber,
        carrierName: sim.carrierName,
        country: sim.country,
        kind: "keep_alive",
        title: `保号 · ${rule.name}${requirement ? ` · ${requirement}` : ""}`,
        dueDate: rule.nextDueDate,
        status,
        days: state.days,
        href: "/sims",
        detail: rule.nextDueDate
          ? `下一次保号操作日期 ${rule.nextDueDate} · 提前 ${rule.warningDays} 天提醒${rule.gracePeriodDays > 0 ? ` · 宽限 ${rule.gracePeriodDays} 天` : ""}${requirement ? ` · 操作要求：${requirement}` : ""}`
          : `该保号规则尚未设置下一次操作日期${requirement ? ` · 操作要求：${requirement}` : ""}`,
        requirement,
        warningDays: rule.warningDays,
        gracePeriodDays: rule.gracePeriodDays,
      });
    }
  }

  return reminders.sort((a, b) => {
    const statusDiff = statusRank[a.status] - statusRank[b.status];
    if (statusDiff !== 0) return statusDiff;
    if (!a.dueDate && !b.dueDate) return a.simLabel.localeCompare(b.simLabel);
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate) || a.simLabel.localeCompare(b.simLabel);
  });
}

export function getReminderStatusLabel(status: ReminderStatus) {
  switch (status) {
    case "overdue":
      return "已逾期";
    case "grace":
      return "宽限期";
    case "today":
      return "今天到期";
    case "upcoming":
      return "即将到期";
    case "unscheduled":
      return "待设置日期";
    case "condition":
      return "条件提醒";
  }
}

export function getReminderKindLabel(kind: ReminderKind) {
  if (kind === "sim_validity") return "号码有效期";
  if (kind === "keep_alive") return "保号规则";
  if (kind === "low_balance") return "低余额";
  return "同步健康";
}

export function getReminderRelativeLabel(
  item: Pick<ReminderItem, "status" | "days"> & Partial<Pick<ReminderItem, "kind" | "conditionState">>,
) {
  if (item.status === "condition") {
    if (item.conditionState === "recovered") return "已恢复";
    if (item.kind === "low_balance") return "余额低于提醒阈值";
    if (item.kind === "sync_health") return "需要检查同步";
    return "需要处理";
  }
  if (item.status === "unscheduled") return "待设置日期";
  if (item.days === null) return "待处理";
  if (item.status === "today") return "今天";
  if (item.status === "grace") return `已过期 ${Math.abs(item.days)} 天 · 宽限期内`;
  if (item.status === "overdue") return `已逾期 ${Math.abs(item.days)} 天`;
  return `还有 ${item.days} 天`;
}
