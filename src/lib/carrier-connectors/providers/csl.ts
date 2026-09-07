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
      .replace(/<\/p\s*>/gi, "\n")
      .replace(/<\/div\s*>/gi, "\n")
      .replace(/<\/li\s*>/gi, "\n")
      .replace(/<\/tr\s*>/gi, "\n")
      .replace(/<\/td\s*>/gi, " | ")
      .replace(/<\/th\s*>/gi, " | ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function rowsFromHtml(html: string) {
  return html
    .split(/<\/tr\s*>/i)
    .map((row) => htmlToText(row).replace(/\s*\|\s*/g, " | ").trim())
    .filter(Boolean);
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
  maxRedirects = 3,
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

function linkedAccountPaths(html: string) {
  const paths = new Set<string>();
  const hrefPattern = /href\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefPattern.exec(html)) !== null) {
    const raw = decodeHtmlEntities(match[1] ?? "").trim();
    if (!raw || raw.startsWith("#") || /^javascript:/i.test(raw)) continue;
    try {
      const url = new URL(raw, CSL_ORIGIN);
      if (url.origin !== CSL_ORIGIN) continue;
      const path = `${url.pathname}${url.search}`;
      if (!/(?:account|summary|overview|home|usage|balance)/i.test(path)) continue;
      if (/(?:login|logout|topup|recharge|password|subscribe|payment)/i.test(path)) continue;
      paths.add(path);
      if (paths.size >= 4) break;
    } catch {
      // Ignore malformed links from the remote page.
    }
  }
  return Array.from(paths);
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

const balanceLabel = /stored[-\s]*value|store[-\s]*value|main\s*(?:account\s*)?balance|account\s*balance|current\s*balance|remaining\s*balance|available\s*(?:credit|balance)|credit\s*balance|cash\s*balance|remaining\s*value|account\s*value|prepaid\s*(?:card\s*)?balance|儲值額|储值额|賬戶餘額|账户余额|目前餘額|当前余额|可用餘額|可用余额|餘額|余额/i;

function extractMoneyAfterLabel(segment: string) {
  const labelMatch = segment.match(balanceLabel);
  if (!labelMatch || labelMatch.index === undefined) return null;
  if (/maximum\s+stored|max(?:imum)?\s+balance|最高儲值|最高储值/i.test(segment)) return null;

  const after = segment.slice(labelMatch.index + labelMatch[0].length, labelMatch.index + labelMatch[0].length + 160);
  const currency = after.match(/(?:HK\$|HKD|\$)\s*([0-9][0-9,]*(?:\.\d+)?)/i)
    ?? after.match(/([0-9][0-9,]*(?:\.\d+)?)\s*(?:HKD|HK\$)/i);
  if (currency) return normalizeMoney(currency[1]);

  const numericPattern = /([0-9][0-9,]*(?:\.\d+)?)/g;
  let numeric: RegExpExecArray | null;
  while ((numeric = numericPattern.exec(after)) !== null) {
    const raw = numeric[1];
    const value = normalizeMoney(raw);
    if (value === null) continue;
    if (raw.replace(/[,\.]/g, "").length >= 6) continue;

    const before = after.slice(Math.max(0, numeric.index - 28), numeric.index);
    const suffix = after.slice(numeric.index + raw.length, numeric.index + raw.length + 24);
    if (/expiry|expiration|valid|date|有效|到期/i.test(before)) continue;
    if (/^\s*(?:GB|MB|KB|TB|day|days|hour|hours|min|mins|minute|minutes|SMS|%)/i.test(suffix)) continue;
    return value;
  }
  return null;
}

function extractBalance(html: string) {
  const rows = rowsFromHtml(html);
  for (const row of rows) {
    if (!balanceLabel.test(row)) continue;
    const parsed = extractMoneyAfterLabel(row);
    if (parsed !== null) return parsed;
  }

  const lines = htmlToText(html).split("\n").filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    if (!balanceLabel.test(lines[index])) continue;
    const segment = [lines[index], lines[index + 1], lines[index + 2]].filter(Boolean).join(" | ");
    const parsed = extractMoneyAfterLabel(segment);
    if (parsed !== null) return parsed;
  }

  for (const pattern of [
    /["']?(?:storedValue|stored_value|mainBalance|main_balance|accountBalance|account_balance|availableBalance|available_balance|creditBalance|credit_balance|balance)["']?\s*[:=]\s*["']?(?:HK\$|HKD|\$)?\s*([0-9][0-9,]*(?:\.\d+)?)/i,
    /data-(?:balance|stored-value|available-balance)\s*=\s*["'](?:HK\$|HKD|\$)?\s*([0-9][0-9,]*(?:\.\d+)?)["']/i,
  ]) {
    const match = html.match(pattern);
    if (!match) continue;
    const parsed = normalizeMoney(match[1]);
    if (parsed !== null) return parsed;
  }
  return null;
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
  let match = value.match(/\b(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/);
  if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));

  match = value.match(/\b(\d{1,2})[-\/.](\d{1,2})[-\/.](20\d{2})\b/);
  if (match) return isoDate(Number(match[3]), Number(match[2]), Number(match[1]));

  match = value.match(/\b(\d{1,2})[\s-]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,-]+(20\d{2})\b/i);
  if (match) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    return isoDate(Number(match[3]), months.indexOf(match[2].slice(0, 3).toLowerCase()) + 1, Number(match[1]));
  }

  match = value.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s-]+(\d{1,2}),?[\s-]+(20\d{2})\b/i);
  if (match) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    return isoDate(Number(match[3]), months.indexOf(match[1].slice(0, 3).toLowerCase()) + 1, Number(match[2]));
  }
  return null;
}

