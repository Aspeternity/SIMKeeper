import "server-only";

import { CarrierProviderError } from "@/lib/carrier-connectors/errors";
import type {
  CarrierConnectorProvider,
  CarrierConnectorSimContext,
  ConnectorAccountStatus,
  NormalizedCarrierSyncResult,
} from "@/lib/carrier-connectors/types";
import {
  beginVoxiLogin,
  DEFAULT_BROWSER_USER_AGENT,
  normalizeVoxiBrowserUserAgent,
  requestVoxiAccountApi,
  verifyVoxiLoginOtp,
} from "@/lib/carrier-connectors/providers/voxi-native-http";
import {
  clearVoxiAuthenticatedSession,
  clearVoxiOneTimeAuthConfig,
  clearVoxiPendingAuth,
  deleteVoxiSession,
  pendingVoxiAuthMatchesUsername,
  readVoxiAuthenticatedSession,
  readVoxiPendingAuth,
  saveVoxiAuthenticatedSession,
  saveVoxiPendingAuth,
  type VoxiCookieJar,
} from "@/lib/carrier-connectors/providers/voxi-native-session";

type VoxiAccount = {
  id?: unknown;
  idHash?: unknown;
  status?: unknown;
};

type VoxiAccountsResponse = {
  accountDetails?: unknown;
};

type VoxiSubscription = {
  subscriptionId?: unknown;
  subscriptionIdHash?: unknown;
  phoneNumber?: unknown;
  status?: unknown;
  type?: unknown;
  paymentType?: unknown;
};

type VoxiSubscriptionsResponse = {
  subscriptionDetails?: unknown;
};

type VoxiSubscriptionResponse = {
  simBalance?: unknown;
};

type SelectedVoxiSubscription = {
  accountId: string;
  accountIdHash: string;
  subscriptionId: string;
  subscriptionIdHash: string;
  msisdn: string;
  status: string | null;
};

function assertVoxiSim(sim: CarrierConnectorSimContext) {
  if (sim.countryCode.toUpperCase() !== "GB") {
    throw new CarrierProviderError({
      type: "configuration",
      message: "VOXI My Account 只能同步英国号码",
    });
  }
  if (!sim.carrierName.toLowerCase().includes("voxi")) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "关联号码的运营商不是 VOXI",
    });
  }
}

function normalizeVoxiNumber(phoneNumber: string | null | undefined) {
  let digits = String(phoneNumber ?? "").replace(/\D/g, "");
  if (digits.startsWith("0044")) digits = digits.slice(2);
  if (/^07\d{9}$/.test(digits)) return `44${digits.slice(1)}`;
  if (/^447\d{9}$/.test(digits)) return digits;
  throw new CarrierProviderError({
    type: "configuration",
    message: "关联 SIM 缺少有效的英国 VOXI 手机号；请填写 07xxxxxxxxx 或 +44 7xxxxxxxxx",
  });
}

function comparableVoxiNumber(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  let digits = String(value).replace(/\D/g, "");
  if (digits.startsWith("0044")) digits = digits.slice(2);
  if (/^07\d{9}$/.test(digits)) return `44${digits.slice(1)}`;
  if (/^447\d{9}$/.test(digits)) return digits;
  return null;
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function normalizeVoxiUsername(value: unknown) {
  const username = typeof value === "string" ? value.trim() : "";
  if (!username) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "请填写 VOXI 登录邮箱；alpha.54.0 首次使用原生登录时需要重新填写邮箱和密码",
    });
  }
  if (username.length > 254 || /[\r\n]/.test(username)) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "VOXI 登录邮箱格式不正确",
    });
  }
  return username.toUpperCase();
}

function normalizeVoxiPassword(value: unknown) {
  const password = typeof value === "string" ? value : "";
  if (!password) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "未保存 VOXI 密码；alpha.54.0 首次使用原生登录时需要重新填写邮箱和密码",
    });
  }
  if (password.length > 512 || /[\r\n]/.test(password)) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "VOXI 密码格式不正确",
    });
  }
  return password;
}

function normalizeVoxiOtp(value: string) {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(code)) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "请输入 VOXI 短信中的 4-8 位字母或数字验证码",
    });
  }
  return code;
}

