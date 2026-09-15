import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  chromium,
  type BrowserContext,
  type Page,
  type Request as PlaywrightRequest,
} from "playwright-core";
import { CarrierProviderError } from "@/lib/carrier-connectors/errors";
import {
  parseSmartDashboardCurl,
  parseSmartPrepaidDashboard,
  parseSmartSilentAuthCurl,
} from "@/lib/carrier-connectors/providers/smart";
import type {
  CarrierConnectorProvider,
  CarrierConnectorSimContext,
  NormalizedCarrierSyncResult,
} from "@/lib/carrier-connectors/types";

const SMART_ORIGIN = "https://my.smart.com.ph";
const SMART_SSO_ORIGIN = "https://optimasso.smart.com.ph";
const SMART_SERVICES_PATH = "/smart/services";
const BROWSER_NAVIGATION_TIMEOUT_MS = 45_000;
const API_TOKEN_WAIT_MS = 35_000;
const BROWSER_ACTION_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const SESSION_METADATA_VERSION = 1;

type JsonObject = Record<string, unknown>;

type SmartBootstrap = {
  fingerprint: string;
  requestPath: string;
  dashboardCookieHeader: string;
  ssoCookieHeader: string;
  userAgent: string;
};

type SmartSessionMetadata = {
  version: number;
  bootstrapFingerprint: string;
  requestPath: string;
  establishedAt: string;
  lastSuccessfulSyncAt: string;
};

type BrowserFetchResult = {
  ok: boolean;
  error: string | null;
  status: number;
  url: string;
  contentType: string;
  text: string;
};

type BearerCapture = {
  promise: Promise<string | null>;
  cancel: () => void;
};

function configurationError(message: string, cause?: unknown) {
  return new CarrierProviderError({ type: "configuration", message, cause });
}

function authenticationError(message: string, httpStatus?: number | null) {
  return new CarrierProviderError({ type: "authentication", message, httpStatus });
}

function assertSmartSim(sim: CarrierConnectorSimContext) {
  if (sim.countryCode.toUpperCase() !== "PH") {
    throw configurationError("Smart My Smart 只能同步菲律宾号码");
  }
  if (!sim.carrierName.toLowerCase().includes("smart")) {
    throw configurationError("关联号码的运营商不是 Smart Philippines");
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dataDirectory() {
  return process.env.SIMKEEPER_DATA_DIR?.trim() || "/app/data";
}

function connectorDirectory(connectorId: number) {
  if (!Number.isInteger(connectorId) || connectorId <= 0) {
    throw configurationError("Smart 浏览器连接 ID 无效");
  }
  return path.join(dataDirectory(), "carrier-browser", "smart", String(connectorId));
}

function profileDirectory(connectorId: number) {
  return path.join(connectorDirectory(connectorId), "profile");
}

function metadataPath(connectorId: number) {
  return path.join(connectorDirectory(connectorId), "session.json");
}

function browserRuntimeDirectories() {
  const dataDir = dataDirectory();
  const home = process.env.HOME?.trim() || path.join(dataDir, "runtime-home");
  const cache = process.env.XDG_CACHE_HOME?.trim() || path.join(home, ".cache");
  const config = process.env.XDG_CONFIG_HOME?.trim() || path.join(home, ".config");
  return { home, cache, config };
}

function chromiumLaunchError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  return raw
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\/app\/data\/carrier-browser\/smart\/\d+(?:\/profile)?/g, "<Smart profile>")
    .trim()
    .slice(0, 420);
}

async function chromiumExecutable() {
  const configured = process.env.SIMKEEPER_SMART_CHROMIUM_EXECUTABLE?.trim();
  const legacyConfigured = process.env.SIMKEEPER_VOXI_CHROMIUM_EXECUTABLE?.trim();
  const candidates = [
    configured,
    legacyConfigured,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].filter((item): item is string => Boolean(item));

  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Try the next known Chromium executable.
    }
  }

  throw configurationError(
    "SIMKeeper 没有找到 Chromium。官方 Docker 镜像会内置 Chromium；自定义镜像请设置 SIMKEEPER_SMART_CHROMIUM_EXECUTABLE",
  );
}

