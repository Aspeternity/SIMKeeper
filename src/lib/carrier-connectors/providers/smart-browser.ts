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
const BROWSER_ACTION_TIMEOUT_MS = 20_000;
const API_CAPTURE_TIMEOUT_MS = 8_000;
const POST_LOGIN_TIMEOUT_MS = 45_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const SESSION_METADATA_VERSION = 2;
const DEFAULT_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

type JsonObject = Record<string, unknown>;

type SmartLoginCredentials = {
  username: string;
  password: string;
};

type SmartLegacyBootstrap = {
  fingerprint: string;
  requestPath: string;
  dashboardCookieHeader: string;
  ssoCookieHeader: string;
  userAgent: string;
};

type SmartSessionMetadata = {
  version: number;
  loginIdentityHash: string | null;
  bootstrapFingerprint: string | null;
  requestPath: string | null;
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

type SmartApiObservation = {
  bearer: string | null;
  dashboardPaths: string[];
};

type ApiCapture = {
  promise: Promise<SmartApiObservation>;
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

function normalizeUsername(value: unknown) {
  const username = stringValue(value);
  if (!username) return null;
  if (username.length > 254 || /[\r\n]/.test(username)) {
    throw configurationError("My Smart 登录账号格式不正确");
  }
  return username;
}

function normalizePassword(value: unknown) {
  const password = typeof value === "string" ? value : "";
  if (!password) return null;
  if (password.length > 512 || /[\r\n]/.test(password)) {
    throw configurationError("My Smart 密码格式不正确");
  }
  return password;
}

function loginCredentials(credentials: Record<string, string>): SmartLoginCredentials | null {
  const username = normalizeUsername(credentials.username);
  const password = normalizePassword(credentials.password);
  if (!username && !password) return null;
  if (!username || !password) {
    throw configurationError("更新 My Smart 登录凭据时，请同时填写登录账号和密码");
  }
  return { username, password };
}

function identityHash(username: string | null | undefined) {
  if (!username) return null;
  return createHash("sha256").update(username.trim().toLowerCase()).digest("hex");
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

function legacyBootstrap(credentials: Record<string, string>): SmartLegacyBootstrap | null {
  const dashboardCurl = stringValue(credentials.requestCurl);
  const silentAuthCurl = stringValue(credentials.silentAuthCurl);
  if (!dashboardCurl && !silentAuthCurl) return null;
  if (!dashboardCurl || !silentAuthCurl) {
    throw configurationError("高级会话导入需要同时提供余额请求 cURL 和 SSO cURL");
  }

  const dashboard = parseSmartDashboardCurl(dashboardCurl);
  const silentAuth = parseSmartSilentAuthCurl(silentAuthCurl);
  if (!dashboard.cookieHeader) {
    throw configurationError(
      "余额请求 cURL 没有包含 My Smart 登录 Cookie；请从浏览器 Network 重新使用 Copy as cURL (bash)",
    );
  }

  return {
    fingerprint: createHash("sha256")
      .update(dashboardCurl)
      .update("\n---smart-sso---\n")
      .update(silentAuthCurl)
      .digest("hex"),
    requestPath: dashboard.requestPath,
    dashboardCookieHeader: dashboard.cookieHeader,
    ssoCookieHeader: silentAuth.cookieHeader,
    userAgent: dashboard.userAgent || silentAuth.userAgent || DEFAULT_BROWSER_USER_AGENT,
  };
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validDashboardPath(value: string | null) {
  return Boolean(
    value
    && /^\/rest\/v1\/customeraccounts\/\d+\/customerfacingservices\/[^/]+\/prepaidservicedashboard$/i.test(value),
  );
}

async function readSessionMetadata(connectorId: number): Promise<SmartSessionMetadata | null> {
  try {
    const raw = await readFile(metadataPath(connectorId), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const value = parsed as JsonObject;
    const version = typeof value.version === "number" ? value.version : 1;
    const requestPath = nullableString(value.requestPath);
    if (requestPath && !validDashboardPath(requestPath)) return null;
    const establishedAt = nullableString(value.establishedAt);
    const lastSuccessfulSyncAt = nullableString(value.lastSuccessfulSyncAt);
    if (!establishedAt || !lastSuccessfulSyncAt) return null;

    if (version === 1) {
      return {
        version: 1,
        loginIdentityHash: null,
        bootstrapFingerprint: nullableString(value.bootstrapFingerprint),
        requestPath,
        establishedAt,
        lastSuccessfulSyncAt,
      };
    }
    if (version !== SESSION_METADATA_VERSION) return null;
    return {
      version,
      loginIdentityHash: nullableString(value.loginIdentityHash),
      bootstrapFingerprint: nullableString(value.bootstrapFingerprint),
      requestPath,
      establishedAt,
      lastSuccessfulSyncAt,
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

async function seedBootstrapCookies(context: BrowserContext, bootstrap: SmartLegacyBootstrap) {
  const mySmartCookies = parseCookieHeader(bootstrap.dashboardCookieHeader, "余额请求 cURL");
  const ssoCookies = parseCookieHeader(bootstrap.ssoCookieHeader, "SSO cURL");

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
      "高级会话导入没有包含完整的 My Smart / Keycloak 登录状态；请确认两条 cURL 来自同一次已成功登录的浏览器会话",
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
      userAgent: userAgent || DEFAULT_BROWSER_USER_AGENT,
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
        "--disable-features=PasswordManagerOnboarding,PasswordLeakDetection",
      ],
    });
  } catch (error) {
    throw configurationError(
      `SIMKeeper 无法启动 Smart Chromium 浏览器运行时${chromiumLaunchError(error) ? `：${chromiumLaunchError(error)}` : ""}`,
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

function isSmartAppLocation(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return url.origin === SMART_ORIGIN && url.pathname.startsWith("/smart/");
  } catch {
    return false;
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

async function pageHasCredentialForm(page: Page) {
  const username = page.locator('input[name="Username"], input[name="username"]').first();
  const password = page.locator('input[name="Password"], input[name="password"], input[type="password"]').first();
  return (await username.isVisible().catch(() => false)) && (await password.isVisible().catch(() => false));
}

async function pageLooksLikeInteractiveLogin(page: Page) {
  if (await pageHasCredentialForm(page)) return true;
  const current = page.url();
  if (isSmartLoginLocation(current) && !isSmartAppLocation(current)) return true;
  const body = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => "");
  const value = body.slice(0, 10_000).toLowerCase();
  return (value.includes("recaptcha") || value.includes("verify you are human"))
    && (value.includes("password") || value.includes("sign in") || value.includes("login"));
}

async function visibleRecaptchaChallenge(page: Page) {
  const body = (await page.locator("body").innerText({ timeout: 1_500 }).catch(() => "")).toLowerCase();
  if (/verify you are human|select all images|recaptcha challenge|security check/.test(body)) return true;
  const challengeFrames = page.locator(
    'iframe[title*="recaptcha" i], iframe[src*="/recaptcha/api2/anchor"], iframe[src*="/recaptcha/enterprise/anchor"], iframe[src*="/recaptcha/api2/bframe"], iframe[src*="/recaptcha/enterprise/bframe"]',
  );
  const count = await challengeFrames.count().catch(() => 0);
  for (let index = 0; index < count; index += 1) {
    if (await challengeFrames.nth(index).isVisible().catch(() => false)) return true;
  }
  return false;
}

async function openSmartServices(page: Page) {
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
}

async function loginOnOfficialPage(page: Page, login: SmartLoginCredentials) {
  const usernameInput = page.locator('input[name="Username"], input[name="username"]').first();
  const passwordInput = page.locator('input[name="Password"], input[name="password"], input[type="password"]').first();

  try {
    await usernameInput.waitFor({ state: "visible", timeout: 12_000 });
    await passwordInput.waitFor({ state: "visible", timeout: 12_000 });
  } catch (error) {
    throw new CarrierProviderError({
      type: "unsupported",
      message: "My Smart 已进入登录流程，但没有找到官方账号/密码输入框；登录页面结构可能已经变化",
      cause: error,
    });
  }

  await usernameInput.fill(login.username);
  await passwordInput.fill(login.password);

  if (await visibleRecaptchaChallenge(page)) {
    throw authenticationError(
      "My Smart 要求人工 reCAPTCHA / 安全验证，请使用页面上的“进行人工认证”完成验证",
    );
  }

  const submit = page.locator(
    'form[action*="/usso/Account/Login" i] button[type="submit"], button[type="submit"], input[type="submit"]',
  ).first();
  if (!await submit.isVisible().catch(() => false)) {
    throw new CarrierProviderError({
      type: "unsupported",
      message: "My Smart 登录页没有找到官方登录按钮；页面结构可能已经变化",
    });
  }

  await submit.click();
  const deadline = Date.now() + POST_LOGIN_TIMEOUT_MS;
  let credentialFormSeenAt = 0;
  while (Date.now() < deadline) {
    if (isSmartAppLocation(page.url()) && !await pageHasCredentialForm(page)) return;

    if (await pageHasCredentialForm(page)) {
      if (!credentialFormSeenAt) credentialFormSeenAt = Date.now();
      if (await visibleRecaptchaChallenge(page)) {
        throw authenticationError(
          "My Smart 要求人工 reCAPTCHA / 安全验证，请使用页面上的“进行人工认证”完成验证",
        );
      }
      if (Date.now() - credentialFormSeenAt > 8_000) {
        const body = await page.locator("body").innerText({ timeout: 1_500 }).catch(() => "");
        if (/invalid|incorrect|wrong password|username.*password|account.*not found|登录失败|密码.*错误/i.test(body)) {
          throw authenticationError("My Smart 登录账号或密码被拒绝，请检查后重试");
        }
        throw authenticationError(
          "My Smart 未完成登录；如果官网要求人机验证，请使用页面上的“进行人工认证”完成验证",
        );
      }
    } else {
      credentialFormSeenAt = 0;
    }
    await page.waitForTimeout(500);
  }

  if (await visibleRecaptchaChallenge(page)) {
    throw authenticationError(
      "My Smart 登录等待人工 reCAPTCHA / 安全验证超时，请使用页面上的“进行人工认证”完成验证",
    );
  }
  throw new CarrierProviderError({
    type: "temporary",
    message: "My Smart 登录跳转超时，请稍后重试",
  });
}

async function ensureSmartSession(page: Page, login: SmartLoginCredentials | null) {
  await openSmartServices(page);

  if (isSmartAppLocation(page.url()) && !await pageHasCredentialForm(page)) {
    await page.waitForTimeout(1_200);
  }
  if (isSmartAppLocation(page.url()) && !await pageHasCredentialForm(page)) return;

  if (!await pageLooksLikeInteractiveLogin(page)) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (isSmartAppLocation(page.url()) && !await pageHasCredentialForm(page)) return;
      if (await pageHasCredentialForm(page)) break;
      await page.waitForTimeout(350);
    }
  }

  if (!await pageHasCredentialForm(page)) {
    throw authenticationError(
      "My Smart 浏览器会话已经失效，但官方登录页没有进入可自动填写账号密码的状态",
    );
  }
  if (!login) {
    throw authenticationError(
      "My Smart 浏览器会话已经失效。请保存 My Smart 登录账号和密码，或在高级认证选项中重新导入已登录浏览器会话",
    );
  }
  await loginOnOfficialPage(page, login);
}

function dashboardPathFromUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (url.origin !== SMART_ORIGIN) return null;
    if (!/^\/rest\/v1\/customeraccounts\/\d+\/customerfacingservices\/[^/]+\/prepaidservicedashboard$/i.test(url.pathname)) {
      return null;
    }
    return url.pathname;
  } catch {
    return null;
  }
}

function createApiCapture(page: Page, knownRequestPath: string | null): ApiCapture {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let resolvePromise: (value: SmartApiObservation) => void = () => undefined;
  let bearer: string | null = null;
  const dashboardPaths = new Set<string>();

  const finish = () => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    if (settleTimer) clearTimeout(settleTimer);
    page.off("request", onRequest);
    resolvePromise({ bearer, dashboardPaths: Array.from(dashboardPaths) });
  };

  const onRequest = (request: PlaywrightRequest) => {
    let url: URL;
    try {
      url = new URL(request.url());
      if (
        url.origin !== SMART_ORIGIN
        || request.method() !== "GET"
        || !url.pathname.startsWith("/rest/v1/customeraccounts")
      ) return;
    } catch {
      return;
    }

    const dashboardPath = dashboardPathFromUrl(url.toString());
    if (dashboardPath) dashboardPaths.add(dashboardPath);

    void request.allHeaders()
      .then((headers) => {
        const authorization = headers.authorization?.trim() ?? "";
        const match = authorization.match(/^bearer\s+([^\s]+)$/i);
        if (match?.[1]) bearer = match[1];
        if (!bearer) return;

        if (knownRequestPath) {
          finish();
          return;
        }
        if (dashboardPaths.size > 0 && !settleTimer) {
          settleTimer = setTimeout(finish, 1_000);
        }
      })
      .catch(() => undefined);
  };

  const promise = new Promise<SmartApiObservation>((resolve) => {
    resolvePromise = resolve;
    page.on("request", onRequest);
    timer = setTimeout(finish, API_CAPTURE_TIMEOUT_MS);
  });

  return { promise, cancel: finish };
}

async function acquireSmartApiContext(
  page: Page,
  login: SmartLoginCredentials | null,
  knownRequestPath: string | null,
) {
  const attempt = async (reload: boolean) => {
    const capture = createApiCapture(page, knownRequestPath);
    try {
      if (reload) {
        await page.reload({ waitUntil: "domcontentloaded", timeout: BROWSER_NAVIGATION_TIMEOUT_MS }).catch(() => undefined);
        if (await pageHasCredentialForm(page)) await ensureSmartSession(page, login);
      } else {
        await ensureSmartSession(page, login);
      }
      return await capture.promise;
    } finally {
      capture.cancel();
    }
  };

  let observation = await attempt(false);
  if (!observation.bearer) observation = await attempt(true);
  if (!observation.bearer) {
    if (await pageLooksLikeInteractiveLogin(page)) {
      throw authenticationError("My Smart 浏览器登录状态没有建立成功，需要重新认证");
    }
    throw new CarrierProviderError({
      type: "temporary",
      message: "My Smart 页面已打开，但没有观察到官方 customeraccounts API 的 Bearer Token；可能是官网加载异常，请稍后重试",
    });
  }
  return observation;
}

function chooseRequestPath(knownRequestPath: string | null, observation: SmartApiObservation) {
  if (knownRequestPath && validDashboardPath(knownRequestPath)) return knownRequestPath;
  const paths = Array.from(new Set(observation.dashboardPaths));
  if (paths.length === 1) return paths[0];
  if (paths.length > 1) {
    throw configurationError(
      "当前 My Smart 账号同时加载了多个预付费服务，SIMKeeper 无法安全判断目标号码。请在高级认证选项中导入这张号码的 prepaidservicedashboard cURL 一次以锁定服务",
    );
  }
  throw configurationError(
    "My Smart 登录成功，但没有自动发现 prepaidservicedashboard 服务路径。请在高级认证选项中导入目标号码的余额请求 cURL 一次",
  );
}

async function browserDashboardRequest(page: Page, requestPath: string, bearer: string): Promise<BrowserFetchResult> {
  if (!validDashboardPath(requestPath)) {
    throw configurationError("Smart 余额请求路径格式异常，请重新认证或导入目标号码的 prepaidservicedashboard cURL");
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
    throw authenticationError("My Smart 官方 API 拒绝了当前浏览器会话，需要重新认证", response.status || null);
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
    throw authenticationError("My Smart 返回了登录网页而不是余额 JSON，浏览器会话需要重新认证");
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

function isManualChallengeError(error: unknown) {
  return error instanceof CarrierProviderError
    && error.type === "authentication"
    && /reCAPTCHA|人机验证|安全验证/i.test(error.message);
}

async function syncSmartBrowser(
  connectorId: number,
  credentials: Record<string, string>,
) {
  const login = loginCredentials(credentials);
  const bootstrap = legacyBootstrap(credentials);
  if (!login && !bootstrap) {
    throw authenticationError(
      "尚未保存 My Smart 登录账号和密码。请填写账号/密码；若官网要求人工验证，可改用高级认证选项导入已登录浏览器会话",
    );
  }

  const metadata = await readSessionMetadata(connectorId);
  const wasInitialized = await profileLooksInitialized(connectorId);
  const currentIdentityHash = identityHash(login?.username);
  const identityChanged = Boolean(
    login
    && metadata?.loginIdentityHash
    && currentIdentityHash !== metadata.loginIdentityHash,
  );
  const bootstrapChanged = Boolean(
    bootstrap
    && metadata?.bootstrapFingerprint
    && bootstrap.fingerprint !== metadata.bootstrapFingerprint,
  );
  const shouldReset = identityChanged || (!login && bootstrapChanged);
  if (shouldReset) await resetSmartProfile(connectorId);

  const initialized = shouldReset ? false : wasInitialized;
  const knownRequestPath = bootstrap?.requestPath ?? metadata?.requestPath ?? null;
  const shouldSeedLegacy = Boolean(
    bootstrap
    && !login
    && (!initialized || !metadata || bootstrap.fingerprint !== metadata.bootstrapFingerprint),
  );
  const userAgent = bootstrap?.userAgent || DEFAULT_BROWSER_USER_AGENT;

  const syncWithinBrowser = async (context: BrowserContext, page: Page, seedLegacy: boolean) => {
    if (seedLegacy && bootstrap) await seedBootstrapCookies(context, bootstrap);
    const observation = await acquireSmartApiContext(page, login, knownRequestPath);
    const requestPath = chooseRequestPath(knownRequestPath, observation);
    const response = await browserDashboardRequest(page, requestPath, observation.bearer as string);
    const result = await parseDashboardBrowserResponse(response);
    return { result, requestPath };
  };

  const synced = await withSmartBrowser(connectorId, userAgent, async (context, page) => {
    try {
      return await syncWithinBrowser(context, page, shouldSeedLegacy);
    } catch (error) {
      if (!login || !bootstrap || !isManualChallengeError(error)) throw error;

      await context.clearCookies();
      await seedBootstrapCookies(context, bootstrap);
      await page.goto("about:blank").catch(() => undefined);
      return syncWithinBrowser(context, page, false);
    }
  });

  const now = new Date().toISOString();
  await writeSessionMetadata(connectorId, {
    version: SESSION_METADATA_VERSION,
    loginIdentityHash: currentIdentityHash ?? metadata?.loginIdentityHash ?? null,
    bootstrapFingerprint: bootstrap?.fingerprint ?? metadata?.bootstrapFingerprint ?? null,
    requestPath: synced.requestPath,
    establishedAt: shouldReset || !initialized ? now : metadata?.establishedAt ?? now,
    lastSuccessfulSyncAt: now,
  });
  return synced.result;
}

async function deleteSmartBrowserState(connectorId: number) {
  await rm(connectorDirectory(connectorId), { recursive: true, force: true }).catch(() => undefined);
}

export const smartBrowserCarrierConnectorProvider: CarrierConnectorProvider = {
  id: "smart",
  label: "Smart My Smart",
  description: "使用 SIMKeeper 服务器内置的持久化 Chromium 打开 My Smart 官方登录页。账号和密码由 SIMKeeper 加密保存，仅自动填写到官方页面；reCAPTCHA 由 Smart 官方脚本正常执行。登录成功后复用浏览器 Profile，并从 prepaidservicedashboard 官方 JSON 读取余额、余额有效期和账户状态。",
  minLinkedSims: 1,
  maxLinkedSims: 1,
  configFields: [],
  credentialFields: [
    {
      key: "username",
      label: "My Smart 登录账号",
      required: true,
      placeholder: "My Smart 邮箱或手机号",
      description: "与密码一起使用 SIMKeeper 凭据加密保存；只会在服务器 Chromium 中自动填写到 My Smart 官方登录页。",
    },
    {
      key: "password",
      label: "My Smart 密码",
      required: true,
      placeholder: "输入 My Smart 密码",
      description: "使用 SIMKeeper 凭据加密保存，不写入代码或日志；仅提交给 My Smart 官方登录页。",
    },
    {
      key: "requestCurl",
      label: "高级认证：余额请求 cURL",
      required: false,
      placeholder: "prepaidservicedashboard → Copy as cURL (bash)",
      description: "通常留空。仅当 Smart 要求人工 reCAPTCHA / 风控验证，或账号下有多个预付费服务无法自动锁定目标号码时，用于导入已登录浏览器会话并锁定这张号码的余额接口。",
    },
    {
      key: "silentAuthCurl",
      label: "高级认证：SSO cURL",
      required: false,
      placeholder: "protocol/openid-connect/auth?…prompt=none → Copy as cURL (bash)",
      description: "通常留空。与上面的余额请求 cURL 成对使用，只作为人工验证后的会话导入兜底；SIMKeeper 不绕过 reCAPTCHA。",
    },
  ],
  async disconnect({ connectorId }) {
    await deleteSmartBrowserState(connectorId);
  },
  async sync({ connectorId, credentials, sim }) {
    assertSmartSim(sim);
    return syncSmartBrowser(connectorId, credentials);
  },
};