function extractExpiry(html: string) {
  const rows = rowsFromHtml(html);
  const label = /expiry(?:\s*date)?|expiration(?:\s*date)?|valid\s*(?:until|thru|through)|validity|有效(?:日期|期)|到期(?:日|日期)?/i;
  for (const row of rows) {
    if (!label.test(row)) continue;
    const date = parseDateValue(row);
    if (date) return date;
  }

  const text = htmlToText(html);
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (!label.test(lines[index])) continue;
    const date = parseDateValue(`${lines[index]} ${lines[index + 1] ?? ""} ${lines[index + 2] ?? ""}`);
    if (date) return date;
  }
  return null;
}

function statusFromExpiry(expiry: string | null): ConnectorAccountStatus {
  if (!expiry) return "active";
  const endOfDay = Date.parse(`${expiry}T23:59:59+08:00`);
  return Number.isFinite(endOfDay) && Date.now() > endOfDay ? "expired" : "active";
}

function safePageDiagnostics(pages: PageResponse[]) {
  return pages.map((page, index) => {
    const text = htmlToText(page.text);
    const balanceHint = balanceLabel.test(text) ? 1 : 0;
    const hkdHint = /HK\$|HKD/i.test(text) ? 1 : 0;
    const expiryHint = /expiry|expiration|validity|valid\s*(?:until|thru|through)|有效|到期/i.test(text) ? 1 : 0;
    const localDataHint = /local\s*data/i.test(text) ? 1 : 0;
    const moneyCount = (text.match(/(?:HK\$|HKD|\$)\s*[0-9][0-9,]*(?:\.\d+)?/gi) ?? []).length;
    return `P${index + 1}[balance=${balanceHint},hkd=${hkdHint},expiry=${expiryHint},localData=${localDataHint},money=${moneyCount}]`;
  }).join(" ");
}

async function loginAndReadAccount(mobileNumber: string, password: string) {
  const cookies: CookieJar = new Map();
  const loginPage = await requestPage("/login?lang=EN", cookies);
  if (loginPage.status < 200 || loginPage.status >= 400) {
    throw new Error("csl Prepaid 登录页暂时不可用");
  }

  const form = new URLSearchParams({ msisdn: mobileNumber, password });
  const login = await requestPage("/login_add", cookies, {
    method: "POST",
    form,
    referer: `${CSL_ORIGIN}/login`,
  });
  if (looksLikeBadCredentials(login.text)) {
    throw new Error("csl Prepaid 手机号或 6 位密码不正确");
  }

  const pages = await followSafeRedirects(login, cookies, `${CSL_ORIGIN}/login`);
  if (pages.some((page) => looksLikeBadCredentials(page.text))) {
    throw new Error("csl Prepaid 手机号或 6 位密码不正确");
  }

  // The authenticated account shell can still contain the public login widget.
  // Do not treat every redirect page that contains login wording as an auth failure.
  // /usage is the authoritative session check because it requires the authenticated cookie.
  const usage = await requestPage("/usage?lang=EN", cookies, {
    referer: `${CSL_ORIGIN}/login`,
  });
  if (looksLikeLoginPage(usage.text)) {
    throw new Error("csl Prepaid 登录失败；请确认手机号与 6 位密码，必要时可使用该号码拨 *111# 重设密码");
  }
  pages.push(usage);

  const visited = new Set<string>(["/usage?lang=EN"]);
  const discoveredPaths = pages.flatMap((page) => linkedAccountPaths(page.text));
  for (const path of discoveredPaths) {
    if (visited.has(path)) continue;
    visited.add(path);
    try {
      const page = await requestPage(path, cookies, { referer: `${CSL_ORIGIN}/usage?lang=EN` });
      if (!looksLikeLoginPage(page.text)) pages.push(page);
    } catch {
      // Optional account links are only fallbacks. A single stale link must not
      // turn an otherwise valid csl session into a failed sync.
    }
    if (visited.size >= 5) break;
  }

  let balance: number | null = null;
  let expiry: string | null = null;
  for (const page of pages) {
    if (balance === null) balance = extractBalance(page.text);
    if (expiry === null) expiry = extractExpiry(page.text);
    if (balance !== null && expiry !== null) break;
  }

  if (balance === null) {
    throw new Error(`csl Prepaid 已登录，但账户页面仍未识别到储值余额；${safePageDiagnostics(pages)}`);
  }

  return {
    balance,
    expiry,
    accountStatus: statusFromExpiry(expiry),
  };
}

export const cslCarrierConnectorProvider: CarrierConnectorProvider = {
  id: "csl",
  label: "csl Prepaid",
  description: "使用香港 csl Prepaid My Account 的手机号和 6 位密码登录官方 prepaid.hkcsl.com，并自动同步储值余额与有效日期。",
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