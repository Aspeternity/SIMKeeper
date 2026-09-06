import "server-only";

import { createCipheriv, createHash } from "node:crypto";
import type {
  CarrierConnectorProvider,
  CarrierConnectorSimContext,
  ConnectorAccountStatus,
  NormalizedCarrierSyncResult,
} from "@/lib/carrier-connectors/types";

const MYDITO_ORIGIN = "https://my.dito.ph";
const ECARE_WEB_PREFIX = "/ecare/webs";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const SIGN_SUFFIX = "32BytesString";
const PASSWORD_KEY = Buffer.from("4EGJ6D9CFFA2GG9A", "utf8");
const PASSWORD_IV = Buffer.from("0102030405060708", "utf8");

const blockedCredentialFingerprints = new Map<number, string>();

type JsonObject = Record<string, unknown>;
type CookieJar = Map<string, string>;

type RequestOptions = {
  method?: "GET" | "POST";
  body?: JsonObject;
  authToken?: string;
  cookies: CookieJar;
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

function credentialFingerprint(password: string) {
  return createHash("sha256").update(password, "utf8").digest("hex");
}

function normalizeDitoAccount(phoneNumber: string | null | undefined) {
  let digits = String(phoneNumber ?? "").replace(/\D/g, "");
  if (digits.startsWith("63") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  if (!/^9\d{9}$/.test(digits)) {
    throw new Error("关联 SIM 缺少有效的菲律宾 DITO 手机号；请先在号码管理中填写 09xx xxx xxxx 或 +63 9xx xxx xxxx");
  }
  return digits;
}

function assertDitoSim(sim: CarrierConnectorSimContext) {
  if (sim.countryCode.toUpperCase() !== "PH") {
    throw new Error("DITO MyDITO 只能同步菲律宾号码");
  }
  if (!sim.carrierName.toLowerCase().includes("dito")) {
    throw new Error("关联号码的运营商不是 DITO");
  }
}

function encryptPassword(password: string) {
  const cipher = createCipheriv("aes-128-cbc", PASSWORD_KEY, PASSWORD_IV);
  cipher.setAutoPadding(true);
  return cipher.update(password, "utf8", "base64") + cipher.final("base64");
}

function cleanPostBody(body: JsonObject) {
  return JSON.stringify(body)
    .replace(/[^a-zA-Z\d]/g, "")
    .replace(/null/g, "");
}

function signedPath(path: string) {
  if (!path.startsWith(`${ECARE_WEB_PREFIX}/`)) {
    throw new Error("MyDITO 请求路径不受支持");
  }
  return path.slice(ECARE_WEB_PREFIX.length);
}

function makeSigncode(
  path: string,
  method: "GET" | "POST",
  body: JsonObject | undefined,
  authToken: string,
) {
  const relative = signedPath(path);
  const bodyPart = method === "POST" ? cleanPostBody(body ?? {}) : "";
  const raw = `/${relative.replace(/^\//, "")}${bodyPart}${authToken}${SIGN_SUFFIX}`;
  return createHash("sha256").update(raw, "utf8").digest("hex");
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

function safeRemoteMessage(payload: unknown) {
  const root = objectValue(payload);
  for (const key of ["errorMsg", "message", "description", "errorCode", "oriCode", "code"]) {
    const value = root[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 300);
    if (typeof value === "number") return String(value);
  }
  return "MyDITO 返回了错误响应";
}

async function requestMyDito(path: string, options: RequestOptions) {
  const method = options.method ?? "GET";
  const authToken = options.authToken ?? "";
  const timestamp = String(Date.now());
  const signcode = makeSigncode(path, method, options.body, authToken);
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    appversion: "",
    "device-id": "",
    "device-type": "web",
    "Auth-Token": authToken,
    authtoken: authToken,
    "X-CSRF-TOKEN": authToken,
    signcode,
    timestamp,
    Referer: `${MYDITO_ORIGIN}/`,
  };

  const cookies = cookieHeader(options.cookies);
  if (cookies) headers.Cookie = cookies;
  if (method === "POST") {
    headers["Content-Type"] = "application/json";
    headers.Origin = MYDITO_ORIGIN;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${MYDITO_ORIGIN}${path}`, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(options.body ?? {}) : undefined,
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("连接 MyDITO 超时，请稍后重试");
    }
    throw new Error("无法连接 MyDITO，请检查 SIMKeeper 服务器的网络访问");
  } finally {
    clearTimeout(timeout);
  }

  rememberResponseCookies(response.headers, options.cookies);

  if (response.status >= 300 && response.status < 400) {
    throw new Error("MyDITO 返回了意外跳转，接口可能已经变更");
  }

  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("MyDITO 响应过大，已停止解析");
  }

  let payload: unknown = {};
  if (text.trim()) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new Error("MyDITO 返回了无法解析的数据");
    }
  }

  if (!response.ok) {
    throw new Error(`MyDITO 请求失败（HTTP ${response.status}）：${safeRemoteMessage(payload)}`);
  }
  return payload;
}

function extractObject(payload: unknown) {
  const root = objectValue(payload);
  return isObject(root.data) ? root.data : root;
}

async function ensurePasswordOnlyLogin(cookies: CookieJar) {
  const payload = await requestMyDito(`${ECARE_WEB_PREFIX}/common/configParam`, {
    method: "POST",
    body: { configCode: "webs.ecare.otp.rule" },
    cookies,
  });
  const config = extractObject(payload);
  const pwdLogin = stringValue(config.pwdLogin).toUpperCase();
  if (pwdLogin === "Y") {
    throw new Error("MyDITO 当前要求密码登录附加短信验证码，自动同步已停止，请先在 MyDITO 完成人工验证后再试");
  }
  if (pwdLogin !== "N") {
    throw new Error("无法确认 MyDITO 当前是否允许免短信验证码的密码登录，为避免触发账户风控，本次未尝试登录");
  }
}

function accountStatusFromUserState(value: unknown): ConnectorAccountStatus {
  const state = stringValue(value).toUpperCase();
  if (state === "A" || state === "ACTIVE") return "active";
  if (["S", "SUSPENDED", "BARRED", "B"].includes(state)) return "suspended";
  if (["E", "EXPIRED"].includes(state)) return "expired";
  if (["C", "D", "CLOSED", "DEACTIVATED"].includes(state)) return "closed";
  return "unknown";
}

function validateReturnedNumber(value: unknown, expectedAccount: string) {
  const raw = stringValue(value);
  if (!raw) return;
  let normalized: string;
  try {
    normalized = normalizeDitoAccount(raw);
  } catch {
    throw new Error("MyDITO 返回的登录号码格式异常，已停止同步");
  }
  if (normalized !== expectedAccount) {
    throw new Error("MyDITO 登录账户与关联 SIM 不一致，已停止同步");
  }
}

async function login(
  connectorId: number,
  account: string,
  password: string,
  cookies: CookieJar,
) {
  const fingerprint = credentialFingerprint(password);
  if (blockedCredentialFingerprints.get(connectorId) === fingerprint) {
    throw new Error("需要重新认证：上一次 MyDITO 密码登录失败。请编辑连接并重新填写正确密码后再同步");
  }

  const payload = await requestMyDito(`${ECARE_WEB_PREFIX}/user/login`, {
    method: "POST",
    body: {
      account,
      password: encryptPassword(password),
      channelType: "2",
      loginType: "1",
      pwdType: "0",
    },
    cookies,
  });
  const result = objectValue(payload);
  if (result.loginSuccess !== true) {
    blockedCredentialFingerprints.set(connectorId, fingerprint);
    throw new Error(`需要重新认证：MyDITO 密码登录失败（${safeRemoteMessage(result)}）。SIMKeeper 不会使用同一密码连续重试`);
  }

  const token = stringValue(result.token) || stringValue(result.loginToken);
  if (!token) throw new Error("MyDITO 登录成功但未返回 Auth-Token");
  const userData = objectValue(result.userData);
  validateReturnedNumber(userData.mobile ?? userData.userName, account);
  blockedCredentialFingerprints.delete(connectorId);

  return {
    token,
    userId: numberValue(userData.userId),
    subsId: numberValue(userData.subsId),
    accountStatus: accountStatusFromUserState(userData.state),
  };
}

async function discoverAccountId(
  authToken: string,
  account: string,
  userId: number | null,
  subsId: number | null,
  cookies: CookieJar,
) {
  if (subsId !== null) {
    try {
      const payload = await requestMyDito(
        `${ECARE_WEB_PREFIX}/subs/qrySubsDetail?prodInstIds=${encodeURIComponent(String(subsId))}`,
        { authToken, cookies },
      );
      const detail = extractObject(payload);
      const accountId = numberValue(detail.defaultAcctId ?? detail.acctId);
      if (accountId !== null && accountId > 0) return accountId;
    } catch {
      // qrySubsDetail is the official web flow. qryUserInfo below is retained
      // as a conservative fallback because it exposes the same account link.
    }
  }

  if (userId !== null) {
    const payload = await requestMyDito(
      `${ECARE_WEB_PREFIX}/cust/qryUserInfo/${encodeURIComponent(String(userId))}`,
      { authToken, cookies },
    );
    const info = extractObject(payload);
    validateReturnedNumber(info.ditoNumber ?? info.name, account);
    const accountId = numberValue(info.acctId);
    if (accountId !== null && accountId > 0) return accountId;
  }

  throw new Error("MyDITO 已登录，但无法自动发现 Account ID；DITO 接口结构可能已经变更");
}

function parseBalanceValidity(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return null;
  if (/^\d{14}$/.test(raw) || /^\d{8}$/.test(raw)) {
    const year = raw.slice(0, 4);
    const month = raw.slice(4, 6);
    const day = raw.slice(6, 8);
    const normalized = `${year}-${month}-${day}`;
    const timestamp = Date.parse(`${normalized}T00:00:00Z`);
    return Number.isFinite(timestamp) ? normalized : null;
  }
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function currencyFromBalance(payload: JsonObject) {
  const symbol = stringValue(payload.currencySymbol);
  const code = stringValue(payload.currencyCode ?? payload.currency).toUpperCase();
  if (symbol === "₱" || code === "PHP") return "PHP";
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

async function readBalance(
  authToken: string,
  accountId: number,
  cookies: CookieJar,
  accountStatus: ConnectorAccountStatus,
): Promise<NormalizedCarrierSyncResult> {
  const payload = await requestMyDito(
    `${ECARE_WEB_PREFIX}/account/${encodeURIComponent(String(accountId))}/balance`,
    { authToken, cookies },
  );
  const balanceData = extractObject(payload);
  const displayBalance = balanceData.displayBalance;
  const balance = numberValue(displayBalance);
  if (balance === null || balance < 0) {
    throw new Error("MyDITO 余额响应缺少有效的 displayBalance");
  }
  const currencyCode = currencyFromBalance(balanceData);
  if (!currencyCode) throw new Error("MyDITO 余额响应缺少可识别的币种");

  return {
    balance,
    currencyCode,
    balanceValidUntil: parseBalanceValidity(balanceData.expDate),
    accountStatus,
  };
}

export const ditoCarrierConnectorProvider: CarrierConnectorProvider = {
  id: "dito",
  label: "DITO MyDITO",
  description: "使用关联的菲律宾 DITO 号码和 MyDITO 密码临时登录官方 MyDITO，自动读取 Load Balance 与余额有效期。",
  minLinkedSims: 1,
  maxLinkedSims: 1,
  configFields: [],
  credentialFields: [
    {
      key: "password",
      label: "MyDITO 登录密码",
      required: true,
      placeholder: "输入 MyDITO 密码",
      description: "密码使用 SIMKeeper 凭据加密存储；Auth-Token 仅在单次同步内存中使用，不会持久化。",
    },
  ],
  async sync({ connectorId, credentials, sim }) {
    assertDitoSim(sim);
    const account = normalizeDitoAccount(sim.phoneNumber);
    const password = stringValue(credentials.password);
    if (!password) {
      if (credentials.requestHeadersJson) {
        throw new Error("此 DITO 连接仍使用 alpha.21 的旧会话凭据，请编辑连接并填写 MyDITO 登录密码");
      }
      throw new Error("未保存 MyDITO 登录密码，请编辑连接后重新填写");
    }
    if (password.length < 6) throw new Error("MyDITO 登录密码格式无效");

    const cookies: CookieJar = new Map();
    await ensurePasswordOnlyLogin(cookies);
    const session = await login(connectorId, account, password, cookies);
    const accountId = await discoverAccountId(
      session.token,
      account,
      session.userId,
      session.subsId,
      cookies,
    );
    return readBalance(session.token, accountId, cookies, session.accountStatus);
  },
};
