import "server-only";

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDir } from "@/db";

const GLOBE_API_ORIGIN = "https://digital.api.globe.com.ph";
const GLOBE_API_HOST = "digital.api.globe.com.ph";
const GLOBE_TOKEN_PATH = "/v1/channels/oauth/token";
const TOKEN_REFRESH_SKEW_MS = 60_000;
const TOKEN_FALLBACK_TTL_MS = 10 * 60_000;
const TOKEN_REQUEST_TIMEOUT_MS = 15_000;
const MAX_TOKEN_RESPONSE_BYTES = 256 * 1024;
const MAX_SECRET_BYTES = 64 * 1024;
const DEFAULT_AUTHORIZATION_FILE = "/run/secrets/globeone_app_authorization";
const DEFAULT_ACCESS_TOKEN_FILE = "/run/secrets/globeone_app_access_token";
const DEVICE_ID_PATH = path.join(dataDir, ".globeone-device-id");

type TokenCache = {
  token: string;
  expiresAt: number;
  source: "oauth" | "static";
};

type JsonObject = Record<string, unknown>;

type RuntimeSecret = {
  value: string;
  source: string | null;
};

type RuntimeAuthMode = "oauth" | "static-token" | null;

let cachedToken: TokenCache | null = null;
let tokenRequest: Promise<TokenCache> | null = null;
let originalFetch: typeof globalThis.fetch | null = null;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function cleanSingleLine(value: string, label: string) {
  const cleaned = value.trim();
  if (!cleaned) return "";
  if (/\r|\n/.test(cleaned)) throw new Error(`${label} 不能包含多行内容`);
  return cleaned;
}

function cleanSingleLineEnv(name: string) {
  return cleanSingleLine(String(process.env[name] ?? ""), name);
}

function readSecretFile(filePath: string, label: string) {
  if (!path.isAbsolute(filePath)) throw new Error(`${label} 文件路径必须是绝对路径`);
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error(`${label} 不是普通文件`);
    if (stat.size > MAX_SECRET_BYTES) throw new Error(`${label} 文件过大`);
    return cleanSingleLine(fs.readFileSync(filePath, "utf8"), label);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    if (code === "ENOENT") return "";
    throw error;
  }
}

function readRuntimeSecret(valueEnv: string, fileEnv: string, defaultFile: string): RuntimeSecret {
  const direct = cleanSingleLineEnv(valueEnv);
  if (direct) return { value: direct, source: `env:${valueEnv}` };

  const configuredFile = cleanSingleLineEnv(fileEnv);
  const filePath = configuredFile || defaultFile;
  const fromFile = readSecretFile(filePath, fileEnv);
  if (fromFile) return { value: fromFile, source: `file:${filePath}` };
  return { value: "", source: null };
}

function normalizeStaticToken(value: string) {
  return value.replace(/^Bearer\s+/i, "").trim();
}

function runtimeSecrets() {
  const staticToken = readRuntimeSecret(
    "GLOBEONE_APP_ACCESS_TOKEN",
    "GLOBEONE_APP_ACCESS_TOKEN_FILE",
    DEFAULT_ACCESS_TOKEN_FILE,
  );
  const authorization = readRuntimeSecret(
    "GLOBEONE_APP_AUTHORIZATION",
    "GLOBEONE_APP_AUTHORIZATION_FILE",
    DEFAULT_AUTHORIZATION_FILE,
  );
  return {
    staticToken: { ...staticToken, value: normalizeStaticToken(staticToken.value) },
    authorization,
  };
}

function decodeJwtExpiry(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as unknown;
    if (!isObject(payload)) return null;
    const exp = numberValue(payload.exp);
    if (!exp || exp <= 0) return null;
    return Math.floor(exp * 1000);
  } catch {
    return null;
  }
}

function runtimeMode(secrets: ReturnType<typeof runtimeSecrets>): RuntimeAuthMode {
  if (secrets.staticToken.value) return "static-token";
  if (secrets.authorization.value) return "oauth";
  return null;
}

