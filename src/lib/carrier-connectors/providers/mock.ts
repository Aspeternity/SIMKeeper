import "server-only";

import {
  CONNECTOR_ACCOUNT_STATUS_OPTIONS,
  type CarrierConnectorProvider,
  type ConnectorAccountStatus,
  type NormalizedCarrierSyncResult,
} from "@/lib/carrier-connectors/types";

const ACCOUNT_STATUSES = new Set<ConnectorAccountStatus>(
  CONNECTOR_ACCOUNT_STATUS_OPTIONS.map((item) => item.value),
);

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function nullableCurrency(value: unknown, balance: number | null) {
  if (balance === null) return null;
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("模拟数据源填写余额时必须提供 3 位币种代码");
  }
  return normalized;
}

function nullableDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("模拟数据源的余额有效期格式不正确");
  }
  return normalized;
}

function accountStatus(value: unknown): ConnectorAccountStatus {
  return typeof value === "string" && ACCOUNT_STATUSES.has(value as ConnectorAccountStatus)
    ? value as ConnectorAccountStatus
    : "unknown";
}

export const mockCarrierConnectorProvider: CarrierConnectorProvider = {
  id: "mock",
  label: "模拟数据源",
  description: "用于验证连接、同步、快照、过期判断和凭据加密框架，不会访问任何真实运营商。",
  configFields: [
    {
      key: "balance",
      label: "余额",
      type: "number",
      placeholder: "10.30",
      defaultValue: 10,
      description: "留空表示余额未知。",
    },
    {
      key: "currencyCode",
      label: "币种",
      type: "text",
      placeholder: "PHP",
      defaultValue: "PHP",
    },
    {
      key: "balanceValidUntil",
      label: "余额有效期",
      type: "date",
      defaultValue: "",
    },
    {
      key: "accountStatus",
      label: "账户状态",
      type: "select",
      defaultValue: "active",
      options: CONNECTOR_ACCOUNT_STATUS_OPTIONS,
    },
    {
      key: "simulateFailure",
      label: "模拟同步失败",
      type: "checkbox",
      defaultValue: false,
      description: "用于验证错误状态、上次成功时间和旧快照保留。",
    },
  ],
  credentialFields: [
    {
      key: "testToken",
      label: "测试凭据",
      description: "可选。仅用于验证加密保存流程，模拟 Provider 不会实际使用。",
      required: false,
      placeholder: "可选",
    },
  ],
  async authenticate() {
    return;
  },
  async refreshSession() {
    return;
  },
  async disconnect() {
    return;
  },
  async sync(context): Promise<NormalizedCarrierSyncResult> {
    if (context.config.simulateFailure === true) {
      throw new Error("模拟数据源已按配置返回同步失败");
    }

    const balance = nullableNumber(context.config.balance);
    return {
      balance,
      currencyCode: nullableCurrency(context.config.currencyCode, balance),
      balanceValidUntil: nullableDate(context.config.balanceValidUntil),
      accountStatus: accountStatus(context.config.accountStatus),
    };
  },
};