async function removeStaleChromiumLocks(profileDir: string) {
  for (const name of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    await rm(path.join(profileDir, name), { force: true, recursive: true }).catch(() => undefined);
  }
}

function parseCookieHeader(raw: string, label: string) {
  const value = raw.trim();
  if (!value) throw configurationError(`${label}没有包含浏览器 Cookie`);
  if (value.length > 64_000 || /[\r\n]/.test(value)) {
    throw configurationError(`${label}中的 Cookie 格式异常`);
  }

  const cookies = new Map<string, string>();
  for (const item of value.split(";")) {
    const pair = item.trim();
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const cookieValue = pair.slice(separator + 1).trim();
    if (!name || !cookieValue || name.length > 256 || cookieValue.length > 16_000) continue;
    if (/[^!#$%&'*+.^_`|~0-9A-Za-z-]/.test(name)) continue;
    cookies.set(name, cookieValue);
  }
  return cookies;
}

function isMySmartSessionCookie(name: string) {
  const lower = name.toLowerCase();
  return lower === ".aspnetcore.identity.application"
    || lower === "uf.session"
    || lower === "c.identifier"
    || lower === "waap_id"
    || lower === "awsalb"
    || lower === "awsalbcors";
}

function isSmartSsoSessionCookie(name: string) {
  const lower = name.toLowerCase();
  return lower === "auth_session_id"
    || lower === "auth_session_id_legacy"
    || lower === "keycloak_session"
    || lower === "keycloak_session_legacy"
    || lower === "keycloak_identity"
    || lower === "keycloak_identity_legacy"
    || lower.startsWith("awsalbapp-");
}

function smartBootstrap(credentials: Record<string, string>): SmartBootstrap {
  const dashboardCurl = stringValue(credentials.requestCurl);
  const silentAuthCurl = stringValue(credentials.silentAuthCurl);

  if (!dashboardCurl || !silentAuthCurl) {
    throw authenticationError(
      "Smart 浏览器会话尚未建立。请在已登录的 My Smart 浏览器中重新复制 prepaidservicedashboard cURL 和 prompt=none 静默认证 cURL，然后保存配置并立即同步",
    );
  }

  const dashboard = parseSmartDashboardCurl(dashboardCurl);
  const silentAuth = parseSmartSilentAuthCurl(silentAuthCurl);
  if (!dashboard.cookieHeader) {
    throw configurationError(
      "余额请求 cURL 没有包含 My Smart 登录 Cookie；请从浏览器 Network 重新使用 Copy as cURL (bash)",
    );
  }

  const fingerprint = createHash("sha256")
    .update(dashboardCurl)
    .update("\n---smart-sso---\n")
    .update(silentAuthCurl)
    .digest("hex");

  return {
    fingerprint,
    requestPath: dashboard.requestPath,
    dashboardCookieHeader: dashboard.cookieHeader,
    ssoCookieHeader: silentAuth.cookieHeader,
    userAgent: dashboard.userAgent || silentAuth.userAgent,
  };
}

async function readSessionMetadata(connectorId: number): Promise<SmartSessionMetadata | null> {
  try {
    const raw = await readFile(metadataPath(connectorId), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const value = parsed as JsonObject;
    if (value.version !== SESSION_METADATA_VERSION) return null;
    if (typeof value.bootstrapFingerprint !== "string" || !/^[0-9a-f]{64}$/.test(value.bootstrapFingerprint)) return null;
    if (typeof value.requestPath !== "string" || !value.requestPath.startsWith("/rest/v1/customeraccounts/")) return null;
    if (typeof value.establishedAt !== "string" || typeof value.lastSuccessfulSyncAt !== "string") return null;
    return {
      version: SESSION_METADATA_VERSION,
      bootstrapFingerprint: value.bootstrapFingerprint,
      requestPath: value.requestPath,
      establishedAt: value.establishedAt,
      lastSuccessfulSyncAt: value.lastSuccessfulSyncAt,
    };
  } catch {
    return null;
  }
}

async function writeSessionMetadata(connectorId: number, metadata: SmartSessionMetadata) {
  const dir = connectorDirectory(connectorId);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const target = metadataPath(connectorId);
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(metadata, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temp, target);
}

async function profileLooksInitialized(connectorId: number) {
  try {
    await access(path.join(profileDirectory(connectorId), "Local State"), fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function resetSmartProfile(connectorId: number) {
  await rm(profileDirectory(connectorId), { recursive: true, force: true }).catch(() => undefined);
}

async function seedBootstrapCookies(context: BrowserContext, bootstrap: SmartBootstrap) {
  const mySmartCookies = parseCookieHeader(bootstrap.dashboardCookieHeader, "余额请求 cURL");
  const ssoCookies = parseCookieHeader(bootstrap.ssoCookieHeader, "静默认证 cURL");

  const cookies = [
    ...Array.from(mySmartCookies.entries())
      .filter(([name]) => isMySmartSessionCookie(name))
      .map(([name, value]) => ({ name, value, url: SMART_ORIGIN })),
    ...Array.from(ssoCookies.entries())
      .filter(([name]) => isSmartSsoSessionCookie(name))
      .map(([name, value]) => ({ name, value, url: SMART_SSO_ORIGIN })),
  ];

  const hasMySmartIdentity = cookies.some((cookie) => (
    cookie.url === SMART_ORIGIN
    && [".aspnetcore.identity.application", "uf.session"].includes(cookie.name.toLowerCase())
  ));
  const hasSsoIdentity = cookies.some((cookie) => (
    cookie.url === SMART_SSO_ORIGIN
    && cookie.name.toLowerCase().startsWith("keycloak_")
  ));

  if (!hasMySmartIdentity || !hasSsoIdentity) {
    throw configurationError(
      "两条 cURL 没有包含完整的 My Smart / Keycloak 登录会话；请确认它们来自同一次已成功登录的浏览器会话",
    );
  }

  await context.clearCookies();
  await context.addCookies(cookies);
}

async function withSmartBrowser<T>(
  connectorId: number,
  userAgent: string,
  operation: (context: BrowserContext, page: Page) => Promise<T>,
) {
  const executablePath = await chromiumExecutable();
  const baseDir = connectorDirectory(connectorId);
  const profileDir = profileDirectory(connectorId);
  const runtime = browserRuntimeDirectories();

  try {
    await Promise.all([
      mkdir(baseDir, { recursive: true, mode: 0o700 }),
      mkdir(profileDir, { recursive: true, mode: 0o700 }),
      mkdir(runtime.home, { recursive: true, mode: 0o700 }),
      mkdir(runtime.cache, { recursive: true, mode: 0o700 }),
      mkdir(runtime.config, { recursive: true, mode: 0o700 }),
    ]);
    await access(profileDir, fsConstants.W_OK | fsConstants.X_OK);
    await access(runtime.home, fsConstants.W_OK | fsConstants.X_OK);
  } catch (error) {
    throw configurationError(
      `Smart Chromium 运行目录不可写：${chromiumLaunchError(error) || "请检查 /app/data 的 PUID/PGID 和挂载权限"}`,
      error,
    );
  }

  await removeStaleChromiumLocks(profileDir);

  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      executablePath,
      headless: true,
      chromiumSandbox: false,
      locale: "en-PH",
      timezoneId: "Asia/Manila",
      userAgent,
      viewport: { width: 1365, height: 900 },
      env: {
        ...process.env,
        HOME: runtime.home,
        XDG_CACHE_HOME: runtime.cache,
        XDG_CONFIG_HOME: runtime.config,
        TMPDIR: process.env.TMPDIR?.trim() || "/tmp",
      },
      args: [
        "--disable-dev-shm-usage",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--no-first-run",
        "--no-default-browser-check",
      ],
    });
  } catch (error) {
    const reason = chromiumLaunchError(error);
    throw configurationError(
      `SIMKeeper 无法启动 Smart Chromium 浏览器运行时${reason ? `：${reason}` : ""}`,
      error,
    );
  }

  try {
    const page = context.pages()[0] ?? await context.newPage();
    page.setDefaultTimeout(BROWSER_ACTION_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(BROWSER_NAVIGATION_TIMEOUT_MS);
    return await operation(context, page);
  } finally {
    await context.close().catch(() => undefined);
  }
}

function isSmartLoginLocation(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (url.origin === SMART_ORIGIN) {
      return url.pathname.startsWith("/usso/")
        || /\/account\/login(?:[/?#]|$)/i.test(url.pathname);
    }
    if (url.origin === SMART_SSO_ORIGIN) {
      return url.pathname.includes("/protocol/openid-connect/auth")
        || url.pathname.includes("/login-actions/")
        || url.pathname.includes("/broker/");
    }
    return true;
  } catch {
    return true;
  }
}

async function pageLooksLikeInteractiveLogin(page: Page) {
  const current = page.url();
  if (isSmartLoginLocation(current)) return true;
  const body = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => "");
  const value = body.slice(0, 10_000).toLowerCase();
  return (value.includes("recaptcha") || value.includes("verify you are human"))
    && (value.includes("password") || value.includes("sign in") || value.includes("login"));
}

function createBearerCapture(page: Page): BearerCapture {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let resolvePromise: (value: string | null) => void = () => undefined;

  const finish = (value: string | null) => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    page.off("request", onRequest);
    resolvePromise(value);
  };

  const onRequest = (request: PlaywrightRequest) => {
    try {
      const url = new URL(request.url());
      if (
        url.origin !== SMART_ORIGIN
        || request.method() !== "GET"
        || !url.pathname.startsWith("/rest/v1/customeraccounts")
      ) return;
    } catch {
      return;
    }

    void request.allHeaders()
      .then((headers) => {
        const authorization = headers.authorization?.trim() ?? "";
        const match = authorization.match(/^bearer\s+([^\s]+)$/i);
        if (match?.[1]) finish(match[1]);
      })
      .catch(() => undefined);
  };

  const promise = new Promise<string | null>((resolve) => {
    resolvePromise = resolve;
    page.on("request", onRequest);
    timer = setTimeout(() => finish(null), API_TOKEN_WAIT_MS);
  });

  return {
    promise,
    cancel: () => finish(null),
  };
}

async function navigateToSmartServices(page: Page) {
  try {
    await page.goto(`${SMART_ORIGIN}${SMART_SERVICES_PATH}`, {
      waitUntil: "domcontentloaded",
      timeout: BROWSER_NAVIGATION_TIMEOUT_MS,
    });
  } catch (error) {
    const current = page.url();
    if (!current.startsWith(SMART_ORIGIN) && !current.startsWith(SMART_SSO_ORIGIN)) {
      throw new CarrierProviderError({
        type: "temporary",
        message: `Smart Chromium 无法打开 My Smart 官方站点：${chromiumLaunchError(error) || "请检查 SIMKeeper 服务器网络"}`,
        cause: error,
      });
    }
  }

  if (await pageLooksLikeInteractiveLogin(page)) {
    throw authenticationError(
      "My Smart 浏览器会话已经失效。请在电脑浏览器重新登录 My Smart，然后更新两项“重新认证 cURL”并点击保存配置并立即同步",
    );
  }
}

async function freshSmartBearer(page: Page) {
  const capture = createBearerCapture(page);
  try {
    await navigateToSmartServices(page);
    const token = await capture.promise;
    if (token) return token;
  } finally {
    capture.cancel();
  }

  if (await pageLooksLikeInteractiveLogin(page)) {
    throw authenticationError(
      "My Smart 浏览器会话已经失效。请在电脑浏览器重新登录 My Smart，然后更新两项“重新认证 cURL”并重新同步",
    );
  }

  const retryCapture = createBearerCapture(page);
  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout: BROWSER_NAVIGATION_TIMEOUT_MS }).catch(() => undefined);
    const token = await retryCapture.promise;
    if (token) return token;
  } finally {
    retryCapture.cancel();
  }

  if (await pageLooksLikeInteractiveLogin(page)) {
    throw authenticationError(
      "My Smart 浏览器会话已经失效，需要重新认证",
    );
  }

  throw new CarrierProviderError({
    type: "temporary",
    message: "My Smart 页面已打开，但没有观察到官方 customeraccounts API 的 Bearer Token；可能是官网加载异常，请稍后重试",
  });
}

