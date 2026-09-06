export type CarrierConnectorStatus = "connected" | "error";

export type ConnectorAccountStatus =
  | "active"
  | "suspended"
  | "expired"
  | "closed"
  | "unknown";

export type ConnectorCredentialField = {
  key: string;
  label: string;
  description?: string;
  required?: boolean;
};

export type CarrierConnectorProviderPublic = {
  id: string;
  label: string;
  description: string;
  credentialFields: ConnectorCredentialField[];
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

export function getConnectorAccountStatusLabel(value: string | null | undefined) {
  return CONNECTOR_ACCOUNT_STATUS_OPTIONS.find((item) => item.value === value)?.label ?? "未知";
}

export function getConnectorSyncIntervalLabel(value: number) {
  return CONNECTOR_SYNC_INTERVAL_OPTIONS.find((item) => item.value === value)?.label ?? `${value} 分钟`;
}
