export const KEEP_ALIVE_INTERVAL_UNITS = [
  { value: "day", label: "天" },
  { value: "month", label: "个月" },
  { value: "year", label: "年" },
] as const;

export const KEEP_ALIVE_ACTIVITY_TYPES = [
  { value: "recharge", label: "充值" },
  { value: "outgoing_call", label: "拨出电话" },
  { value: "outgoing_sms", label: "发送短信" },
  { value: "data_usage", label: "使用移动数据" },
  { value: "plan_renewal", label: "续订套餐 / 通行证" },
  { value: "chargeable_activity", label: "其他付费活动" },
  { value: "manual_extension", label: "手动延期 / 运营商延长" },
  { value: "other", label: "其他记录" },
] as const;

export const KEEP_ALIVE_DUE_DATE_SOURCES = [
  { value: "sim_validity", label: "跟随号码有效期" },
  { value: "independent", label: "独立日期" },
] as const;

export type KeepAliveIntervalUnit = (typeof KEEP_ALIVE_INTERVAL_UNITS)[number]["value"];
export type KeepAliveActivityType = (typeof KEEP_ALIVE_ACTIVITY_TYPES)[number]["value"];
export type KeepAliveDueDateSource = (typeof KEEP_ALIVE_DUE_DATE_SOURCES)[number]["value"];

export type KeepAliveRuleStatus = "disabled" | "unscheduled" | "ok" | "due_soon" | "grace" | "overdue";

export function getKeepAliveActivityLabel(value: string) {
  return KEEP_ALIVE_ACTIVITY_TYPES.find((item) => item.value === value)?.label ?? value;
}

export function getKeepAliveIntervalLabel(value: number, unit: string) {
  const unitLabel = KEEP_ALIVE_INTERVAL_UNITS.find((item) => item.value === unit)?.label ?? unit;
  return `${value} ${unitLabel}`;
}

export function getKeepAliveDueDateSourceLabel(value: string) {
  return KEEP_ALIVE_DUE_DATE_SOURCES.find((item) => item.value === value)?.label ?? value;
}

export function resolveKeepAliveRuleDueDate({
  dueDateSource,
  nextDueDate,
  simValidUntil,
}: {
  dueDateSource: string | null | undefined;
  nextDueDate: string | null | undefined;
  simValidUntil: string | null | undefined;
}) {
  return dueDateSource === "sim_validity" ? simValidUntil || null : nextDueDate || null;
}

export function parseQualifyingActions(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function formatUtcDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysInUtcMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function addKeepAliveInterval(dateString: string, value: number, unit: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  if (!year || !month || !day || !Number.isInteger(value) || value <= 0) return dateString;

  if (unit === "day") {
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + value);
    return formatUtcDate(date);
  }

  if (unit === "month") {
    const targetMonthIndex = month - 1 + value;
    const targetYear = year + Math.floor(targetMonthIndex / 12);
    const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
    const targetDay = Math.min(day, daysInUtcMonth(targetYear, normalizedMonth));
    return formatUtcDate(new Date(Date.UTC(targetYear, normalizedMonth, targetDay)));
  }

  if (unit === "year") {
    const targetYear = year + value;
    const targetMonth = month - 1;
    const targetDay = Math.min(day, daysInUtcMonth(targetYear, targetMonth));
    return formatUtcDate(new Date(Date.UTC(targetYear, targetMonth, targetDay)));
  }

  return dateString;
}

export function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function daysBetweenDates(from: string, to: string) {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86400000);
}

export function getKeepAliveRuleStatus({
  enabled,
  nextDueDate,
  warningDays,
  gracePeriodDays,
  today = localDateString(),
}: {
  enabled: boolean;
  nextDueDate: string | null | undefined;
  warningDays: number;
  gracePeriodDays: number;
  today?: string;
}): { status: KeepAliveRuleStatus; days: number | null } {
  if (!enabled) return { status: "disabled", days: null };
  if (!nextDueDate) return { status: "unscheduled", days: null };

  const days = daysBetweenDates(today, nextDueDate);
  if (days < -Math.max(0, gracePeriodDays)) return { status: "overdue", days };
  if (days < 0) return { status: "grace", days };
  if (days <= Math.max(0, warningDays)) return { status: "due_soon", days };
  return { status: "ok", days };
}

export function getKeepAliveRuleStatusLabel(status: KeepAliveRuleStatus) {
  switch (status) {
    case "disabled":
      return "已停用";
    case "unscheduled":
      return "待设置日期";
    case "due_soon":
      return "即将需要处理";
    case "grace":
      return "宽限期";
    case "overdue":
      return "已逾期";
    default:
      return "正常";
  }
}