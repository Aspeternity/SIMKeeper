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
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";
const ACCOUNT_PATHS = ["/account/payment", "/account", "/account/plan"] as const;

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

function normalizeSessionCookie(raw: string) {
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
  return cookie;
}

function safeLocationPath(location: string | null) {
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

async function requestVoxiPage(path: string, sessionCookie: string): Promise<PageResponse> {
  if (!ACCOUNT_PATHS.includes(path as (typeof ACCOUNT_PATHS)[number])) {
    throw new CarrierProviderError({ type: "configuration", message: "VOXI 账户请求路径不受支持" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${VOXI_ORIGIN}${path}`, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
        Cookie: sessionCookie,
        Referer: `${VOXI_ORIGIN}/account`,
        "User-Agent": USER_AGENT,
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

  const location = response.headers.get("location");
  if (isSignInPath(location)) {
    throw new CarrierProviderError({
      type: "authentication",
      httpStatus: response.status,
      message: "需要重新认证：VOXI 浏览器会话已失效，请重新登录 VOXI 后更新会话 Cookie",
    });
  }
  if (response.status === 401 || response.status === 403) {
    throw new CarrierProviderError({
      type: "authentication",
      httpStatus: response.status,
      message: "需要重新认证：VOXI 拒绝了当前浏览器会话，请重新登录后更新会话 Cookie",
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
    const redirectPath = safeLocationPath(location);
    throw new CarrierProviderError({
      type: "unsupported",
      httpStatus: response.status,
      message: redirectPath
        ? `VOXI 账户页面发生未支持的跳转（${redirectPath}）`
        : "VOXI 账户页面发生跨站或未知跳转，已停止同步",
    });
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
      message: "需要重新认证：VOXI 浏览器会话已失效，请重新登录 VOXI 后更新会话 Cookie",
    });
  }

  return { path, status: response.status, location, text };
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

async function readVoxiBalance(sessionCookie: string) {
  let authenticatedPageSeen = false;
  const unsupportedMessages: string[] = [];

  for (const path of ACCOUNT_PATHS) {
    try {
      const page = await requestVoxiPage(path, sessionCookie);
      authenticatedPageSeen = true;
      const balance = parseVoxiBalance(page.text);
      if (balance !== null) return balance;
    } catch (error) {
      if (error instanceof CarrierProviderError && error.type === "unsupported") {
        unsupportedMessages.push(error.message);
        continue;
      }
      throw error;
    }
  }

  if (!authenticatedPageSeen && unsupportedMessages.length) {
    throw new CarrierProviderError({
      type: "unsupported",
      message: unsupportedMessages[0],
    });
  }

  throw new CarrierProviderError({
    type: "unsupported",
    message: "VOXI 会话已通过账户页认证，但未识别到 Top up / PAYG 余额；VOXI 页面或内部数据接口可能已经变更",
  });
}

export const voxiCarrierConnectorProvider: CarrierConnectorProvider = {
  id: "voxi",
  label: "VOXI My Account",
  description: "使用用户主动提供的已登录 VOXI 浏览器会话访问官方 My Account，并自动读取 Top up / PAYG credit。不会保存 VOXI 明文密码。",
  minLinkedSims: 1,
  maxLinkedSims: 1,
  configFields: [],
  credentialFields: [
    {
      key: "sessionCookie",
      label: "VOXI 会话 Cookie",
      required: true,
      placeholder: "粘贴已登录 VOXI 账户请求中的 Cookie 值",
      description: "先在浏览器登录 www.voxi.co.uk，打开开发者工具 → Network，选择已认证的 /account 请求，仅复制 Request Headers 中 Cookie: 后面的值。Cookie 会加密保存在 SIMKeeper；会话失效后需要重新粘贴。不要把 Cookie 发给其他人。",
    },
  ],
  async sync({ credentials, sim }): Promise<NormalizedCarrierSyncResult> {
    assertVoxiSim(sim);
    normalizeVoxiNumber(sim.phoneNumber);
    const sessionCookie = normalizeSessionCookie(String(credentials.sessionCookie ?? ""));
    const balance = await readVoxiBalance(sessionCookie);

    return {
      balance,
      currencyCode: "GBP",
      balanceValidUntil: null,
      accountStatus: "unknown",
    };
  },
};
