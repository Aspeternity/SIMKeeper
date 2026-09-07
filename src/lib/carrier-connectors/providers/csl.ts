import "server-only";

import type {
  CarrierConnectorProvider,
  CarrierConnectorSimContext,
  ConnectorAccountStatus,
  NormalizedCarrierSyncResult,
} from "@/lib/carrier-connectors/types";

const CSL_ORIGIN = "https://prepaid.hkcsl.com";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";

type CookieJar = Map<string, string>;

type PageResponse = {
  status: number;
  location: string | null;
  text: string;
};

function normalizeCslNumber(phoneNumber: string | null | undefined) {
  let digits = String(phoneNumber ?? "").replace(/\D/g, "");
  if (digits.startsWith("852") && digits.length === 11) digits = digits.slice(3);
  if (!/^[456789]\d{7}$/.test(digits)) {
    throw new Error("关联 SIM 缺少有效的香港 csl 手机号；请填写 8 位香港号码或 +852 号码");
  }
  return digits;
}

function assertCslSim(sim: CarrierConnectorSimContext) {
  if (sim.countryCode.toUpperCase() !== "HK") {
    throw new Error("csl Prepaid 只能同步香港号码");
  }
  const carrier = sim.carrierName.toLowerCase();
  if (!["csl", "one2free", "pccw"].some((keyword) => carrier.includes(keyword))) {
    throw new Error("关联号码的运营商不是 csl Prepaid");
  }
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

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
  };
  return value
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
      .replace(/<\/(?:p|div|li|tr|td|th|section|article)\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

async function requestPage(
  path: string,
  cookies: CookieJar,
  options?: { method?: "GET" | "POST"; form?: URLSearchParams; referer?: string },
): Promise<PageResponse> {
  if (!path.startsWith("/")) throw new Error("csl 请求路径无效");
  const method = options?.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-HK,en;q=0.9,zh-HK;q=0.8",
    "User-Agent": USER_AGENT,
  };
  const cookie = cookieHeader(cookies);
  if (cookie) headers.Cookie = cookie;
  if (options?.referer) headers.Referer = options.referer;
  if (method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded;charset=utf-8";
    headers.Origin = CSL_ORIGIN;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${CSL_ORIGIN}${path}`, {
      method,
      headers,
      body: method === "POST" ? options?.form?.toString() ?? "" : undefined,
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("连接 csl Prepaid 超时，请稍后重试");
    }
    throw new Error("无法连接 csl Prepaid，请检查 SIMKeeper 服务器的网络访问");
  } finally {
    clearTimeout(timeout);
  }

  rememberResponseCookies(response.headers, cookies);
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("csl Prepaid 页面响应过大，已停止解析");
  }
  if (response.status >= 400) {
    throw new Error(`csl Prepaid 请求失败（HTTP ${response.status}）`);
  }
  return {
    status: response.status,
    location: response.headers.get("location"),
    text,
  };
}

function sameOriginPath(location: string | null) {
  if (!location) return null;
  try {
    const url = new URL(location, CSL_ORIGIN);
    if (url.origin !== CSL_ORIGIN) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

async function followSafeRedirects(
  initial: PageResponse,
  cookies: CookieJar,
  referer: string,
  maxRedirects = 5,
) {
  const pages: PageResponse[] = [initial];
  const seen = new Set<string>();
  let current = initial;
  let currentReferer = referer;

  for (let index = 0; index < maxRedirects; index += 1) {
    const path = sameOriginPath(current.location);
    if (!path || seen.has(path)) break;
    seen.add(path);
    current = await requestPage(path, cookies, { referer: currentReferer });
    pages.push(current);
    currentReferer = `${CSL_ORIGIN}${path}`;
  }
  return pages;
}

function looksLikeLoginPage(html: string) {
  const text = htmlToText(html).toLowerCase();
  return (
    /mobile number|流動電話號碼|流动电话号码/.test(text)
    && /password|密碼|密码/.test(text)
    && /verification code|驗證碼|验证码/.test(text)
  );
}

function looksLikeBadCredentials(html: string) {
  const text = htmlToText(html).toLowerCase();
  return /invalid password|incorrect password|wrong password|login failed|登入失敗|登录失败|密碼錯誤|密码错误/.test(text);
}

function normalizeMoney(raw: string) {
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) && value >= 0 && value <= 5000 ? value : null;
}

function isoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateValue(value: string) {
  const match = value.match(/\b(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/);
  if (!match) return null;
  return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

function normalizedLines(html: string) {
  return htmlToText(html)
    .split("\n")
    .map((line) => line.replace(/^\s*[|:：-]+\s*|\s*[|:：-]+\s*$/g, "").trim())
    .filter(Boolean);
}

function fieldValue(lines: string[], label: RegExp) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(label);
    if (!match || match.index === undefined) continue;

    const remainder = line
      .slice(match.index + match[0].length)
      .replace(/^\s*[|:：-]+\s*/, "")
      .trim();
    if (remainder) return remainder;

    for (let offset = 1; offset <= 3; offset += 1) {
      const candidate = lines[index + offset]?.trim();
      if (candidate) return candidate;
    }
  }
  return null;
}

function parseCardInformation(html: string) {
  const lines = normalizedLines(html);
  const balanceRaw = fieldValue(lines, /^Balance\b/i);
  const expiryRaw = fieldValue(lines, /^Expiry Date\b/i);
  const statusRaw = fieldValue(lines, /^Status\b/i);

  const balanceMatch = balanceRaw?.match(/(?:HK\$|HKD|\$)?\s*([0-9][0-9,]*(?:\.\d+)?)/i);
  const balance = balanceMatch ? normalizeMoney(balanceMatch[1]) : null;
  const expiry = expiryRaw ? parseDateValue(expiryRaw) : null;

  let accountStatus: ConnectorAccountStatus = "unknown";
  if (statusRaw) {
    if (/^active$/i.test(statusRaw)) accountStatus = "active";
    else if (/suspend|barred|inactive/i.test(statusRaw)) accountStatus = "suspended";
    else if (/expired/i.test(statusRaw)) accountStatus = "expired";
    else if (/closed|terminated/i.test(statusRaw)) accountStatus = "closed";
  }
  if (accountStatus === "unknown" && expiry) {
    const endOfDay = Date.parse(`${expiry}T23:59:59+08:00`);
    accountStatus = Number.isFinite(endOfDay) && Date.now() > endOfDay ? "expired" : "active";
  }

  if (balance === null) {
    throw new Error("csl Prepaid Card Information 页面未识别到 Balance 数值");
  }

  return { balance, expiry, accountStatus };
}

async function loginAndReadAccount(mobileNumber: string, password: string) {
  const cookies: CookieJar = new Map();

  const loginStart = await requestPage("/login", cookies);
  await followSafeRedirects(loginStart, cookies, `${CSL_ORIGIN}/login`);

  const login = await requestPage("/login_add", cookies, {
    method: "POST",
    form: new URLSearchParams({ msisdn: mobileNumber, password }),
    referer: `${CSL_ORIGIN}/login`,
  });
  if (looksLikeBadCredentials(login.text)) {
    throw new Error("csl Prepaid 手机号或 6 位密码不正确");
  }

  const loginPages = await followSafeRedirects(login, cookies, `${CSL_ORIGIN}/login`);
  if (loginPages.some((page) => looksLikeBadCredentials(page.text))) {
    throw new Error("csl Prepaid 手机号或 6 位密码不正确");
  }

  // The real browser flow lands on Card Information after authentication.
  // Follow csl's same-origin redirects because the site uses redirect responses
  // to complete session/language setup before rendering the account page.
  const cardStart = await requestPage("/cardinformation?lang=EN", cookies, {
    referer: `${CSL_ORIGIN}/login`,
  });
  const cardPages = await followSafeRedirects(
    cardStart,
    cookies,
    `${CSL_ORIGIN}/cardinformation?lang=EN`,
  );
  const cardInformation = cardPages[cardPages.length - 1];

  if (looksLikeLoginPage(cardInformation.text)) {
    throw new Error("csl Prepaid 登录失败；请确认手机号与 6 位密码，必要时可使用该号码拨 *111# 重设密码");
  }

  return parseCardInformation(cardInformation.text);
}

export const cslCarrierConnectorProvider: CarrierConnectorProvider = {
  id: "csl",
  label: "csl Prepaid",
  description: "使用香港 csl Prepaid My Account 的手机号和 6 位密码登录官方 prepaid.hkcsl.com，并从 Card Information 同步余额、状态与有效日期。",
  minLinkedSims: 1,
  maxLinkedSims: 1,
  configFields: [],
  credentialFields: [
    {
      key: "password",
      label: "csl 6 位密码",
      required: true,
      placeholder: "输入 csl 6 位密码",
      description: "使用 csl Prepaid My Account 密码；可用该 SIM 拨 *111# 查询或重设。密码仅加密保存在 SIMKeeper。",
    },
  ],
  async sync({ credentials, sim }): Promise<NormalizedCarrierSyncResult> {
    assertCslSim(sim);
    const mobileNumber = normalizeCslNumber(sim.phoneNumber);
    const password = String(credentials.password ?? "").trim();
    if (!password) throw new Error("未保存 csl Prepaid 密码，请编辑号码后重新填写");
    if (!/^\d{6}$/.test(password)) throw new Error("csl Prepaid 密码必须为 6 位数字");

    const account = await loginAndReadAccount(mobileNumber, password);
    return {
      balance: account.balance,
      currencyCode: "HKD",
      balanceValidUntil: account.expiry,
      accountStatus: account.accountStatus,
    };
  },
};