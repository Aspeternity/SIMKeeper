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
      .replace(/<\/tr\s*>/gi, "\n")
      .replace(/<\/td\s*>/gi, " | ")
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
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function extractBalance(html: string) {
  const rows = rowsFromHtml(html);
  const preferredLabels = [
    /stored\s*value/i,
    /main\s*(?:account|balance)/i,
    /account\s*balance/i,
    /remaining\s*balance/i,
    /儲值額|储值额|賬戶餘額|账户余额|餘額|余额/i,
  ];

  for (const label of preferredLabels) {
    for (const row of rows) {
      if (!label.test(row)) continue;
      if (/local\s*data|roaming\s*data|voice|minute|sms/i.test(row)) continue;
      const money = row.match(/(?:HK\$|HKD|\$)\s*([0-9][0-9,]*(?:\.\d+)?)/i)
        ?? row.match(/([0-9][0-9,]*(?:\.\d+)?)\s*(?:HKD|HK\$)/i);
      if (money) {
        const parsed = normalizeMoney(money[1]);
        if (parsed !== null) return parsed;
      }
    }
  }

  const text = htmlToText(html);
  for (const pattern of [
    /(?:stored\s*value|main\s*(?:account|balance)|account\s*balance|remaining\s*balance)[\s\S]{0,100}?(?:HK\$|HKD|\$)\s*([0-9][0-9,]*(?:\.\d+)?)/i,
    /(?:儲值額|储值额|賬戶餘額|账户余额|餘額|余额)[\s\S]{0,80}?(?:HK\$|HKD|\$)?\s*([0-9][0-9,]*(?:\.\d+)?)/i,
  ]) {
    const match = text.match(pattern);
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

  match = value.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d{2})\b/i);
  if (match) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    return isoDate(Number(match[3]), months.indexOf(match[2].slice(0, 3).toLowerCase()) + 1, Number(match[1]));
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
    const date = parseDateValue(`${lines[index]} ${lines[index + 1] ?? ""}`);
    if (date) return date;
  }
  return null;
}

function statusFromExpiry(expiry: string | null): ConnectorAccountStatus {
  if (!expiry) return "active";
  const endOfDay = Date.parse(`${expiry}T23:59:59+08:00`);
  return Number.isFinite(endOfDay) && Date.now() > endOfDay ? "expired" : "active";
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

  const usage = await requestPage("/usage?lang=EN", cookies, {
    referer: `${CSL_ORIGIN}/login`,
  });
  if (looksLikeLoginPage(usage.text)) {
    throw new Error("csl Prepaid 登录失败；请确认手机号与 6 位密码，必要时可使用该号码拨 *111# 重设密码");
  }

  const balance = extractBalance(usage.text);
  const expiry = extractExpiry(usage.text);
  if (balance === null) {
    throw new Error("csl Prepaid 已登录，但当前页面未识别到余额字段；网页结构可能已经变化，请把错误反馈给 SIMKeeper");
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
