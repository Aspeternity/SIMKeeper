export type SimHealthStatus = "healthy" | "attention" | "critical" | "setup" | "paused" | "inactive";
export type SimHealthReasonSeverity = "critical" | "attention" | "setup";
export type SimHealthReasonSource = "lifecycle" | "balance" | "connector" | "account" | "sim_status";

export type SimHealthReason = {
  key: string;
  source: SimHealthReasonSource;
  severity: SimHealthReasonSeverity;
  title: string;
  detail: string;
  href: string;
};

export type SimHealthItem = {
  simId: number;
  simLabel: string;
  phoneNumber: string | null;
  carrierName: string;
  country: string;
  simStatus: string;
  healthStatus: SimHealthStatus;
  healthLabel: string;
  summary: string;
  primaryReason: SimHealthReason | null;
  reasons: SimHealthReason[];
  updatedAt: string | null;
};

export type SimHealthSummary = {
  total: number;
  healthy: number;
  attention: number;
  critical: number;
  setup: number;
  paused: number;
  inactive: number;
  needsAttention: number;
};

export type SimHealthOverview = {
  items: SimHealthItem[];
  summary: SimHealthSummary;
};

export function getSimHealthStatusLabel(status: SimHealthStatus) {
  if (status === "healthy") return "正常";
  if (status === "attention") return "需要关注";
  if (status === "critical") return "紧急";
  if (status === "setup") return "配置不完整";
  if (status === "paused") return "已暂停";
  return "已停用";
}
