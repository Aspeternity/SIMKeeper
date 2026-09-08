export const LIFECYCLE_TIME_ZONE = "Asia/Shanghai";

export type LifecycleDeadlineState =
  | "disabled"
  | "unscheduled"
  | "healthy"
  | "watch"
  | "due_today"
  | "grace"
  | "overdue";

export type LifecycleDeadlineEvaluation = {
  state: LifecycleDeadlineState;
  days: number | null;
  actionable: boolean;
};

function formatDateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function getLifecycleToday(date = new Date()) {
  return formatDateInTimeZone(date, LIFECYCLE_TIME_ZONE);
}

export function isLifecycleDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function daysBetweenLifecycleDates(from: string, to: string) {
  if (!isLifecycleDate(from) || !isLifecycleDate(to)) return Number.NaN;
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86400000);
}

export function evaluateLifecycleDeadline({
  enabled,
  dueDate,
  warningDays,
  gracePeriodDays,
  today = getLifecycleToday(),
}: {
  enabled: boolean;
  dueDate: string | null | undefined;
  warningDays: number;
  gracePeriodDays: number;
  today?: string;
}): LifecycleDeadlineEvaluation {
  if (!enabled) return { state: "disabled", days: null, actionable: false };
  if (!isLifecycleDate(dueDate)) return { state: "unscheduled", days: null, actionable: true };

  const days = daysBetweenLifecycleDates(today, dueDate);
  if (!Number.isFinite(days)) return { state: "unscheduled", days: null, actionable: true };

  const grace = Math.max(0, Math.trunc(gracePeriodDays || 0));
  const warning = Math.max(0, Math.trunc(warningDays || 0));

  if (days < -grace) return { state: "overdue", days, actionable: true };
  if (days < 0) return { state: "grace", days, actionable: true };
  if (days === 0) return { state: "due_today", days, actionable: true };
  if (days <= warning) return { state: "watch", days, actionable: true };
  return { state: "healthy", days, actionable: false };
}

export function isLifecycleEligibleSimStatus(status: string | null | undefined) {
  return status === "active";
}

export function getLifecycleOccurrenceKey(subjectKey: string, dueDate: string | null | undefined) {
  return `${subjectKey}\u0000${dueDate ?? ""}`;
}
