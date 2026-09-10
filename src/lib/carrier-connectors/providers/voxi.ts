import "server-only";

import { CarrierProviderError } from "@/lib/carrier-connectors/errors";
import type {
  CarrierConnectorProvider,
  CarrierConnectorSimContext,
  ConnectorAccountStatus,
  NormalizedCarrierSyncResult,
} from "@/lib/carrier-connectors/types";

const VOXI_ORIGIN = "https://www.voxi.co.uk";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

type CookieJar = Map<string, string>;

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

type VoxiApiRequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  allowNoContent?: boolean;
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

function isPrimaryCookieName(name: string) {
  const lower = name.toLowerCase();
  return lower === "session"
    || lower === "platformaccesstoken"
    || lower === "platformauthtoken"
    || lower === "_vapi"
    || lower.startsWith("_vapi");
}

function isEdgeCookieName(name: string) {
  const lower = name.toLowerCase();
  return lower === "jsessionid"
    || lower === "awsalb"
    || lower === "awsalbcors"
    || lower === "cf_clearance"
    || lower === "__cf_bm"
    || lower === "bm_sz"
    || lower === "ak_bmsc"
    || lower === "_abck"
    || lower.startsWith("akavpau_")
    || lower.startsWith("bigipserver")
    || lower === "ts"
    || lower === "ts_c"
    || /^ts[0-9a-z_-]+$/i.test(name);
}

function parseCookiePairs(raw: string, label: string) {
  const cookie = raw.trim().replace(/^cookie\s*:\s*/i, "").trim();
  if (!cookie) return new Map<string, string>();
  if (cookie.length > 16_000 || /[\r\n]/.test(cookie) || !/[A-Za-z0-9_.-]+\s*=/.test(cookie)) {
    throw new CarrierProviderError({
      type: "configuration",
      message: `${label}格式不正确；请粘贴 name=value 形式的 Cookie`,
    });
  }

  const result = new Map<string, string>();
  for (const item of cookie.split(";")) {
    const part = item.trim();
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name || !value) continue;
    result.set(name, value);
  }
  return result;
}

function normalizeCookieValue(value: unknown, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return null;
  if (normalized.length > 16_000 || /[\r\n;]/.test(normalized)) {
    throw new CarrierProviderError({
      type: "configuration",
      message: `${label}格式不正确；请只复制 Application → Cookies 中该 Cookie 的 Value`,
    });
  }
  return normalized;
}

function buildVoxiCookieJar(credentials: Record<string, string>) {
  const cookies: CookieJar = new Map();

  // Backwards compatibility for alpha.53.0-alpha.53.2. A stored full Cookie
  // header can remain in the encrypted credential record, while alpha.53.3
  // allows users to replace it with the three visible VOXI auth cookies.
  const legacy = parseCookiePairs(String(credentials.sessionCookie ?? ""), "VOXI 完整 Cookie");
  for (const [name, value] of legacy) {
    if (isPrimaryCookieName(name) || isEdgeCookieName(name)) cookies.set(name, value);
  }

  const session = normalizeCookieValue(credentials.session, "VOXI Session");
  const platformAccessToken = normalizeCookieValue(
    credentials.platformAccessToken,
    "VOXI PlatformAccessToken",
  );
  const platformAuthToken = normalizeCookieValue(
    credentials.platformAuthToken,
    "VOXI PlatformAuthToken",
  );
  const explicitCount = [session, platformAccessToken, platformAuthToken].filter(Boolean).length;
  if (explicitCount > 0 && explicitCount < 3) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "单独填写 VOXI 登录凭据时，请同时填写 Session、PlatformAccessToken 和 PlatformAuthToken；它们应来自同一次登录会话",
    });
  }
  if (session) cookies.set("Session", session);
  if (platformAccessToken) cookies.set("PlatformAccessToken", platformAccessToken);
  if (platformAuthToken) cookies.set("PlatformAuthToken", platformAuthToken);

  const edgeCookies = parseCookiePairs(String(credentials.edgeCookies ?? ""), "VOXI 边缘会话 Cookie");
  for (const [name, value] of edgeCookies) {
    if (!isEdgeCookieName(name)) {
      throw new CarrierProviderError({
        type: "configuration",
        message: `VOXI 边缘会话 Cookie 中包含不支持的 Cookie：${name}`,
      });
    }
    cookies.set(name, value);
  }

  const hasPrimary = Array.from(cookies.keys()).some(isPrimaryCookieName);
  if (!hasPrimary) {
    throw new CarrierProviderError({
      type: "authentication",
      message: "未保存可用的 VOXI 登录凭据。请在 Chrome → Application → Cookies → https://www.voxi.co.uk 中复制 Session、PlatformAccessToken 和 PlatformAuthToken 的 Value",
    });
  }
  return cookies;
}

