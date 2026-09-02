import type { KeepAliveRuleStatus } from "@/lib/keep-alive";

export type KeepAliveRuleRecord = {
  id: number;
  simId: number;
  name: string;
  intervalValue: number;
  intervalUnit: string;
  qualifyingActions: string[];
  nextDueDate: string | null;
  warningDays: number;
  gracePeriodDays: number;
  enabled: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  status: KeepAliveRuleStatus;
  days: number | null;
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
