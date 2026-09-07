import {
  getReminderKindLabel,
  getReminderRelativeLabel,
  getReminderStatusLabel,
  getReminderTaskHref,
  type ReminderItem,
  type ReminderKind,
  type ReminderStatus,
} from "@/lib/reminders";

export type AttentionSource = "lifecycle" | "carrier_connector" | "balance";
export type AttentionKind = ReminderKind | "connector_health" | "low_balance";
export type AttentionPriority = "critical" | "attention" | "watch" | "setup";
export type AttentionSection = "now" | "soon" | "setup";

export type AttentionItem = {
  key: string;
  source: AttentionSource;
  kind: AttentionKind;
  kindLabel: string;
  priority: AttentionPriority;
  priorityLabel: string;
  section: AttentionSection;
  subjectType: "sim";
  subjectId: number;
  subjectLabel: string;
  subjectMeta: string;
  title: string;
  detail: string;
  dueDate: string | null;
  relativeLabel: string;
  status: string;
  statusLabel: string;
  href: string;
  actionLabel: string;
  reminderKey: string | null;
  canSnooze: boolean;
  canIgnore: boolean;
};

const priorityRank: Record<AttentionPriority, number> = {
  critical: 0,
  attention: 1,
  watch: 2,
  setup: 3,
};

export function getAttentionPriority(status: ReminderStatus): AttentionPriority {
  if (status === "overdue") return "critical";
  if (status === "grace" || status === "today") return "attention";
  if (status === "upcoming") return "watch";
  return "setup";
}

export function getAttentionPriorityLabel(priority: AttentionPriority) {
  if (priority === "critical") return "需要立即处理";
  if (priority === "attention") return "优先处理";
  if (priority === "watch") return "近期关注";
  return "待补充设置";
}

export function getAttentionSection(priority: AttentionPriority): AttentionSection {
  if (priority === "critical" || priority === "attention") return "now";
  if (priority === "watch") return "soon";
  return "setup";
}

function getAttentionActionLabel(priority: AttentionPriority) {
  if (priority === "setup") return "去设置";
  if (priority === "watch") return "查看处理";
  return "立即处理";
}

export function reminderToAttentionItem(reminder: ReminderItem): AttentionItem {
  const priority = getAttentionPriority(reminder.status);
  return {
    key: `lifecycle:${reminder.key}:${reminder.dueDate ?? "none"}`,
    source: "lifecycle",
    kind: reminder.kind,
    kindLabel: getReminderKindLabel(reminder.kind),
    priority,
    priorityLabel: getAttentionPriorityLabel(priority),
    section: getAttentionSection(priority),
    subjectType: "sim",
    subjectId: reminder.simId,
    subjectLabel: reminder.simLabel,
    subjectMeta: [reminder.carrierName, reminder.phoneNumber].filter(Boolean).join(" · "),
    title: reminder.title,
    detail: reminder.detail,
    dueDate: reminder.dueDate,
    relativeLabel: getReminderRelativeLabel(reminder),
    status: reminder.status,
    statusLabel: getReminderStatusLabel(reminder.status),
    href: getReminderTaskHref(reminder),
    actionLabel: getAttentionActionLabel(priority),
    reminderKey: reminder.key,
    canSnooze: true,
    canIgnore: true,
  };
}

export function buildAttentionItems(reminders: ReminderItem[]) {
  return reminders
    .map(reminderToAttentionItem)
    .sort((a, b) => {
      const priorityDiff = priorityRank[a.priority] - priorityRank[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      if (!a.dueDate && !b.dueDate) return a.subjectLabel.localeCompare(b.subjectLabel);
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate) || a.subjectLabel.localeCompare(b.subjectLabel);
    });
}

export function getAttentionSummary(items: AttentionItem[]) {
  return {
    total: items.length,
    critical: items.filter((item) => item.priority === "critical").length,
    now: items.filter((item) => item.section === "now").length,
    soon: items.filter((item) => item.section === "soon").length,
    setup: items.filter((item) => item.section === "setup").length,
  };
}
