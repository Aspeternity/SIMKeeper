import type { KeepAliveDueDateSource, KeepAliveRuleStatus } from "@/lib/keep-alive";
import type { ReminderActionRecord } from "@/lib/reminder-action-types";

export type KeepAliveRuleRecord = {
  id: number;
  simId: number;
  name: string;
  intervalValue: number;
  intervalUnit: string;
  qualifyingActions: string[];
  minimumRechargeAmount: number | null;
  rechargeCurrencyCode: string | null;
  dueDateSource: KeepAliveDueDateSource;
  nextDueDate: string | null;
  warningDays: number;
  gracePeriodDays: number;
  enabled: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  status: KeepAliveRuleStatus;
  days: number | null;
  reminderAction: ReminderActionRecord | null;
};

export type KeepAliveEventRecord = {
  id: number;
  simId: number;
  activityType: string;
  activityDate: string;
  amount: number | null;
  currencyCode: string | null;
  balanceAfter: number | null;
  validUntilAfter: string | null;
  notes: string | null;
  createdAt: string;
};

export type KeepAliveSimSummary = {
  id: number;
  label: string;
  phoneNumber: string | null;
  status: string;
  balance: number | null;
  currencyCode: string | null;
  validUntil: string | null;
  carrierName: string;
  country: string;
  countryCode: string;
  rules: KeepAliveRuleRecord[];
  latestEvent: KeepAliveEventRecord | null;
};
