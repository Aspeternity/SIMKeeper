import "server-only";

import { CarrierProviderError } from "@/lib/carrier-connectors/errors";
import type { VoxiCookieJar } from "@/lib/carrier-connectors/providers/voxi-native-session";

const VOXI_ORIGIN = "https://www.voxi.co.uk";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const DEFAULT_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";
const DEFAULT_SEC_CH_UA = '"Google Chrome";v="153", "Not_A Brand";v="8", "Chromium";v="153"';
export const VOXI_OTP_PASSWORD_PLACEHOLDER = Buffer.from("undefined", "utf8").toString("base64");

type VoxiAuthPhase = "credentials" | "send-otp" | "verify-otp";

export type VoxiApiRequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  allowNoContent?: boolean;
};

function cookieHeader(cookies: VoxiCookieJar) {
  return Array.from(cookies.entries())
    .filter(([name, value]) => (
      Boolean(name)
      && Boolean(value)
      && name.length <= 256
      && value.length <= 16_000
      && !/[\r\n;]/.test(name)
      && !/[\r\n]/.test(value)
    ))
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function splitFallbackSetCookie(value: string) {
  return value.split(/,(?=\s*[^;,\s]+=)/g).map((item) => item.trim()).filter(Boolean);
}

function rememberResponseCookies(headers: Headers, cookies: VoxiCookieJar) {
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
    if (!name || name.length > 256 || /[\r\n;]/.test(name)) continue;
    if (!value) cookies.delete(name);
    else if (value.length <= 16_000 && !/[\r\n]/.test(value)) cookies.set(name, value);
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

async function fetchVoxi(url: string, init: RequestInit, label: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
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
}

function browserHeaders(browserUserAgent: string) {
  return {
    "Accept-Language": "en-GB,en;q=0.9",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Sec-CH-UA": DEFAULT_SEC_CH_UA,
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent": browserUserAgent,
  };
}

export function normalizeVoxiBrowserUserAgent(value: unknown) {
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

async function bootstrapVoxiCookies(cookies: VoxiCookieJar, browserUserAgent: string) {
  const headers: Record<string, string> = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Sec-CH-UA": DEFAULT_SEC_CH_UA,
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": browserUserAgent,
  };
  const currentCookie = cookieHeader(cookies);
  if (currentCookie) headers.Cookie = currentCookie;
  const response = await fetchVoxi(
    `${VOXI_ORIGIN}/sign-in?redirectPath=%2Faccount`,
    { method: "GET", headers },
    "登录页",
  );
  rememberResponseCookies(response.headers, cookies);
  await response.arrayBuffer().catch(() => new ArrayBuffer(0));
  return response.status;
}

function authPhaseMessage(phase: VoxiAuthPhase, status: number) {
  if (phase === "credentials") {
    if (status === 400 || status === 401) return "VOXI 用户名或密码被拒绝，请检查登录邮箱和密码";
    return `VOXI /authenticate 返回 HTTP ${status}，服务器登录请求被拒绝`;
  }
  if (phase === "send-otp") {
    return `VOXI /authenticate/sendOtp 返回 HTTP ${status}，验证码发送失败`;
  }
  if (status === 400 || status === 401) return "VOXI 验证码无效或已过期，请重新发送验证码";
  return `VOXI OTP /authenticate 返回 HTTP ${status}，验证码验证失败`;
}

async function requestVoxiAuthentication(
  path: "/authenticate" | "/authenticate/sendOtp",
  cookies: VoxiCookieJar,
  browserUserAgent: string,
  phase: VoxiAuthPhase,
  body?: unknown,
) {
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    ...browserHeaders(browserUserAgent),
    Origin: VOXI_ORIGIN,
    Referer: `${VOXI_ORIGIN}/sign-in?redirectPath=%2Faccount`,
  };
  const currentCookie = cookieHeader(cookies);
  if (currentCookie) headers.Cookie = currentCookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetchVoxi(
    `${VOXI_ORIGIN}${path}`,
    {
      method: "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    path,
  );
  rememberResponseCookies(response.headers, cookies);

  if (response.status >= 200 && response.status < 300) {
    await response.arrayBuffer().catch(() => new ArrayBuffer(0));
    return;
  }
  if (response.status === 429) {
    throw new CarrierProviderError({
      type: "rate_limit",
      httpStatus: response.status,
      retryAfterMs: parseRetryAfter(response.headers),
      message: "VOXI 暂时限制了登录或验证码请求频率，请稍后重试",
    });
  }
  if (response.status >= 500) {
    throw new CarrierProviderError({
      type: "temporary",
      httpStatus: response.status,
      message: `VOXI ${path} 暂时不可用（HTTP ${response.status}）`,
    });
  }
  throw new CarrierProviderError({
    type: "authentication",
    httpStatus: response.status,
    message: response.status >= 300 && response.status < 400
      ? `${authPhaseMessage(phase, response.status)}；VOXI 返回了意外跳转`
      : authPhaseMessage(phase, response.status),
  });
}

export async function beginVoxiLogin(
  username: string,
  password: string,
  cookies: VoxiCookieJar,
  browserUserAgent: string,
) {
  const loginBody = {
    username,
    password: Buffer.from(password, "utf8").toString("base64"),
  };
  try {
    await requestVoxiAuthentication(
      "/authenticate",
      cookies,
      browserUserAgent,
      "credentials",
      loginBody,
    );
  } catch (error) {
    // The captured web flow performs POST /authenticate directly. If the edge
    // rejects a cold server session with 403, seed only first-party cookies from
    // the official VOXI sign-in page and retry exactly once.
    if (!(error instanceof CarrierProviderError) || error.httpStatus !== 403) throw error;
    const bootstrapStatus = await bootstrapVoxiCookies(cookies, browserUserAgent);
    if (bootstrapStatus >= 400) throw error;
    await requestVoxiAuthentication(
      "/authenticate",
      cookies,
      browserUserAgent,
      "credentials",
      loginBody,
    );
  }

  // The real VOXI page sends this request with an empty body and no JSON
  // content-type; keep the server flow identical.
  await requestVoxiAuthentication(
    "/authenticate/sendOtp",
    cookies,
    browserUserAgent,
    "send-otp",
  );
}

export async function verifyVoxiLoginOtp(
  code: string,
  cookies: VoxiCookieJar,
  browserUserAgent: string,
) {
  await requestVoxiAuthentication(
    "/authenticate",
    cookies,
    browserUserAgent,
    "verify-otp",
    {
      password: VOXI_OTP_PASSWORD_PLACEHOLDER,
      otp: code,
    },
  );
}

function assertAllowedApiPath(path: string) {
  const allowed = path === "/auth/accounts"
    || path === "/auth/session"
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

export async function requestVoxiAccountApi<T>(
  path: string,
  cookies: VoxiCookieJar,
  browserUserAgent: string,
  options: VoxiApiRequestOptions = {},
): Promise<T | null> {
  assertAllowedApiPath(path);
  const label = endpointLabel(path);
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    ...browserHeaders(browserUserAgent),
    "Content-Type": "application/json",
    Referer: `${VOXI_ORIGIN}/account`,
    ...options.headers,
  };
  const currentCookie = cookieHeader(cookies);
  if (currentCookie) headers.Cookie = currentCookie;
  if (path.startsWith("/auth/")) headers.dalheaders = "{}";
  if (path === "/auth/session") headers["reply-with-cookies"] = "false";
  if (method === "POST") headers.Origin = VOXI_ORIGIN;

  const response = await fetchVoxi(
    `${VOXI_ORIGIN}${path}`,
    {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(options.body ?? {}) : undefined,
    },
    label,
  );
  rememberResponseCookies(response.headers, cookies);

  const location = response.headers.get("location");
  if (location && /\/sign-in(?:[/?#]|$)/i.test(location)) {
    throw new CarrierProviderError({
      type: "authentication",
      httpStatus: response.status,
      message: `VOXI ${label} 跳转到登录页，登录会话已失效，请重新发送验证码完成认证`,
    });
  }
  if (response.status === 401 || response.status === 403) {
    throw new CarrierProviderError({
      type: "authentication",
      httpStatus: response.status,
      message: `VOXI ${label} 返回 HTTP ${response.status}，登录会话已失效或被拒绝，请重新发送验证码完成认证`,
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
        message: `VOXI ${label} 返回登录页，登录会话已失效，请重新发送验证码完成认证`,
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