function accountRows(response: VoxiAccountsResponse | null) {
  if (!response || !Array.isArray(response.accountDetails)) return [];
  return response.accountDetails.filter(
    (item): item is VoxiAccount => Boolean(item) && typeof item === "object",
  );
}

function subscriptionRows(response: VoxiSubscriptionsResponse | null) {
  if (!response || !Array.isArray(response.subscriptionDetails)) return [];
  return response.subscriptionDetails.filter(
    (item): item is VoxiSubscription => Boolean(item) && typeof item === "object",
  );
}

function subscriptionScore(subscription: VoxiSubscription) {
  let score = 0;
  if (stringValue(subscription.status)?.toLowerCase() === "active") score += 4;
  if (stringValue(subscription.type)?.toLowerCase() === "voxi") score += 2;
  if (stringValue(subscription.paymentType)?.toLowerCase() === "prepaid") score += 1;
  return score;
}

async function selectVoxiSubscription(
  cookies: VoxiCookieJar,
  browserUserAgent: string,
  targetMsisdn: string,
): Promise<SelectedVoxiSubscription> {
  // Native login already establishes the authentication session. Do not probe
  // /auth/session here: the captured VOXI flow requests /auth/accounts first.
  const accounts = accountRows(
    await requestVoxiAccountApi<VoxiAccountsResponse>(
      "/auth/accounts",
      cookies,
      browserUserAgent,
    ),
  );
  if (accounts.length === 0) {
    throw new CarrierProviderError({
      type: "authentication",
      message: "VOXI 登录成功但没有读取到账户，请重新发送验证码完成认证",
    });
  }

  const matches: Array<SelectedVoxiSubscription & { score: number }> = [];
  for (const account of accounts) {
    const accountId = stringValue(account.id);
    const accountIdHash = stringValue(account.idHash);
    if (!accountId || !accountIdHash) continue;

    const subscriptions = subscriptionRows(
      await requestVoxiAccountApi<VoxiSubscriptionsResponse>(
        `/auth/accounts/${encodeURIComponent(accountId)}/subscriptions`,
        cookies,
        browserUserAgent,
        { headers: { "account-id-hash": accountIdHash } },
      ),
    );

    for (const subscription of subscriptions) {
      const subscriptionId = stringValue(subscription.subscriptionId);
      const subscriptionIdHash = stringValue(subscription.subscriptionIdHash);
      if (!subscriptionId || !subscriptionIdHash) continue;
      const phone = comparableVoxiNumber(subscription.phoneNumber)
        ?? comparableVoxiNumber(subscriptionId);
      if (phone !== targetMsisdn) continue;
      matches.push({
        accountId,
        accountIdHash,
        subscriptionId,
        subscriptionIdHash,
        msisdn: comparableVoxiNumber(subscriptionId) ?? targetMsisdn,
        status: stringValue(subscription.status),
        score: subscriptionScore(subscription),
      });
    }
  }

  if (matches.length === 0) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "当前 VOXI 登录账户中没有找到与 SIMKeeper 手机号匹配的订阅；请确认号码与登录账户一致",
    });
  }

  matches.sort((a, b) => b.score - a.score);
  const selected = matches[0];
  return {
    accountId: selected.accountId,
    accountIdHash: selected.accountIdHash,
    subscriptionId: selected.subscriptionId,
    subscriptionIdHash: selected.subscriptionIdHash,
    msisdn: selected.msisdn,
    status: selected.status,
  };
}

function normalizeVoxiBalance(value: unknown) {
  const balance = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value.trim())
      : Number.NaN;
  if (!Number.isFinite(balance) || balance < 0 || balance > 10_000) {
    throw new CarrierProviderError({
      type: "unsupported",
      message: "VOXI /subscription/get 已返回数据，但未识别到有效的 simBalance；接口结构可能已经变更",
    });
  }
  return balance;
}