export function globeOneRuntimeAuthStatus() {
  try {
    const secrets = runtimeSecrets();
    const mode = runtimeMode(secrets);
    const source = secrets.staticToken.value ? secrets.staticToken.source : secrets.authorization.source;
    const staticExpiryMs = secrets.staticToken.value ? decodeJwtExpiry(secrets.staticToken.value) : null;
    const expired = Boolean(staticExpiryMs && staticExpiryMs <= Date.now());
    const configured = Boolean(mode && !expired);
    const expiresAt = staticExpiryMs ? new Date(staticExpiryMs).toISOString() : null;

    let message: string | null = null;
    let warning: string | null = null;
    if (!mode) {
      message = "GlobeOne 服务端认证尚未配置。长期模式请放置 globeone_app_authorization；真实联调也可以临时放置 globeone_app_access_token。";
    } else if (expired) {
      message = "GlobeOne 临时 App Access Token 已过期，请替换 secrets/globeone_app_access_token 后重新打开号码编辑页面。";
    } else if (mode === "static-token") {
      warning = staticExpiryMs
        ? `当前为临时 App Access Token 联调模式；Token 预计于 ${new Date(staticExpiryMs).toISOString()} 过期，过期后需要替换文件。`
        : "当前为临时 App Access Token 联调模式；无法从 Token 本身判断过期时间，若 GlobeOne 返回 401/403 请替换 Token。";
    }

    return {
      configured,
      source,
      mode,
      expiresAt,
      expired,
      warning,
      message,
    };
  } catch (error) {
    return {
      configured: false,
      source: null,
      mode: null as RuntimeAuthMode,
      expiresAt: null as string | null,
      expired: false,
      warning: null as string | null,
      message: error instanceof Error ? error.message : "GlobeOne 服务端认证配置读取失败",
    };
  }
}

function readDeviceId() {
  const configured = cleanSingleLineEnv("GLOBEONE_DEVICE_ID");
  if (configured) {
    if (configured.length > 160) throw new Error("GLOBEONE_DEVICE_ID 长度无效");
    return configured;
  }

  fs.mkdirSync(dataDir, { recursive: true });
  try {
    const existing = fs.readFileSync(DEVICE_ID_PATH, "utf8").trim();
    if (existing) return existing;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    if (code !== "ENOENT") throw error;
  }

  const generated = randomUUID();
  try {
    fs.writeFileSync(DEVICE_ID_PATH, generated, { mode: 0o600, flag: "wx" });
    return generated;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    if (code !== "EEXIST") throw error;
    const existing = fs.readFileSync(DEVICE_ID_PATH, "utf8").trim();
    return existing || generated;
  }
}

function tokenResult(payload: unknown) {
  const root = isObject(payload) ? payload : {};
  const result = isObject(root.result) ? root.result : root;
  const token = stringValue(result.accessToken ?? result.access_token);
  const tokenType = stringValue(result.tokenType ?? result.token_type) || "Bearer";
  const expiresIn = numberValue(result.expiresIn ?? result.expires_in);
  return { token, tokenType, expiresIn };
}

function remoteMessage(payload: unknown) {
  const root = isObject(payload) ? payload : {};
  const error = isObject(root.error) ? root.error : {};
  return stringValue(error.message ?? error.description ?? root.message ?? root.description) || "未知错误";
}

function localTransportErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "GlobeOne App 级认证初始化失败";
  return new Response(JSON.stringify({ error: { message } }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

async function requestOAuthToken(fetchImpl: typeof globalThis.fetch): Promise<TokenCache> {
  const secrets = runtimeSecrets();
  if (secrets.staticToken.value) {
    const expiresAt = decodeJwtExpiry(secrets.staticToken.value);
    if (expiresAt && expiresAt <= Date.now()) {
      throw new Error("GlobeOne 临时 App Access Token 已过期，请替换 secrets/globeone_app_access_token");
    }
    return {
      token: secrets.staticToken.value,
      expiresAt: expiresAt ?? Number.POSITIVE_INFINITY,
      source: "static",
    };
  }

  const authorization = secrets.authorization.value;
  if (!authorization) {
    throw new Error(
      "GlobeOne App 级认证尚未配置；请通过 /run/secrets/globeone_app_authorization 或 GLOBEONE_APP_AUTHORIZATION 注入授权值。该值不会写入 SQLite 或便携备份",
    );
  }
  if (!/^Basic\s+\S+/i.test(authorization)) {
    throw new Error("GlobeOne App 授权值必须是完整的 Basic Authorization 值");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOKEN_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(`${GLOBE_API_ORIGIN}${GLOBE_TOKEN_PATH}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: authorization,
        "Content-Type": "application/json",
        DeviceId: readDeviceId(),
      },
      body: "{}",
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("获取 GlobeOne App Access Token 超时，请稍后重试");
    }
    throw new Error("无法获取 GlobeOne App Access Token，请检查 SIMKeeper 服务器网络或 App 级认证配置");
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_TOKEN_RESPONSE_BYTES) {
    throw new Error("GlobeOne App Access Token 响应过大，已停止解析");
  }

  let payload: unknown = {};
  if (text.trim()) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new Error(`GlobeOne App Access Token 返回无法解析的数据（HTTP ${response.status}）`);
    }
  }

  if (!response.ok) {
    throw new Error(`GlobeOne App Access Token 获取失败（HTTP ${response.status}）：${remoteMessage(payload)}`);
  }

  const result = tokenResult(payload);
  if (!result.token) throw new Error("GlobeOne App Access Token 响应缺少 accessToken");
  if (result.tokenType && !/^Bearer$/i.test(result.tokenType)) {
    throw new Error(`GlobeOne 返回了不受支持的 App Token 类型：${result.tokenType}`);
  }

  const ttl = result.expiresIn && result.expiresIn > 0
    ? Math.max(60_000, result.expiresIn * 1000)
    : TOKEN_FALLBACK_TTL_MS;
  return {
    token: result.token,
    expiresAt: Date.now() + ttl,
    source: "oauth",
  };
}

async function getToken(fetchImpl: typeof globalThis.fetch) {
  if (cachedToken && Date.now() < cachedToken.expiresAt - TOKEN_REFRESH_SKEW_MS) return cachedToken;
  if (cachedToken?.source === "static" && cachedToken.expiresAt === Number.POSITIVE_INFINITY) return cachedToken;
  if (tokenRequest) return tokenRequest;

  tokenRequest = requestOAuthToken(fetchImpl)
    .then((token) => {
      cachedToken = token;
      return token;
    })
    .finally(() => {
      tokenRequest = null;
    });
  return tokenRequest;
}

function invalidateOAuthToken() {
  if (cachedToken?.source !== "static") cachedToken = null;
}

function requestUrl(input: RequestInfo | URL) {
  try {
    if (typeof input === "string") return new URL(input);
    if (input instanceof URL) return input;
    return new URL(input.url);
  } catch {
    return null;
  }
}

function cloneInitWithHeaders(input: RequestInfo | URL, init: RequestInit | undefined, headers: Headers) {
  if (input instanceof Request) {
    return {
      input: new Request(input, { ...init, headers }),
      init: undefined,
    } as const;
  }
  return {
    input,
    init: { ...init, headers },
  } as const;
}

async function globeFetch(
  fetchImpl: typeof globalThis.fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const url = requestUrl(input);
  if (!url || url.protocol !== "https:" || url.hostname !== GLOBE_API_HOST || url.pathname === GLOBE_TOKEN_PATH) {
    return fetchImpl(input, init);
  }

  const send = async (forceRefresh: boolean) => {
    if (forceRefresh) invalidateOAuthToken();
    const appToken = await getToken(fetchImpl);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    headers.set("Authorization", `Bearer ${appToken.token}`);
    headers.set("DeviceId", readDeviceId());
    const next = cloneInitWithHeaders(input, init, headers);
    return fetchImpl(next.input, next.init);
  };

  let response: Response;
  try {
    response = await send(false);
  } catch (error) {
    return localTransportErrorResponse(error);
  }

  if ((response.status === 401 || response.status === 403) && cachedToken?.source !== "static") {
    try {
      await response.body?.cancel();
    } catch {
      // Best effort: release the first unauthorized response before retrying once.
    }
    try {
      response = await send(true);
    } catch (error) {
      return localTransportErrorResponse(error);
    }
  }
  return response;
}

export function installGlobeOneFetchAuth() {
  const globalState = globalThis as typeof globalThis & {
    __simkeeperGlobeOneFetchAuthInstalled?: boolean;
  };
  if (globalState.__simkeeperGlobeOneFetchAuthInstalled) return;
  globalState.__simkeeperGlobeOneFetchAuthInstalled = true;
  originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const fetchImpl = originalFetch;
    if (!fetchImpl) throw new Error("SIMKeeper fetch transport 尚未初始化");
    return globeFetch(fetchImpl, input, init);
  }) as typeof globalThis.fetch;
}