function normalizeBrowserUserAgent(value: unknown) {
  const userAgent = typeof value === "string" ? value.trim() : "";
  if (!userAgent) return DEFAULT_BROWSER_USER_AGENT;
  if (userAgent.length > 512 || /[\r\n]/.test(userAgent)) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "VOXI 浏览器 User-Agent 格式不正确",
    });
  }
  return userAgent;
}

function cookieHeader(cookies: CookieJar) {
  return Array.from(cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function splitFallbackSetCookie(value: string) {
  return value.split(/,(?=\s*[^;,\s]+=)/g).map((item) => item.trim()).filter(Boolean);
}

function rememberResponseCookies(headers: Headers, cookies: CookieJar) {
  const extended = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = typeof extended.getSetCookie === "function"
    ? extended.getSetCookie()
    : headers.get("set-cookie")
      ? splitFallbackSetCookie(headers.get("set-cookie") as string)
      : [];

  for (const header of setCookies) {
    const pair = header.split(";", 1)[0] ?? "";
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!name || (!isPrimaryCookieName(name) && !isEdgeCookieName(name))) continue;
    if (!value) cookies.delete(name);
    else cookies.set(name, value);
  }
}

function parseRetryAfter(headers: Headers) {
  const raw = headers.get("retry-after")?.trim();
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1_000;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(1_000, date - Date.now()) : null;
}

function isSignInLocation(value: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value, VOXI_ORIGIN);
    return url.pathname === "/sign-in" || url.pathname.startsWith("/forgot/");
  } catch {
    return false;
  }
}

function assertAllowedApiPath(path: string) {
  const allowed = path === "/auth/session"
    || path === "/auth/accounts"
    || path === "/subscription/get"
    || /^\/auth\/accounts\/[A-Za-z0-9._~-]+\/subscriptions$/.test(path);
  if (!allowed) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "VOXI 内部账户接口路径不受支持",
    });
  }
}

function endpointLabel(path: string) {
  if (/^\/auth\/accounts\/.+\/subscriptions$/.test(path)) {
    return "/auth/accounts/{accountId}/subscriptions";
  }
  return path;
}