function normalizeVoxiAccountStatus(value: string | null): ConnectorAccountStatus {
  const status = value?.trim().toLowerCase() ?? "";
  if (status === "active") return "active";
  if (/suspend|barred|restrict|blocked|paused/.test(status)) return "suspended";
  if (/expire/.test(status)) return "expired";
  if (/closed|disconnect|cancel|terminated/.test(status)) return "closed";
  return "unknown";
}

async function readVoxiSubscriptionData(
  cookies: VoxiCookieJar,
  browserUserAgent: string,
  targetMsisdn: string,
) {
  const selected = await selectVoxiSubscription(cookies, browserUserAgent, targetMsisdn);

  await requestVoxiAccountApi<unknown>("/auth/session", cookies, browserUserAgent, {
    allowNoContent: true,
    headers: {
      "account-id": selected.accountId,
      "account-id-hash": selected.accountIdHash,
      "subscription-id": selected.subscriptionId,
      "subscription-id-hash": selected.subscriptionIdHash,
    },
  });

  const subscription = await requestVoxiAccountApi<VoxiSubscriptionResponse>(
    "/subscription/get",
    cookies,
    browserUserAgent,
    {
      method: "POST",
      body: { msisdn: selected.msisdn },
    },
  );
  if (!subscription) {
    throw new CarrierProviderError({
      type: "unsupported",
      message: "VOXI /subscription/get 未返回订阅数据",
    });
  }

  return {
    balance: normalizeVoxiBalance(subscription.simBalance),
    accountStatus: normalizeVoxiAccountStatus(selected.status),
  };
}

async function startVoxiOtpAuthentication(
  connectorId: number,
  sim: CarrierConnectorSimContext,
  input: { username: string; password: string; browserUserAgent: string },
) {
  assertVoxiSim(sim);
  const cookies: VoxiCookieJar = new Map();
  await beginVoxiLogin(input.username, input.password, cookies, input.browserUserAgent);
  const expiresAt = saveVoxiPendingAuth(connectorId, input.username, cookies);
  return { expiresAt };
}

async function completeVoxiOtpAuthentication(
  connectorId: number,
  sim: CarrierConnectorSimContext,
  input: { username: string; code: string; browserUserAgent: string },
) {
  assertVoxiSim(sim);
  const code = normalizeVoxiOtp(input.code);
  const pending = readVoxiPendingAuth(connectorId);
  if (!pending) {
    throw new CarrierProviderError({
      type: "authentication",
      message: "VOXI 验证码会话不存在或已过期，请勾选“发送 / 重新发送 VOXI 短信验证码”后再次同步",
    });
  }
  if (!pendingVoxiAuthMatchesUsername(connectorId, input.username)) {
    clearVoxiPendingAuth(connectorId);
    throw new CarrierProviderError({
      type: "configuration",
      message: "VOXI 登录邮箱已发生变化，请重新发送验证码",
    });
  }

  const cookies = pending.cookies;
  await verifyVoxiLoginOtp(code, cookies, input.browserUserAgent);
  saveVoxiAuthenticatedSession(connectorId, input.username, cookies);
  clearVoxiPendingAuth(connectorId);
  clearVoxiOneTimeAuthConfig(connectorId, { requestOtp: true, otpCode: true });
  return cookies;
}

function configuredOtpCode(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  return normalizeVoxiOtp(value);
}