async function browserDashboardRequest(page: Page, requestPath: string, bearer: string): Promise<BrowserFetchResult> {
  if (!/^\/rest\/v1\/customeraccounts\/\d+\/customerfacingservices\/[^/]+\/prepaidservicedashboard$/i.test(requestPath)) {
    throw configurationError("Smart 余额请求路径格式异常，请重新导入 prepaidservicedashboard cURL");
  }

  try {
    return await page.evaluate(async (input) => {
      try {
        const response = await fetch(input.requestPath, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          redirect: "follow",
          headers: {
            accept: "*/*",
            apiname: "retrieveprepaidinformation",
            authorization: `Bearer ${input.bearer}`,
            "cache-control": "no-cache",
            clientinfo: input.clientInfo,
            pragma: "no-cache",
            transactionid: input.transactionId,
          },
        });
        return {
          ok: true,
          error: null,
          status: response.status,
          url: response.url,
          contentType: response.headers.get("content-type") ?? "",
          text: await response.text(),
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "browser fetch failed",
          status: 0,
          url: "",
          contentType: "",
          text: "",
        };
      }
    }, {
      requestPath,
      bearer,
      clientInfo: randomUUID(),
      transactionId: randomUUID(),
    }) as BrowserFetchResult;
  } catch (error) {
    throw new CarrierProviderError({
      type: "temporary",
      message: "Smart Chromium 执行 prepaidservicedashboard 请求失败",
      cause: error,
    });
  }
}