async function requestVoxiApi<T>(
  path: string,
  cookies: CookieJar,
  browserUserAgent: string,
  options: VoxiApiRequestOptions = {},
): Promise<T | null> {
  assertAllowedApiPath(path);
  const label = endpointLabel(path);
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-GB,en;q=0.9",
    "Cache-Control": "no-cache",
    "Content-Type": "application/json",
    Cookie: cookieHeader(cookies),
    Referer: `${VOXI_ORIGIN}/account/payment`,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent": browserUserAgent,
    ...options.headers,
  };
  if (path.startsWith("/auth/")) headers.dalheaders = "{}";
  if (path === "/auth/session") headers["reply-with-cookies"] = "false";
  if (method === "POST") headers.Origin = VOXI_ORIGIN;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${VOXI_ORIGIN}${path}`, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(options.body ?? {}) : undefined,
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new CarrierProviderError({
        type: "temporary",
        message: `连接 VOXI ${label} 超时，请稍后重试`,
        cause: error,
      });
    }
    throw new CarrierProviderError({
      type: "temporary",
      message: `无法连接 VOXI ${label}，请检查 SIMKeeper 服务器的网络访问`,
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
  }

  rememberResponseCookies(response.headers, cookies);
  const location = response.headers.get("location");
  if (isSignInLocation(location)) {
    throw new CarrierProviderError({
      type: "authentication",
      httpStatus: response.status,
      message: `VOXI ${label} 跳转到登录页：当前登录会话已失效，请重新登录 VOXI 后更新 Session、PlatformAccessToken 和 PlatformAuthToken`,
    });
  }
  if (response.status === 401 || response.status === 403) {
    throw new CarrierProviderError({
      type: "authentication",
      httpStatus: response.status,
      message: `VOXI ${label} 返回 HTTP ${response.status}：当前登录凭据被拒绝。请确认 Session、PlatformAccessToken 和 PlatformAuthToken 来自同一次登录；若浏览器同一接口为 200 而这里仍为 403，可补充 __cf_bm / ts / ts_c 边缘 Cookie，并使用同一浏览器 User-Agent`,
    });
  }
  if (response.status === 429) {
    throw new CarrierProviderError({
      type: "rate_limit",
      httpStatus: response.status,
      retryAfterMs: parseRetryAfter(response.headers),
      message: `VOXI ${label} 暂时限制了请求频率，请稍后重试`,
    });
  }
  if (response.status >= 500) {
    throw new CarrierProviderError({
      type: "temporary",
      httpStatus: response.status,
      message: `VOXI ${label} 暂时不可用（HTTP ${response.status}）`,
    });
  }
  if (response.status >= 300 && response.status < 400) {
    throw new CarrierProviderError({
      type: "unsupported",
      httpStatus: response.status,
      message: `VOXI ${label} 发生未支持的跳转（HTTP ${response.status}）`,
    });
  }
  if (response.status >= 400) {
    throw new CarrierProviderError({
      type: "unsupported",
      httpStatus: response.status,
      message: `VOXI ${label} 请求失败（HTTP ${response.status}），接口可能已经变更`,
    });
  }
  if (response.status === 204) {
    if (options.allowNoContent) return null;
    throw new CarrierProviderError({
      type: "unsupported",
      message: `VOXI ${label} 未返回数据`,
    });
  }

  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new CarrierProviderError({
      type: "unsupported",
      message: `VOXI ${label} 响应过大，已停止解析`,
    });
  }
  if (!text.trim()) {
    if (options.allowNoContent) return null;
    throw new CarrierProviderError({
      type: "unsupported",
      message: `VOXI ${label} 返回了空响应`,
    });
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("text/html") || /^\s*</.test(text)) {
    if (/sign\s*in|forgot(?:ten)?\s+(?:your\s+)?(?:username|password)/i.test(text)) {
      throw new CarrierProviderError({
        type: "authentication",
        message: `VOXI ${label} 返回登录页：当前会话已失效，请重新登录后更新登录凭据`,
      });
    }
    throw new CarrierProviderError({
      type: "unsupported",
      message: `VOXI ${label} 返回了网页而不是 JSON，接口行为可能已经变更`,
    });
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new CarrierProviderError({
      type: "unsupported",
      message: `VOXI ${label} 返回的 JSON 无法解析`,
      cause: error,
    });
  }
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
  cookies: CookieJar,
  browserUserAgent: string,
  targetMsisdn: string,
): Promise<SelectedVoxiSubscription> {
  await requestVoxiApi<unknown>("/auth/session", cookies, browserUserAgent, {
    allowNoContent: true,
  });
  const accounts = accountRows(
    await requestVoxiApi<VoxiAccountsResponse>("/auth/accounts", cookies, browserUserAgent),
  );
  if (accounts.length === 0) {
    throw new CarrierProviderError({
      type: "authentication",
      message: "VOXI 登录会话可访问，但没有读取到账户；请重新登录后更新登录凭据",
    });
  }

  const matches: Array<SelectedVoxiSubscription & { score: number }> = [];
  for (const account of accounts) {
    const accountId = stringValue(account.id);
    const accountIdHash = stringValue(account.idHash);
    if (!accountId || !accountIdHash) continue;

    const subscriptions = subscriptionRows(
      await requestVoxiApi<VoxiSubscriptionsResponse>(
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
  cookies: CookieJar,
  browserUserAgent: string,
  targetMsisdn: string,
) {
  const selected = await selectVoxiSubscription(cookies, browserUserAgent, targetMsisdn);

  await requestVoxiApi<unknown>("/auth/session", cookies, browserUserAgent, {
    allowNoContent: true,
    headers: {
      "account-id": selected.accountId,
      "account-id-hash": selected.accountIdHash,
      "subscription-id": selected.subscriptionId,
      "subscription-id-hash": selected.subscriptionIdHash,
    },
  });

  const subscription = await requestVoxiApi<VoxiSubscriptionResponse>(
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

export const voxiCarrierConnectorProvider: CarrierConnectorProvider = {
  id: "voxi",
  label: "VOXI My Account",
  description: "使用 VOXI 登录会话调用官方站点内部账户接口，按手机号匹配订阅，并从 /subscription/get 的 simBalance 直接读取 Top up / PAYG credit。不会保存 VOXI 明文密码。",
  minLinkedSims: 1,
  maxLinkedSims: 1,
  configFields: [
    {
      key: "browserUserAgent",
      label: "浏览器 User-Agent（可选）",
      type: "text",
      required: false,
      placeholder: DEFAULT_BROWSER_USER_AGENT,
      description: "默认使用当前适配测试的 Chrome User-Agent。若 VOXI 某一步返回 403，可填写登录 VOXI 的同一浏览器 User-Agent。",
    },
  ],
  credentialFields: [
    {
      key: "session",
      label: "VOXI Session",
      required: false,
      placeholder: "复制 Session 的 Value",
      description: "Chrome → Application → Cookies → https://www.voxi.co.uk → Session，只复制 Value。请与下面两个 Token 使用同一次登录会话。",
    },
    {
      key: "platformAccessToken",
      label: "VOXI PlatformAccessToken",
      required: false,
      placeholder: "复制 PlatformAccessToken 的 Value",
      description: "在同一 Cookie 列表中复制 PlatformAccessToken 的 Value；SIMKeeper 会加密保存。",
    },
    {
      key: "platformAuthToken",
      label: "VOXI PlatformAuthToken",
      required: false,
      placeholder: "复制 PlatformAuthToken 的 Value",
      description: "在同一 Cookie 列表中复制 PlatformAuthToken 的 Value；alpha.53.3 起会随 Session 一起发送。",
    },
    {
      key: "edgeCookies",
      label: "边缘会话 Cookie（可选）",
      required: false,
      placeholder: "__cf_bm=...; ts=...; ts_c=...",
      description: "仅在浏览器接口为 200、SIMKeeper 仍为 403 时使用。可填写 __cf_bm、ts、ts_c 等 name=value；不要加入统计/营销 Cookie。",
    },
    {
      key: "sessionCookie",
      label: "完整 Cookie（旧版兼容，可选）",
      required: false,
      placeholder: "alpha.53.0-alpha.53.2 的完整 Cookie",
      description: "仅用于兼容旧版已保存配置。新配置优先填写上面的 Session、PlatformAccessToken 和 PlatformAuthToken，不再要求从 Network 找完整 Cookie。",
    },
  ],
  async sync({ credentials, sim, config }): Promise<NormalizedCarrierSyncResult> {
    assertVoxiSim(sim);
    const targetMsisdn = normalizeVoxiNumber(sim.phoneNumber);
    const cookies = buildVoxiCookieJar(credentials);
    const browserUserAgent = normalizeBrowserUserAgent(config.browserUserAgent);
    const data = await readVoxiSubscriptionData(cookies, browserUserAgent, targetMsisdn);

    return {
      balance: data.balance,
      currencyCode: "GBP",
      balanceValidUntil: null,
      accountStatus: data.accountStatus,
    };
  },
};
