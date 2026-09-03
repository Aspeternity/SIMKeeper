import type { ReminderKind } from "@/lib/reminders";

export const REMINDER_ACTIONS = ["completed", "snoozed", "ignored"] as const;
export type ReminderActionType = (typeof REMINDER_ACTIONS)[number];

export type ReminderActionRecord = {
  id: number;
  reminderKey: string;
  simId: number;
  simLabel: string;
  kind: ReminderKind;
  title: string;
  dueDate: string | null;
  action: ReminderActionType;
  snoozeUntil: string | null;
  actedAt: string;
};

export function getReminderActionLabel(action: ReminderActionType) {
  if (action === "completed") return "已处理";
  if (action === "snoozed") return "稍后提醒";
  return "已忽略本次";
}
