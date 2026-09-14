import "server-only";

import { randomUUID } from "node:crypto";
import { CarrierProviderError } from "@/lib/carrier-connectors/errors";
import type {
  CarrierConnectorProvider,
  CarrierConnectorSimContext,
  ConnectorAccountStatus,
  NormalizedCarrierSyncResult,
} from "@/lib/carrier-connectors/types";

const SMART_ORIGIN = "https://my.smart.com.ph";
const SMART_SSO_ORIGIN = "https://optimasso.smart.com.ph";
const SMART_SSO_AUTH_PATH = "/auth/realms/selfcare-optima/protocol/openid-connect/auth";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_CURL_BYTES = 16 * 1024;
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

type JsonObject = Record<string, unknown>;

type ParsedCurl = {
  url: URL;
  headers: Map<string, string>;
  cookieHeader: string;
};

type ParsedSmartDashboardCurl = {
  requestPath: string;
  accessToken: string;
  cookieHeader: string;
  userAgent: string;
  tokenExpiresAt: string | null;
};

type ParsedSmartSilentAuthCurl = {
  authUrl: URL;
  cookieHeader: string;
  userAgent: string;
};

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function objectValue(value: unknown) {
  return isObject(value) ? value : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function configurationError(message: string) {
  return new CarrierProviderError({ type: "configuration", message });
}

function authenticationError(message: string, httpStatus?: number) {
  return new CarrierProviderError({ type: "authentication", message, httpStatus });
}

function unsupportedError(message: string) {
  return new CarrierProviderError({ type: "unsupported", message });
}

function assertSmartSim(sim: CarrierConnectorSimContext) {
  if (sim.countryCode.toUpperCase() !== "PH") {
    throw configurationError("Smart My Smart 只能同步菲律宾号码");
  }
  if (!sim.carrierName.toLowerCase().includes("smart")) {
    throw configurationError("关联号码的运营商不是 Smart Philippines");
  }
}

function tokenizeCurl(value: string) {
  const input = value.replace(/\\\r?\n/g, " ").trim();
  if (!input) throw configurationError("请粘贴 My Smart 的 cURL 请求");
  if (Buffer.byteLength(input, "utf8") > MAX_CURL_BYTES) {
    throw configurationError("My Smart cURL 内容过长；请确认复制的是单个 Network 请求，而不是 HAR 文件");
  }

  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;

  const push = () => {
    const token = current.trim();
    if (token) tokens.push(token);
    current = "";
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (quote === "'") {
      if (char === "'") quote = null;
      else current += char;
      continue;
    }

    if (quote === '"') {
      if (char === '"') {
        quote = null;
        continue;
      }
      if (char === "\\" && index + 1 < input.length) {
        current += input[index + 1];
        index += 1;
        continue;
      }
      current += char;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === "\\") {
      // Chrome/Edge Copy as cURL (bash) uses backslash-newline. A one-line
      // credential input can strip that newline when pasted, so also accept a
      // backslash followed by whitespace as a continuation separator.
      if (index + 1 < input.length && /\s/.test(input[index + 1])) {
        push();
        while (index + 1 < input.length && /\s/.test(input[index + 1])) index += 1;
        continue;
      }
      if (index + 1 < input.length) {
        current += input[index + 1];
        index += 1;
      }
      continue;
    }

    if (/\s/.test(char)) {
      push();
      continue;
    }

    current += char;
  }

  if (quote) throw configurationError("My Smart cURL 引号不完整，请重新使用 Copy as cURL (bash) 复制");
  push();
  return tokens;
}

function parseHeader(value: string) {
  const separator = value.indexOf(":");
  if (separator <= 0) return null;
  const name = value.slice(0, separator).trim().toLowerCase();
  const headerValue = value.slice(separator + 1).trim();
  if (!name || !headerValue) return null;
  return [name, headerValue] as const;
}

function parseCurl(value: string): ParsedCurl {
  const tokens = tokenizeCurl(value);
  if (!tokens.length || tokens[0].toLowerCase() !== "curl") {
    throw configurationError("内容不是有效的 cURL；请使用 Chrome / Edge 的 Copy as cURL (bash)");
  }

  let rawUrl = "";
  let cookieHeader = "";
  const headers = new Map<string, string>();

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--url") {
      rawUrl = tokens[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (token.startsWith("--url=")) {
      rawUrl = token.slice("--url=".length);
      continue;
    }
    if (token === "-H" || token === "--header") {
      const parsed = parseHeader(tokens[index + 1] ?? "");
      if (parsed) headers.set(parsed[0], parsed[1]);
      index += 1;
      continue;
    }
    if (token.startsWith("--header=")) {
      const parsed = parseHeader(token.slice("--header=".length));
      if (parsed) headers.set(parsed[0], parsed[1]);
      continue;
    }
    if (token === "-b" || token === "--cookie") {
      cookieHeader = tokens[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (token.startsWith("--cookie=")) {
      cookieHeader = token.slice("--cookie=".length);
      continue;
    }
    if (!rawUrl && /^https:\/\//i.test(token)) rawUrl = token;
  }

  if (!cookieHeader) cookieHeader = headers.get("cookie") ?? "";

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw configurationError("My Smart cURL 中没有可识别的请求 URL");
  }

  if (/[\r\n]/.test(cookieHeader)) throw configurationError("My Smart Cookie 格式异常");
  return { url, headers, cookieHeader: cookieHeader.trim() };
}

function decodeJwtExpiry(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as unknown;
    if (!isObject(payload)) return null;
    const exp = numberValue(payload.exp);
    if (exp === null || exp <= 0) return null;
    const timestamp = exp * 1000;
    return Number.isFinite(timestamp) ? timestamp : null;
  } catch {
    return null;
  }
}

export function parseSmartDashboardCurl(value: string): ParsedSmartDashboardCurl {
  const parsed = parseCurl(value);
  const { url, headers } = parsed;

  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "my.smart.com.ph") {
    throw configurationError("余额请求只允许导入 https://my.smart.com.ph 的 My Smart 请求");
  }
  if (url.search || url.hash) {
    throw configurationError("prepaidservicedashboard 请求不应包含查询参数或片段，请重新复制正确请求");
  }

  const pathMatch = url.pathname.match(
    /^\/rest\/v1\/customeraccounts\/(\d+)\/customerfacingservices\/([^/]+)\/prepaidservicedashboard$/i,
  );
  if (!pathMatch) {
    throw configurationError("请选择 URL 末尾为 prepaidservicedashboard 的 My Smart 请求后重新复制 cURL");
  }
  if (!/^\d+(?:%2c|,)\d+$/i.test(pathMatch[2])) {
    throw configurationError("My Smart cURL 中的服务标识格式异常");
  }

  const authorization = headers.get("authorization") ?? "";
  const bearerMatch = authorization.match(/^bearer\s+([^\s]+)$/i);
  if (!bearerMatch) {
    throw configurationError("My Smart cURL 缺少 Authorization: Bearer 凭据；请确认是在登录后的 Network 中复制");
  }
  const accessToken = bearerMatch[1].trim();
  if (/[\r\n]/.test(accessToken) || accessToken.length < 40) {
    throw configurationError("My Smart Bearer Token 格式异常");
  }

  const expiry = decodeJwtExpiry(accessToken);
  return {
    requestPath: url.pathname,
    accessToken,
    cookieHeader: parsed.cookieHeader,
    userAgent: (headers.get("user-agent") ?? DEFAULT_USER_AGENT).trim().slice(0, 512),
    tokenExpiresAt: expiry === null ? null : new Date(expiry).toISOString(),
  };
}

export function parseSmartSilentAuthCurl(value: string): ParsedSmartSilentAuthCurl {
  const parsed = parseCurl(value);
  const { url, headers } = parsed;

  if (url.protocol !== "https:" || url.origin !== SMART_SSO_ORIGIN || url.pathname !== SMART_SSO_AUTH_PATH) {
    throw configurationError("静默认证 cURL 必须来自 optimasso.smart.com.ph 的 protocol/openid-connect/auth 请求");
  }
  if (url.searchParams.get("client_id") !== "selfcare-web") {
    throw configurationError("静默认证 cURL 的 client_id 不是 selfcare-web");
  }
  if (url.searchParams.get("prompt") !== "none") {
    throw configurationError("请选择包含 prompt=none 的 My Smart 静默认证请求");
  }
  if (url.searchParams.get("response_mode") !== "fragment") {
    throw configurationError("My Smart 静默认证请求的 response_mode 与预期不一致");
  }
  const responseTypes = new Set((url.searchParams.get("response_type") ?? "").split(/\s+/).filter(Boolean));
  if (!responseTypes.has("id_token") || !responseTypes.has("token")) {
    throw configurationError("My Smart 静默认证请求没有同时申请 id_token 和 token");
  }
  const redirectUri = url.searchParams.get("redirect_uri") ?? "";
  try {
    const redirect = new URL(redirectUri);
    if (redirect.origin !== SMART_ORIGIN || !redirect.pathname.startsWith("/smart/")) {
      throw new Error("invalid redirect");
    }
  } catch {
    throw configurationError("My Smart 静默认证请求的 redirect_uri 不受支持");
  }
  if (!parsed.cookieHeader) {
    throw configurationError("静默认证 cURL 没有包含 SSO Cookie；请确认使用浏览器 Network 的 Copy as cURL (bash)");
  }

  return {
    authUrl: url,
    cookieHeader: parsed.cookieHeader,
    userAgent: (headers.get("user-agent") ?? DEFAULT_USER_AGENT).trim().slice(0, 512),
  };
}

async function refreshSmartAccessToken(value: string) {
  const request = parseSmartSilentAuthCurl(value);
  const url = new URL(request.authUrl.toString());
  url.searchParams.set("state", randomUUID());
  url.searchParams.set("nonce", randomUUID());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Cookie: request.cookieHeader,
        Referer: `${SMART_ORIGIN}/`,
        "User-Agent": request.userAgent,
      },
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new CarrierProviderError({ type: "temporary", message: "My Smart 静默续签超时，请稍后重试", cause: error });
    }
    throw new CarrierProviderError({ type: "temporary", message: "无法连接 My Smart SSO，请检查服务器网络访问", cause: error });
  } finally {
    clearTimeout(timeout);
  }

  if (response.status < 300 || response.status >= 400) {
    throw authenticationError("需要重新认证：My Smart SSO 会话已经失效，请在浏览器重新登录并复制新的静默认证 cURL", response.status);
  }

  const location = response.headers.get("location");
  if (!location) throw authenticationError("需要重新认证：My Smart SSO 未返回新的登录 Token");

  let redirect: URL;
  try {
    redirect = new URL(location, SMART_SSO_ORIGIN);
  } catch {
    throw authenticationError("需要重新认证：My Smart SSO 返回了无法识别的跳转");
  }
  if (redirect.origin !== SMART_ORIGIN || !redirect.pathname.startsWith("/smart/")) {
    throw authenticationError("需要重新认证：My Smart SSO 没有直接完成静默登录");
  }

  const fragment = new URLSearchParams(redirect.hash.replace(/^#/, ""));
  const authError = fragment.get("error") || fragment.get("error_description");
  if (authError) {
    throw authenticationError("需要重新认证：My Smart SSO 会话已经失效，请在浏览器重新登录后重新复制 cURL");
  }

  const accessToken = fragment.get("access_token")?.trim() ?? "";
  if (!accessToken) throw authenticationError("需要重新认证：My Smart SSO 静默续签未返回 access_token");
  const expiry = decodeJwtExpiry(accessToken);
  if (expiry !== null && expiry <= Date.now() + 30_000) {
    throw authenticationError("需要重新认证：My Smart SSO 返回的 Token 已经过期");
  }
  return accessToken;
}

function isoDate(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function accountStatus(value: unknown): ConnectorAccountStatus {
  const normalized = stringValue(value).toLowerCase();
  if (normalized === "active" || normalized === "normal" || normalized === "enabled") return "active";
  if (/suspend|barred|blocked|restricted|inactive/.test(normalized)) return "suspended";
  if (/expired|expire/.test(normalized)) return "expired";
  if (/closed|terminated|deactivated|cancelled|canceled/.test(normalized)) return "closed";
  return "unknown";
}

function balanceDetails(account: JsonObject) {
  return Array.isArray(account.balanceDetail)
    ? account.balanceDetail.filter(isObject)
    : [];
}

function latestExpiry(details: JsonObject[]) {
  const values = details
    .map((detail) => stringValue(detail.expireTime))
    .filter(Boolean)
    .map((raw) => ({ raw, timestamp: Date.parse(raw) }))
    .filter((item) => Number.isFinite(item.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp);
  return values.length ? isoDate(values[0].raw) : null;
}

export function parseSmartPrepaidDashboard(payload: unknown): NormalizedCarrierSyncResult {
  const root = objectValue(payload);
  const code = numberValue(root.code);
  if (code !== null && code !== 0) {
    throw new CarrierProviderError({
      type: "permanent",
      providerCode: String(code),
      message: `My Smart 返回业务错误（code ${code}）`,
    });
  }

  const response = objectValue(root.response);
  const ocs = objectValue(response.ocsservice);
  if (!Object.keys(ocs).length) {
    throw unsupportedError("My Smart 响应缺少 ocsservice，接口结构可能已经变化");
  }

  const accounts = Array.isArray(ocs.acctList) ? ocs.acctList.filter(isObject) : [];
  const mainAccount = accounts.find((item) => (
    stringValue(item.balanceType).toUpperCase() === "C_MAIN_ACCOUNT"
    || stringValue(item.balanceName).toLowerCase() === "load balance"
  ));
  if (!mainAccount) throw unsupportedError("My Smart 响应中没有找到 Load Balance");

  const details = balanceDetails(mainAccount);
  const displayBalance = numberValue(mainAccount.outTotalBalance)
    ?? numberValue(details[0]?.outAmount);
  if (displayBalance === null || displayBalance < 0) {
    // totalBalance is an internal minor unit (the captured response exposed
    // 5000 while the web-facing outTotalBalance was 50). Never divide the raw
    // field heuristically because that could silently create a 100x error.
    throw unsupportedError("My Smart 响应缺少可安全识别的 outTotalBalance");
  }

  const currency = stringValue(objectValue(mainAccount.currencyID).displayValue).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw unsupportedError("My Smart 响应缺少可识别的三位币种代码");
  }

  const status = objectValue(ocs.status);
  return {
    balance: displayBalance,
    currencyCode: currency,
    balanceValidUntil: latestExpiry(details),
    accountStatus: accountStatus(status.displayValue ?? status.key),
  };
}

async function requestSmartDashboard(request: ParsedSmartDashboardCurl, accessToken: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;

  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    Authorization: `Bearer ${accessToken}`,
    apiname: "retrieveprepaidinformation",
    clientinfo: randomUUID(),
    transactionid: randomUUID(),
    Referer: `${SMART_ORIGIN}/smart/services`,
    "User-Agent": request.userAgent || DEFAULT_USER_AGENT,
  };
  if (request.cookieHeader) headers.Cookie = request.cookieHeader;

  try {
    response = await fetch(`${SMART_ORIGIN}${request.requestPath}`, {
      method: "GET",
      headers,
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new CarrierProviderError({ type: "temporary", message: "连接 My Smart 超时，请稍后重试", cause: error });
    }
    throw new CarrierProviderError({ type: "temporary", message: "无法连接 My Smart，请检查 SIMKeeper 服务器的网络访问", cause: error });
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401 || response.status === 403) {
    throw authenticationError("需要重新认证：My Smart 登录 Token 或会话已经失效，请在浏览器重新登录后更新 cURL", response.status);
  }
  if (response.status >= 300 && response.status < 400) {
    throw authenticationError("需要重新认证：My Smart 返回了登录跳转，请在浏览器重新登录后更新 cURL", response.status);
  }
  if (response.status === 429) {
    throw new CarrierProviderError({ type: "rate_limit", message: "My Smart 请求过于频繁，请稍后重试", httpStatus: response.status });
  }
  if (response.status >= 500) {
    throw new CarrierProviderError({ type: "temporary", message: `My Smart 暂时不可用（HTTP ${response.status}）`, httpStatus: response.status });
  }
  if (!response.ok) {
    throw new CarrierProviderError({ type: "permanent", message: `My Smart 请求失败（HTTP ${response.status}）`, httpStatus: response.status });
  }

  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw unsupportedError("My Smart 响应过大，已停止解析");
  }
  try {
    return text.trim() ? JSON.parse(text) as unknown : {};
  } catch (error) {
    throw new CarrierProviderError({ type: "unsupported", message: "My Smart 返回了无法解析的 JSON，接口结构可能已经变化", cause: error });
  }
}

export const smartCarrierConnectorProvider: CarrierConnectorProvider = {
  id: "smart",
  label: "Smart My Smart",
  description: "导入 My Smart 已登录浏览器的 prepaidservicedashboard cURL，并可选导入 prompt=none 静默认证 cURL；读取官方 Load Balance、余额有效期和账户状态。所有 cURL 仅作为运营商凭据加密保存。",
  minLinkedSims: 1,
  maxLinkedSims: 1,
  configFields: [],
  credentialFields: [
    {
      key: "requestCurl",
      label: "余额请求 cURL",
      required: true,
      placeholder: "Network → prepaidservicedashboard → Copy as cURL (bash)",
      description: "用于确定当前 Smart 账户/服务并读取余额。cURL 中的 Token/Cookie 会随连接凭据加密保存。",
    },
    {
      key: "silentAuthCurl",
      label: "静默认证 cURL（推荐）",
      required: false,
      placeholder: "Network → protocol/openid-connect/auth?…prompt=none → Copy as cURL (bash)",
      description: "用于在约 2 小时 Bearer Token 过期后通过现有 My Smart SSO 会话获取新 Token，不使用密码、不绕过 reCAPTCHA。若不填写，只能在当前余额请求 Token 有效期内同步。",
    },
  ],
  async sync({ credentials, sim }) {
    assertSmartSim(sim);
    const dashboardCurl = stringValue(credentials.requestCurl);
    if (!dashboardCurl) {
      throw authenticationError("需要重新认证：未保存 My Smart 余额请求 cURL，请从已登录的 My Smart 重新复制 prepaidservicedashboard 请求");
    }

    const request = parseSmartDashboardCurl(dashboardCurl);
    const silentAuthCurl = stringValue(credentials.silentAuthCurl);
    let accessToken = request.accessToken;

    if (silentAuthCurl) {
      accessToken = await refreshSmartAccessToken(silentAuthCurl);
    } else if (request.tokenExpiresAt) {
      const expiry = Date.parse(request.tokenExpiresAt);
      if (Number.isFinite(expiry) && expiry <= Date.now() + 30_000) {
        throw authenticationError("需要重新认证：My Smart Bearer Token 已经过期。请更新余额请求 cURL，或同时填写 prompt=none 静默认证 cURL以支持长期自动同步");
      }
    }

    const payload = await requestSmartDashboard(request, accessToken);
    return parseSmartPrepaidDashboard(payload);
  },
};
