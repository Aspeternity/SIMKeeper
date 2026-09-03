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
  verified: boolean;
};

export function getReminderActionLabel(action: ReminderActionType) {
  if (action === "completed") return "已完成处理";
  if (action === "snoozed") return "稍后提醒";
  return "已忽略本轮";
}

export function getReminderActionRecordLabel(action: Pick<ReminderActionRecord, "action" | "snoozeUntil" | "verified">) {
  if (action.action === "snoozed") return action.snoozeUntil ? `已暂缓至 ${action.snoozeUntil}` : "已暂缓提醒";
  if (action.action === "ignored") return "本轮提醒已忽略";
  return action.verified ? "已完成实际处理" : "旧版“已处理”未核验";
}
