import "server-only";

import { CarrierProviderError } from "@/lib/carrier-connectors/errors";
import type {
  CarrierConnectorProvider,
  CarrierConnectorSimContext,
  NormalizedCarrierSyncResult,
} from "@/lib/carrier-connectors/types";

const VOXI_ORIGIN = "https://www.voxi.co.uk";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024;
const DEFAULT_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";
const ACCOUNT_PATHS = ["/account", "/account/payment", "/account/plan"] as const;

type CookieJar = Map<string, string>;

type PageResponse = {
  path: string;
  status: number;
  location: string | null;
  text: string;
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
  if (digits.startsWith("44") && digits.length === 12) digits = `0${digits.slice(2)}`;
  if (!/^07\d{9}$/.test(digits)) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "关联 SIM 缺少有效的英国 VOXI 手机号；请填写 07xxxxxxxxx 或 +44 7xxxxxxxxx",
    });
  }
  return digits;
}

function parseCookieHeader(raw: string) {
  const cookie = raw.trim().replace(/^cookie\s*:\s*/i, "").trim();
  if (!cookie) {
    throw new CarrierProviderError({
      type: "authentication",
      message: "未保存 VOXI 会话 Cookie，请重新登录 VOXI 后在号码编辑器中更新",
    });
  }
  if (cookie.length > 16_000 || /[\r\n]/.test(cookie) || !/[A-Za-z0-9_.-]+\s*=/.test(cookie)) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "VOXI 会话 Cookie 格式不正确；请只粘贴浏览器请求头 Cookie 的值",
    });
  }

  const allCookies = new Map<string, string>();
  for (const item of cookie.split(";")) {
    const part = item.trim();
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name || !value) continue;
    allCookies.set(name, value);
  }

  // VOXI's own cookie policy identifies Session as the authenticated platform
  // session and _vapi as the API-session identifier. Replaying every analytics
  // or anti-bot cookie from another browser/IP can cause an otherwise valid
  // account session to be rejected, so only carry the authentication/session
  // cookies plus the AWS load-balancer affinity cookies when present.
  const allowed = new Map<string, string>();
  for (const [name, value] of allCookies) {
    const lower = name.toLowerCase();
    if (
      lower === "session"
      || lower === "_vapi"
      || lower.startsWith("_vapi")
      || lower === "awsalb"
      || lower === "awsalbcors"
    ) {
      allowed.set(name, value);
    }
  }

  const hasSession = Array.from(allowed.keys()).some((name) => name.toLowerCase() === "session");
  const hasVapi = Array.from(allowed.keys()).some((name) => name.toLowerCase().startsWith("_vapi"));
  if (!hasSession && !hasVapi) {
    throw new CarrierProviderError({
      type: "authentication",
      message: "复制的 VOXI Cookie 中没有识别到 Session 或 _vapi 登录会话；请从已登录的 /account 请求重新复制 Cookie",
    });
  }

  return { cookies: allowed, hasSession, hasVapi };
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
    if (!name) continue;
    if (!value) cookies.delete(name);
    else cookies.set(name, value);
  }
}

function sameOriginPath(location: string | null) {
  if (!location) return null;
  try {
    const url = new URL(location, VOXI_ORIGIN);
    if (url.origin !== VOXI_ORIGIN) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function isSignInPath(value: string | null | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value, VOXI_ORIGIN);
    return url.pathname === "/sign-in" || url.pathname.startsWith("/forgot/");
  } catch {
    return /(?:^|\/)sign-in(?:[/?#]|$)|(?:^|\/)forgot(?:[/?#]|$)/i.test(value);
  }
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
    pound: "£",
  };
  return value
    .replace(/\\u00a3/gi, "£")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => named[name.toLowerCase()] ?? whole);
}

function htmlToText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:p|div|li|tr|td|th|section|article|h[1-6])\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function looksLikeSignInPage(html: string) {
  const text = htmlToText(html).toLowerCase();
  return (
    text.includes("sign in")
    && text.includes("username")
    && text.includes("password")
    && text.includes("forgotten your username or password")
  );
}

function parseRetryAfter(headers: Headers) {
  const raw = headers.get("retry-after")?.trim();
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1_000;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(1_000, date - Date.now()) : null;
}

