import "server-only";

import {
  getLowBalanceReminderItems,
  getSyncHealthReminderItems,
} from "@/lib/condition-episodes";
import { getLifecycleToday } from "@/lib/lifecycle-engine";
import { getRawCurrentReminderItems as getRawLifecycleReminderItems } from "@/lib/notifications";
import { formatPhoneNumber } from "@/lib/phone-format";
import { filterReminderItems } from "@/lib/reminder-actions";
import type { ReminderItem, ReminderStatus } from "@/lib/reminders";

const statusRank: Record<ReminderStatus, number> = {
  overdue: 0,
  grace: 1,
  today: 2,
  condition: 3,
  upcoming: 4,
  unscheduled: 5,
};

function sortUnifiedReminders(items: ReminderItem[]) {
  return items.sort((a, b) => {
    const rank = statusRank[a.status] - statusRank[b.status];
    if (rank !== 0) return rank;
    if (!a.dueDate && !b.dueDate) return a.simLabel.localeCompare(b.simLabel);
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate) || a.simLabel.localeCompare(b.simLabel);
  });
}

function normalizeReminderDisplay(item: ReminderItem): ReminderItem {
  return {
    ...item,
    phoneNumber: item.phoneNumber ? formatPhoneNumber(item.phoneNumber, item.phoneNumber) : null,
  };
}

export function getRawUnifiedReminderItems(today = getLifecycleToday()) {
  return sortUnifiedReminders([
    ...getRawLifecycleReminderItems(today),
    ...getLowBalanceReminderItems(),
    ...getSyncHealthReminderItems(),
  ].map(normalizeReminderDisplay));
}

export function getUnifiedReminderItems(today = getLifecycleToday()) {
  return filterReminderItems(getRawUnifiedReminderItems(today), today);
}