function configuredOtpRequest(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

export const voxiCarrierConnectorProvider: CarrierConnectorProvider = {
  id: "voxi",
  label: "VOXI My Account",
  description: "使用 VOXI 官方网页登录流程在 SIMKeeper 服务端完成邮箱/密码登录与短信验证码认证，再按手机号调用 /subscription/get 读取 simBalance。登录会话单独加密保存，不再需要手工复制 Cookie。",
  minLinkedSims: 1,
  maxLinkedSims: 1,
  configFields: [
    {
      key: "requestOtp",
      label: "发送 / 重新发送 VOXI 短信验证码",
      type: "checkbox",
      required: false,
      defaultValue: false,
      description: "首次连接请勾选后点击“保存配置并立即同步”。登录会话失效或验证码过期时也使用这一项；SIMKeeper 不会在后台定时任务中自动发送验证码。",
    },
    {
      key: "otpCode",
      label: "VOXI 短信验证码（收到后填写）",
      type: "text",
      required: false,
      placeholder: "例如 AB12C",
      description: "收到验证码后填写 4-8 位字母或数字并再次同步。验证成功后该一次性验证码会从服务端配置中自动清除。",
    },
    {
      key: "browserUserAgent",
      label: "浏览器 User-Agent（高级，可选）",
      type: "text",
      required: false,
      placeholder: DEFAULT_BROWSER_USER_AGENT,
      description: "默认使用当前适配测试的 Chrome User-Agent。只有 VOXI 对服务器 /authenticate 返回 403 时才建议调整。",
    },
  ],
  credentialFields: [
    {
      key: "username",
      label: "VOXI 登录邮箱",
      required: true,
      placeholder: "输入 VOXI 登录邮箱",
      description: "与密码一起使用 SIMKeeper 凭据加密保存。alpha.54.0 首次使用请重新填写一次；以后留空即可保留。",
    },
    {
      key: "password",
      label: "VOXI 密码",
      required: true,
      placeholder: "输入 VOXI 登录密码",
      description: "仅加密保存在 SIMKeeper 中，用于官方 /authenticate 登录。短信验证码和 VOXI Session 使用独立加密会话存储。",
    },
  ],
  async disconnect({ connectorId }) {
    deleteVoxiSession(connectorId);
  },
  async sync({ connectorId, credentials, sim, config }): Promise<NormalizedCarrierSyncResult> {
    assertVoxiSim(sim);
    const username = normalizeVoxiUsername(credentials.username);
    const password = normalizeVoxiPassword(credentials.password);
    const targetMsisdn = normalizeVoxiNumber(sim.phoneNumber);
    const browserUserAgent = normalizeVoxiBrowserUserAgent(config.browserUserAgent);
    const otpCode = configuredOtpCode(config.otpCode);
    const requestOtp = configuredOtpRequest(config.requestOtp);

    let cookies = readVoxiAuthenticatedSession(connectorId, username);
    const pending = readVoxiPendingAuth(connectorId);

    if (pending && otpCode) {
      cookies = await completeVoxiOtpAuthentication(connectorId, sim, {
        username,
        code: otpCode,
        browserUserAgent,
      });
    } else if (requestOtp) {
      const result = await startVoxiOtpAuthentication(connectorId, sim, {
        username,
        password,
        browserUserAgent,
      });
      clearVoxiOneTimeAuthConfig(connectorId, { requestOtp: true });
      throw new CarrierProviderError({
        type: "authentication",
        message: `VOXI 验证码已发送，请在“VOXI 短信验证码”中填写后再次同步；本次验证码会话约 10 分钟内有效（截至 ${result.expiresAt}）`,
      });
    } else if (!cookies) {
      if (pending) {
        throw new CarrierProviderError({
          type: "authentication",
          message: "VOXI 验证码已发送，请填写“VOXI 短信验证码”后再次点击保存配置并立即同步",
        });
      }
      throw new CarrierProviderError({
        type: "authentication",
        message: "VOXI 尚未完成登录或登录会话已失效。请勾选“发送 / 重新发送 VOXI 短信验证码”并手动同步；SIMKeeper 不会由后台定时任务自动发送验证码",
      });
    }

    try {
      const data = await readVoxiSubscriptionData(cookies, browserUserAgent, targetMsisdn);
      saveVoxiAuthenticatedSession(connectorId, username, cookies);
      clearVoxiOneTimeAuthConfig(connectorId, { requestOtp: true, otpCode: true });
      return {
        balance: data.balance,
        currencyCode: "GBP",
        balanceValidUntil: null,
        accountStatus: data.accountStatus,
      };
    } catch (error) {
      if (error instanceof CarrierProviderError && error.type === "authentication") {
        clearVoxiAuthenticatedSession(connectorId);
        throw new CarrierProviderError({
          type: "authentication",
          httpStatus: error.httpStatus,
          message: `${error.message}。为避免后台自动重复发送验证码，SIMKeeper 已清除失效会话；请勾选“发送 / 重新发送 VOXI 短信验证码”后手动同步`,
          cause: error,
        });
      }
      throw error;
    }
  },
};