async function requestVoxiPage(
  initialPath: string,
  cookies: CookieJar,
  browserUserAgent: string,
): Promise<PageResponse> {
  if (!initialPath.startsWith("/account")) {
    throw new CarrierProviderError({ type: "configuration", message: "VOXI 账户请求路径不受支持" });
  }

  let path = initialPath;
  let referer = `${VOXI_ORIGIN}/account`;

  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${VOXI_ORIGIN}${path}`, {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-GB,en;q=0.9",
          "Cache-Control": "no-cache",
          Cookie: cookieHeader(cookies),
          Referer: referer,
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "same-origin",
          "Upgrade-Insecure-Requests": "1",
          "User-Agent": browserUserAgent,
        },
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new CarrierProviderError({
          type: "temporary",
          message: "连接 VOXI My Account 超时，请稍后重试",
          cause: error,
        });
      }
      throw new CarrierProviderError({
        type: "temporary",
        message: "无法连接 VOXI My Account，请检查 SIMKeeper 服务器的网络访问",
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }

    rememberResponseCookies(response.headers, cookies);
    const location = response.headers.get("location");
    if (isSignInPath(location)) {
      throw new CarrierProviderError({
        type: "authentication",
        httpStatus: response.status,
        message: "需要重新认证：VOXI 登录会话已失效，请重新登录 VOXI 后更新会话 Cookie",
      });
    }
    if (response.status === 401 || response.status === 403) {
      throw new CarrierProviderError({
        type: "authentication",
        httpStatus: response.status,
        message: `VOXI 拒绝了当前登录会话（HTTP ${response.status}）。已改为只复用 Session/_vapi 等认证 Cookie，并模拟浏览器请求；如果重新复制 Cookie 后仍出现此错误，说明 VOXI 会话还绑定了浏览器环境或网络，需要改用余额接口请求进行同步`,
      });
    }
    if (response.status === 429) {
      throw new CarrierProviderError({
        type: "rate_limit",
        httpStatus: response.status,
        retryAfterMs: parseRetryAfter(response.headers),
        message: "VOXI 暂时限制了账户请求频率，请稍后重试",
      });
    }
    if (response.status >= 500) {
      throw new CarrierProviderError({
        type: "temporary",
        httpStatus: response.status,
        message: `VOXI My Account 暂时不可用（HTTP ${response.status}）`,
      });
    }
    if (response.status >= 400) {
      throw new CarrierProviderError({
        type: "unsupported",
        httpStatus: response.status,
        message: `VOXI 账户页面请求失败（HTTP ${response.status}），页面结构可能已经变更`,
      });
    }
    if (response.status >= 300 && response.status < 400) {
      const redirectPath = sameOriginPath(location);
      if (!redirectPath || !redirectPath.startsWith("/account")) {
        throw new CarrierProviderError({
          type: "unsupported",
          httpStatus: response.status,
          message: redirectPath
            ? `VOXI 账户页面发生未支持的跳转（${redirectPath}）`
            : "VOXI 账户页面发生跨站或未知跳转，已停止同步",
        });
      }
      referer = `${VOXI_ORIGIN}${path}`;
      path = redirectPath;
      continue;
    }

    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
      throw new CarrierProviderError({
        type: "unsupported",
        message: "VOXI 账户页面响应过大，已停止解析",
      });
    }
    if (looksLikeSignInPage(text)) {
      throw new CarrierProviderError({
        type: "authentication",
        message: "需要重新认证：VOXI 登录会话已失效，请重新登录 VOXI 后更新会话 Cookie",
      });
    }

    return { path, status: response.status, location, text };
  }

  throw new CarrierProviderError({
    type: "unsupported",
    message: "VOXI 账户页面跳转次数过多，已停止同步",
  });
}

function normalizeMoney(raw: string) {
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) && value >= 0 && value <= 10_000 ? value : null;
}

function parseVoxiBalance(html: string) {
  const source = decodeHtmlEntities(html);
  const text = htmlToText(html);
  const patterns = [
    /["'](?:formattedBalance|formattedCredit|displayBalance|displayCredit|topUpBalanceFormatted|paygBalanceFormatted)["']\s*:\s*["'][^"']{0,40}?£\s*([0-9][0-9,]*(?:\.\d{1,2})?)/gi,
    /(?:top[\s-]*up(?:\s+credit)?|pay\s+as\s+you\s+go(?:\s+credit)?|payg(?:\s+credit)?|available\s+credit|account\s+balance|credit\s+balance)[^£\d]{0,100}£\s*([0-9][0-9,]*(?:\.\d{1,2})?)/gi,
    /(?:your\s+)?(?:top[\s-]*up\s+)?balance\s*(?:is|:)?\s*£\s*([0-9][0-9,]*(?:\.\d{1,2})?)/gi,
    /(?:top[\s-]*up(?:\s+credit)?|payg(?:\s+credit)?|credit\s+balance|account\s+balance)[^0-9]{0,100}([0-9][0-9,]*(?:\.\d{1,2})?)\s*GBP\b/gi,
    /£\s*([0-9][0-9,]*(?:\.\d{1,2})?)[^\n£]{0,60}(?:top[\s-]*up\s+credit|payg\s+credit|credit\s+balance|account\s+balance)/gi,
  ];

  for (const haystack of [source, text]) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(haystack);
      if (!match) continue;
      const value = normalizeMoney(match[1]);
      if (value !== null) return value;
    }
  }
  return null;
}

async function readVoxiBalance(
  cookies: CookieJar,
  browserUserAgent: string,
) {
  // Always prove the root My Account session first. Some VOXI sub-routes can
  // return 401/403 independently even when the main account session is valid.
  const rootPage = await requestVoxiPage(ACCOUNT_PATHS[0], cookies, browserUserAgent);
  const rootBalance = parseVoxiBalance(rootPage.text);
  if (rootBalance !== null) return rootBalance;

  const unsupportedMessages: string[] = [];
  for (const path of ACCOUNT_PATHS.slice(1)) {
    try {
      const page = await requestVoxiPage(path, cookies, browserUserAgent);
      const balance = parseVoxiBalance(page.text);
      if (balance !== null) return balance;
    } catch (error) {
      if (
        error instanceof CarrierProviderError
        && (error.type === "unsupported" || error.type === "authentication")
      ) {
        unsupportedMessages.push(error.message);
        continue;
      }
      throw error;
    }
  }

  throw new CarrierProviderError({
    type: "unsupported",
    message: unsupportedMessages.length
      ? "VOXI 主账户会话已通过认证，但附加账户页面不可用且未识别到 Top up / PAYG 余额；下一步需要使用浏览器实际调用的余额 API"
      : "VOXI 会话已通过账户页认证，但未识别到 Top up / PAYG 余额；VOXI 页面可能通过内部 API 动态加载余额",
  });
}

export const voxiCarrierConnectorProvider: CarrierConnectorProvider = {
  id: "voxi",
  label: "VOXI My Account",
  description: "实验性集成。复用用户主动提供的 VOXI 登录会话，仅保留 Session/_vapi 等认证 Cookie，并从官方 My Account 尝试读取 Top up / PAYG credit。不会保存 VOXI 明文密码。",
  minLinkedSims: 1,
  maxLinkedSims: 1,
  configFields: [],
  credentialFields: [
    {
      key: "sessionCookie",
      label: "VOXI 会话 Cookie",
      required: true,
      placeholder: "粘贴已登录 VOXI /account 请求中的 Cookie 值",
      description: "先登录 www.voxi.co.uk，再在开发者工具 → Network 中选择已认证的 /account 请求，仅复制 Request Headers 里 Cookie: 后面的完整值。SIMKeeper 会自动只取 Session/_vapi 等认证相关 Cookie 加密保存；会话失效后需要重新粘贴。不要把 Cookie 发给其他人。",
    },
  ],
  async sync({ credentials, sim, config }): Promise<NormalizedCarrierSyncResult> {
    assertVoxiSim(sim);
    normalizeVoxiNumber(sim.phoneNumber);
    const parsed = parseCookieHeader(String(credentials.sessionCookie ?? ""));
    const browserUserAgent = normalizeBrowserUserAgent(config.browserUserAgent);
    const balance = await readVoxiBalance(parsed.cookies, browserUserAgent);

    return {
      balance,
      currencyCode: "GBP",
      balanceValidUntil: null,
      accountStatus: "unknown",
    };
  },
};
