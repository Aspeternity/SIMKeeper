export type CarrierConnectorStatus = "connected" | "error";

export type CarrierProviderErrorType =
  | "temporary"
  | "authentication"
  | "rate_limit"
  | "maintenance"
  | "configuration"
  | "unsupported"
  | "permanent";

export type CarrierConnectorHealthStatus =
  | "healthy"
  | "syncing"
  | "retrying"
  | "authentication"
  | "error"
  | "stale"
  | "paused"
  | "pending";

export type CarrierConnectorProviderMaturity = "experimental" | "beta" | "stable";

export type CarrierConnectorCapabilities = {
  automaticSync: boolean;
  balance: boolean;
  balanceValidity: boolean;
  simValidity: boolean;
  accountStatus: boolean;
  multiSim: boolean;
};

export type ConnectorAccountStatus =
  | "active"
  | "suspended"
  | "expired"
  | "closed"
  | "unknown";

export type ConnectorFieldOption = {
  value: string;
  label: string;
};

export type ConnectorConfigField = {
  key: string;
  label: string;
  description?: string;
  required?: boolean;
  type?: "text" | "url" | "number" | "date" | "select" | "checkbox" | "textarea";
  placeholder?: string;
  defaultValue?: string | number | boolean;
  options?: ConnectorFieldOption[];
};

export type ConnectorCredentialField = {
  key: string;
  label: string;
  description?: string;
  required?: boolean;
  placeholder?: string;
};

export type CarrierConnectorProviderPublic = {
  id: string;
  label: string;
  description: string;
  maturity?: CarrierConnectorProviderMaturity;
  availabilityNote?: string;
  capabilities?: CarrierConnectorCapabilities;
  configFields: ConnectorConfigField[];
  credentialFields: ConnectorCredentialField[];
  minLinkedSims?: number;
  maxLinkedSims?: number;
};

export type CarrierConnectorSimContext = {
  id: number;
  label: string;
  phoneNumber: string | null;
  carrierName: string;
  countryCode: string;
  balance: number | null;
  currencyCode: string | null;
};

export type CarrierConnectorProviderContext = {
  connectorId: number;
  connectorName: string;
  config: Record<string, unknown>;
  credentials: Record<string, string>;
};

export type CarrierConnectorSyncContext = CarrierConnectorProviderContext & {
  sim: CarrierConnectorSimContext;
};

export type NormalizedCarrierSyncResult = {
  balance: number | null;
  currencyCode: string | null;
  balanceValidUntil: string | null;
  accountStatus: ConnectorAccountStatus;
};

export type CarrierConnectorProvider = CarrierConnectorProviderPublic & {
  authenticate?: (
    context: CarrierConnectorProviderContext,
  ) => Promise<{ credentials?: Record<string, string> } | void>;
  refreshSession?: (
    context: CarrierConnectorProviderContext,
  ) => Promise<{ credentials?: Record<string, string> } | void>;
  disconnect?: (context: CarrierConnectorProviderContext) => Promise<void>;
  sync: (context: CarrierConnectorSyncContext) => Promise<NormalizedCarrierSyncResult>;
};

export const CONNECTOR_SYNC_INTERVAL_OPTIONS = [
  { value: 0, label: "仅手动同步" },
  { value: 360, label: "每 6 小时" },
  { value: 720, label: "每 12 小时" },
  { value: 1440, label: "每天一次" },
] as const;

export const CONNECTOR_ACCOUNT_STATUS_OPTIONS: Array<{
  value: ConnectorAccountStatus;
  label: string;
}> = [
  { value: "active", label: "正常" },
  { value: "suspended", label: "暂停 / 受限" },
  { value: "expired", label: "已过期" },
  { value: "closed", label: "已关闭" },
  { value: "unknown", label: "未知" },
];

export const CONNECTOR_HEALTH_STATUS_LABELS: Record<CarrierConnectorHealthStatus, string> = {
  healthy: "正常",
  syncing: "正在同步",
  retrying: "等待重试",
  authentication: "认证失效",
  error: "同步异常",
  stale: "数据过期",
  paused: "已暂停",
  pending: "等待首次同步",
};

export const CONNECTOR_PROVIDER_MATURITY_LABELS: Record<CarrierConnectorProviderMaturity, string> = {
  experimental: "实验性",
  beta: "Beta",
  stable: "稳定",
};

export const CONNECTOR_CAPABILITY_LABELS: Array<{
  key: keyof CarrierConnectorCapabilities;
  label: string;
}> = [
  { key: "automaticSync", label: "自动同步" },
  { key: "balance", label: "余额" },
  { key: "balanceValidity", label: "余额有效期" },
  { key: "simValidity", label: "号码有效期" },
  { key: "accountStatus", label: "账户状态" },
  { key: "multiSim", label: "多号码连接" },
];

export function getConnectorHealthStatusLabel(value: CarrierConnectorHealthStatus | string | null | undefined) {
  if (!value) return "未知";
  return CONNECTOR_HEALTH_STATUS_LABELS[value as CarrierConnectorHealthStatus] ?? "未知";
}

export function getConnectorProviderMaturityLabel(value: CarrierConnectorProviderMaturity | string | null | undefined) {
  if (!value) return "未标记";
  return CONNECTOR_PROVIDER_MATURITY_LABELS[value as CarrierConnectorProviderMaturity] ?? "未标记";
}

export function getConnectorAccountStatusLabel(value: string | null | undefined) {
  return CONNECTOR_ACCOUNT_STATUS_OPTIONS.find((item) => item.value === value)?.label ?? "未知";
}

export function getConnectorSyncIntervalLabel(value: number) {
  return CONNECTOR_SYNC_INTERVAL_OPTIONS.find((item) => item.value === value)?.label ?? `${value} 分钟`;
}