async function parseDashboardBrowserResponse(response: BrowserFetchResult): Promise<NormalizedCarrierSyncResult> {
  if (!response.ok) {
    throw new CarrierProviderError({
      type: "temporary",
      message: `Smart Chromium 余额请求未完成：${response.error || "浏览器网络错误"}`,
    });
  }
  if (response.status === 401 || response.status === 403 || isSmartLoginLocation(response.url)) {
    throw authenticationError(
      "My Smart 官方 API 拒绝了当前浏览器会话，需要重新认证",
      response.status || null,
    );
  }
  if (response.status === 429) {
    throw new CarrierProviderError({
      type: "rate_limit",
      httpStatus: response.status,
      message: "My Smart 请求过于频繁，请稍后重试",
    });
  }
  if (response.status >= 500) {
    throw new CarrierProviderError({
      type: "temporary",
      httpStatus: response.status,
      message: `My Smart 暂时不可用（HTTP ${response.status}）`,
    });
  }
  if (response.status >= 400) {
    throw new CarrierProviderError({
      type: "unsupported",
      httpStatus: response.status,
      message: `My Smart prepaidservicedashboard 请求失败（HTTP ${response.status}），接口可能已经变化`,
    });
  }
  if (Buffer.byteLength(response.text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new CarrierProviderError({
      type: "unsupported",
      message: "My Smart 响应过大，已停止解析",
    });
  }
  const contentType = response.contentType.toLowerCase();
  if (contentType.includes("text/html") || /^\s*</.test(response.text)) {
    throw authenticationError(
      "My Smart 返回了登录网页而不是余额 JSON，浏览器会话需要重新认证",
    );
  }

  let payload: unknown;
  try {
    payload = response.text.trim() ? JSON.parse(response.text) as unknown : {};
  } catch (error) {
    throw new CarrierProviderError({
      type: "unsupported",
      message: "My Smart 返回了无法解析的 JSON，接口结构可能已经变化",
      cause: error,
    });
  }
  return parseSmartPrepaidDashboard(payload);
}

async function syncSmartBrowser(
  connectorId: number,
  credentials: Record<string, string>,
) {
  const bootstrap = smartBootstrap(credentials);
  const metadata = await readSessionMetadata(connectorId);
  const initialized = await profileLooksInitialized(connectorId);
  const bootstrapChanged = !metadata
    || metadata.bootstrapFingerprint !== bootstrap.fingerprint
    || metadata.requestPath !== bootstrap.requestPath;
  const shouldBootstrap = bootstrapChanged || !initialized;

  if (shouldBootstrap) {
    await resetSmartProfile(connectorId);
  }

  const result = await withSmartBrowser(
    connectorId,
    bootstrap.userAgent,
    async (context, page) => {
      if (shouldBootstrap) {
        await seedBootstrapCookies(context, bootstrap);
      }
      const bearer = await freshSmartBearer(page);
      const response = await browserDashboardRequest(page, bootstrap.requestPath, bearer);
      return parseDashboardBrowserResponse(response);
    },
  );

  const now = new Date().toISOString();
  await writeSessionMetadata(connectorId, {
    version: SESSION_METADATA_VERSION,
    bootstrapFingerprint: bootstrap.fingerprint,
    requestPath: bootstrap.requestPath,
    establishedAt: shouldBootstrap ? now : metadata?.establishedAt ?? now,
    lastSuccessfulSyncAt: now,
  });
  return result;
}

async function deleteSmartBrowserState(connectorId: number) {
  await rm(connectorDirectory(connectorId), { recursive: true, force: true }).catch(() => undefined);
}

export const smartBrowserCarrierConnectorProvider: CarrierConnectorProvider = {
  id: "smart",
  label: "Smart My Smart",
  description: "使用 SIMKeeper 服务器内置的持久化 Chromium Profile 保存 My Smart / Keycloak 浏览器登录状态。两条 cURL 只用于首次建立或重新认证会话；日常定时同步由官方网页自行完成 USSO / OIDC 认证，再读取 prepaidservicedashboard 的官方 JSON 余额、余额有效期和账户状态。",
  minLinkedSims: 1,
  maxLinkedSims: 1,
  configFields: [],
  credentialFields: [
    {
      key: "requestCurl",
      label: "重新认证：余额请求 cURL",
      required: true,
      placeholder: "My Smart → Network → prepaidservicedashboard → Copy as cURL (bash)",
      description: "仅用于首次/重新认证时确定这张号码对应的官方余额路径并注入 My Smart 浏览器会话。成功建立 Chromium Profile 后，定时同步不会继续重放这里的旧 Bearer Token。",
    },
    {
      key: "silentAuthCurl",
      label: "重新认证：SSO cURL",
      required: true,
      placeholder: "Network → protocol/openid-connect/auth?…prompt=none → Copy as cURL (bash)",
      description: "仅用于首次/重新认证时把当前 Keycloak SSO 登录状态导入服务器 Chromium。之后由持久化浏览器 Profile 接收和保存官网后续 Cookie/Storage 更新；不保存 My Smart 密码，也不绕过 reCAPTCHA。",
    },
  ],
  async disconnect({ connectorId }) {
    await deleteSmartBrowserState(connectorId);
  },
  async sync({ connectorId, credentials, sim }) {
    assertSmartSim(sim);
    try {
      return await syncSmartBrowser(connectorId, credentials);
    } catch (error) {
      if (error instanceof CarrierProviderError && error.type === "authentication") {
        throw new CarrierProviderError({
          type: "authentication",
          httpStatus: error.httpStatus,
          message: `${error.message}。正常情况下不需要每天复制 cURL；只有完整 My Smart 浏览器登录会话真正失效时才需要更新一次`,
          cause: error,
        });
      }
      throw error;
    }
  },
};
