import { daysBetweenDates, getKeepAliveRechargeRequirementLabel, getKeepAliveRuleStatus } from "@/lib/keep-alive";

export type ReminderKind = "sim_validity" | "keep_alive";
export type ReminderStatus = "overdue" | "grace" | "today" | "upcoming" | "unscheduled";

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
  upcoming: 3,
  unscheduled: 4,
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
    if (sim.status === "closed") continue;

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
          href: `/sims/${sim.id}?section=validity`,
          detail: sim.validUntil
            ? `号码有效期将在 ${sim.validUntil} 到期 · 跟随保号规则“${linkedValidityRule.name}” · 提前 ${linkedValidityRule.warningDays} 天提醒${requirement ? ` · 操作要求：${requirement}` : ""}`
            : `跟随号码有效期的保号规则“${linkedValidityRule.name}”已启用，但号码尚未设置有效期${requirement ? ` · 操作要求：${requirement}` : ""}`,
          requirement,
        });
      }
    } else if (sim.validUntil) {
      const days = daysBetweenDates(today, sim.validUntil);
      if (days <= validityWarningDays) {
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
          status: days < 0 ? "overdue" : days === 0 ? "today" : "upcoming",
          days,
          href: `/sims/${sim.id}?section=validity`,
          detail: `号码有效期将在 ${sim.validUntil} 到期`,
          requirement: null,
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
        href: `/sims/${sim.id}?section=keep-alive&rule=${rule.id}`,
        detail: rule.nextDueDate
          ? `下一次保号操作日期 ${rule.nextDueDate} · 提前 ${rule.warningDays} 天提醒${requirement ? ` · 操作要求：${requirement}` : ""}`
          : `该保号规则尚未设置下一次操作日期${requirement ? ` · 操作要求：${requirement}` : ""}`,
        requirement,
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
  }
}

export function getReminderKindLabel(kind: ReminderKind) {
  return kind === "sim_validity" ? "号码有效期" : "保号规则";
}

export function getReminderRelativeLabel(item: Pick<ReminderItem, "status" | "days">) {
  if (item.status === "unscheduled" || item.days === null) return "待设置日期";
  if (item.status === "today") return "今天";
  if (item.status === "grace") return `已过期 ${Math.abs(item.days)} 天 · 宽限期内`;
  if (item.status === "overdue") return `已逾期 ${Math.abs(item.days)} 天`;
  return `还有 ${item.days} 天`;
}
