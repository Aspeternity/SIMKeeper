import "server-only";

import type {
  CarrierConnectorProvider,
  ConnectorAccountStatus,
  NormalizedCarrierSyncResult,
} from "@/lib/carrier-connectors/types";

const ACCOUNT_STATUSES = new Set<ConnectorAccountStatus>([
  "active",
  "suspended",
  "expired",
  "closed",
  "unknown",
]);

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
  credentialFields: [
    {
      key: "testToken",
      label: "测试凭据",
      description: "可选。仅用于验证加密保存流程，模拟 Provider 不会实际使用。",
      required: false,
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
