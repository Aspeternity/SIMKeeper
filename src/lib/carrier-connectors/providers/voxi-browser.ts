import "server-only";

import { constants as fsConstants } from "node:fs";
import { access, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { CarrierProviderError } from "@/lib/carrier-connectors/errors";
import type {
  CarrierConnectorProvider,
  CarrierConnectorSimContext,
  ConnectorAccountStatus,
  NormalizedCarrierSyncResult,
} from "@/lib/carrier-connectors/types";
import {
  clearVoxiAuthenticatedSession,
  clearVoxiOneTimeAuthConfig,
  clearVoxiPendingAuth,
  deleteVoxiSession,
  pendingVoxiAuthMatchesUsername,
  readVoxiAuthenticatedSession,
  readVoxiPendingAuth,
  saveVoxiAuthenticatedSession,
  saveVoxiPendingAuth,
  type VoxiCookieJar,
} from "@/lib/carrier-connectors/providers/voxi-native-session";

const VOXI_ORIGIN = "https://www.voxi.co.uk";
const VOXI_SIGN_IN_PATH = "/sign-in?redirectPath=%2Faccount";
const VOXI_ACCOUNT_PATH = "/account";
const BROWSER_NAVIGATION_TIMEOUT_MS = 45_000;
const BROWSER_ACTION_TIMEOUT_MS = 20_000;
const CLOUDFLARE_WAIT_MS = 20_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const VOXI_OTP_PASSWORD_PLACEHOLDER = Buffer.from("undefined", "utf8").toString("base64");

type VoxiAccount = {
  id?: unknown;
  idHash?: unknown;
  status?: unknown;
};

type VoxiAccountsResponse = {
  accountDetails?: unknown;
};

type VoxiSubscription = {
  subscriptionId?: unknown;
  subscriptionIdHash?: unknown;
  phoneNumber?: unknown;
  status?: unknown;
  type?: unknown;
  paymentType?: unknown;
};

type VoxiSubscriptionsResponse = {
  subscriptionDetails?: unknown;
};

type VoxiSubscriptionResponse = {
  simBalance?: unknown;
};

type SelectedVoxiSubscription = {
  accountId: string;
  accountIdHash: string;
  subscriptionId: string;
  subscriptionIdHash: string;
  msisdn: string;
  status: string | null;
};

type BrowserFetchResult = {
  ok: boolean;
  error: string | null;
  status: number;
  url: string;
  contentType: string;
  cfMitigated: string | null;
  cfRay: string | null;
  text: string;
};

type BrowserRequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  allowNoContent?: boolean;
};

type VoxiBrowserData = {
  balance: number;
  accountStatus: ConnectorAccountStatus;
  cookies: VoxiCookieJar;
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
  if (digits.startsWith("0044")) digits = digits.slice(2);
  if (/^07\d{9}$/.test(digits)) return `44${digits.slice(1)}`;
  if (/^447\d{9}$/.test(digits)) return digits;
  throw new CarrierProviderError({
    type: "configuration",
    message: "关联 SIM 缺少有效的英国 VOXI 手机号；请填写 07xxxxxxxxx 或 +44 7xxxxxxxxx",
  });
}

function comparableVoxiNumber(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  let digits = String(value).replace(/\D/g, "");
  if (digits.startsWith("0044")) digits = digits.slice(2);
  if (/^07\d{9}$/.test(digits)) return `44${digits.slice(1)}`;
  if (/^447\d{9}$/.test(digits)) return digits;
  return null;
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function normalizeVoxiUsername(value: unknown) {
  const username = typeof value === "string" ? value.trim() : "";
  if (!username) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "请填写 VOXI 登录邮箱",
    });
  }
  if (username.length > 254 || /[\r\n]/.test(username) || !username.includes("@")) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "VOXI 登录邮箱格式不正确",
    });
  }
  return username;
}

function normalizeVoxiPassword(value: unknown) {
  const password = typeof value === "string" ? value : "";
  if (!password) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "未保存 VOXI 密码，请重新填写后保存",
    });
  }
  if (password.length > 512 || /[\r\n]/.test(password)) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "VOXI 密码格式不正确",
    });
  }
  return password;
}

function normalizeVoxiOtp(value: string) {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(code)) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "请输入 VOXI 短信中的 4-8 位字母或数字验证码",
    });
  }
  return code;
}

function configuredOtpCode(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  return normalizeVoxiOtp(value);
}

function configuredOtpRequest(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function accountRows(response: VoxiAccountsResponse | null) {
  if (!response || !Array.isArray(response.accountDetails)) return [];
  return response.accountDetails.filter(
    (item): item is VoxiAccount => Boolean(item) && typeof item === "object",
  );
}

function subscriptionRows(response: VoxiSubscriptionsResponse | null) {
  if (!response || !Array.isArray(response.subscriptionDetails)) return [];
  return response.subscriptionDetails.filter(
    (item): item is VoxiSubscription => Boolean(item) && typeof item === "object",
  );
}

function subscriptionScore(subscription: VoxiSubscription) {
  let score = 0;
  if (stringValue(subscription.status)?.toLowerCase() === "active") score += 4;
  if (stringValue(subscription.type)?.toLowerCase() === "voxi") score += 2;
  if (stringValue(subscription.paymentType)?.toLowerCase() === "prepaid") score += 1;
  return score;
}

function normalizeVoxiBalance(value: unknown) {
  const balance = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value.trim())
      : Number.NaN;
  if (!Number.isFinite(balance) || balance < 0 || balance > 10_000) {
    throw new CarrierProviderError({
      type: "unsupported",
      message: "VOXI /subscription/get 已返回数据，但未识别到有效的 simBalance；接口结构可能已经变更",
    });
  }
  return balance;
}

function normalizeVoxiAccountStatus(value: string | null): ConnectorAccountStatus {
  const status = value?.trim().toLowerCase() ?? "";
  if (status === "active") return "active";
  if (/suspend|barred|restrict|blocked|paused/.test(status)) return "suspended";
  if (/expire/.test(status)) return "expired";
  if (/closed|disconnect|cancel|terminated/.test(status)) return "closed";
  return "unknown";
}

function dataDirectory() {
  return process.env.SIMKEEPER_DATA_DIR?.trim() || "/app/data";
}

function profileDirectory(connectorId: number) {
  if (!Number.isInteger(connectorId) || connectorId <= 0) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "VOXI 浏览器连接 ID 无效",
    });
  }
  return path.join(dataDirectory(), "carrier-browser", "voxi", String(connectorId));
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
    .replace(/\/app\/data\/carrier-browser\/voxi\/\d+/g, "<VOXI profile>")
    .trim()
    .slice(0, 420);
}

async function chromiumExecutable() {
  const configured = process.env.SIMKEEPER_VOXI_CHROMIUM_EXECUTABLE?.trim();
  const candidates = [configured, "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]
    .filter((item): item is string => Boolean(item));
  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Try the next known executable.
    }
  }
  throw new CarrierProviderError({
    type: "configuration",
    message: "SIMKeeper 没有找到 Chromium。官方 Docker 镜像会内置 Chromium；自定义镜像请设置 SIMKEEPER_VOXI_CHROMIUM_EXECUTABLE",
  });
}

async function removeStaleChromiumLocks(profileDir: string) {
  for (const name of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    await rm(path.join(profileDir, name), { force: true, recursive: true }).catch(() => undefined);
  }
}

async function seedCookies(context: BrowserContext, cookies: VoxiCookieJar | null) {
  if (!cookies?.size) return;
  const values = Array.from(cookies.entries())
    .filter(([name, value]) => (
      Boolean(name)
      && Boolean(value)
      && name.length <= 256
      && value.length <= 16_000
      && !/[\r\n;]/.test(name)
      && !/[\r\n]/.test(value)
    ))
    .map(([name, value]) => ({ name, value, url: VOXI_ORIGIN }));
  if (values.length) await context.addCookies(values);
}

async function snapshotCookies(context: BrowserContext) {
  const jar: VoxiCookieJar = new Map();
  const cookies = await context.cookies([VOXI_ORIGIN]);
  for (const cookie of cookies) {
    if (!cookie.name || !cookie.value) continue;
    if (cookie.name.length > 256 || cookie.value.length > 16_000) continue;
    if (/[\r\n;]/.test(cookie.name) || /[\r\n]/.test(cookie.value)) continue;
    jar.set(cookie.name, cookie.value);
  }
  return jar;
}

async function withVoxiBrowser<T>(
  connectorId: number,
  seed: VoxiCookieJar | null,
  operation: (context: BrowserContext, page: Page) => Promise<T>,
) {
  const executablePath = await chromiumExecutable();
  const profileDir = profileDirectory(connectorId);
  const runtime = browserRuntimeDirectories();
  try {
    await Promise.all([
      mkdir(profileDir, { recursive: true, mode: 0o700 }),
      mkdir(runtime.home, { recursive: true, mode: 0o700 }),
      mkdir(runtime.cache, { recursive: true, mode: 0o700 }),
      mkdir(runtime.config, { recursive: true, mode: 0o700 }),
    ]);
    await access(profileDir, fsConstants.W_OK | fsConstants.X_OK);
    await access(runtime.home, fsConstants.W_OK | fsConstants.X_OK);
  } catch (error) {
    throw new CarrierProviderError({
      type: "configuration",
      message: `VOXI Chromium 运行目录不可写：${chromiumLaunchError(error) || "请检查 /app/data 的 PUID/PGID 和挂载权限"}`,
      cause: error,
    });
  }
  await removeStaleChromiumLocks(profileDir);

  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      executablePath,
      headless: true,
      chromiumSandbox: false,
      locale: "en-GB",
      timezoneId: "Europe/London",
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
    throw new CarrierProviderError({
      type: "configuration",
      message: `SIMKeeper 无法启动 VOXI Chromium 浏览器运行时${reason ? `：${reason}` : ""}。alpha.55.1 已为 Chromium 使用独立可写 HOME/XDG 目录；若仍失败，请把这条完整错误信息发来`,
      cause: error,
    });
  }

  try {
    await seedCookies(context, seed);
    const page = context.pages()[0] ?? await context.newPage();
    page.setDefaultTimeout(BROWSER_ACTION_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(BROWSER_NAVIGATION_TIMEOUT_MS);
    return await operation(context, page);
  } finally {
    await context.close().catch(() => undefined);
  }
}

function looksLikeCloudflareChallenge(title: string, body: string) {
  const value = `${title}\n${body}`.toLowerCase();
  return value.includes("just a moment")
    || value.includes("checking your browser")
    || value.includes("verify you are human")
    || value.includes("performing security verification")
    || value.includes("security of your connection")
    || value.includes("enable javascript and cookies to continue");
}

async function pageIsCloudflareChallenge(page: Page) {
  const title = await page.title().catch(() => "");
  const body = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => "");
  return looksLikeCloudflareChallenge(title, body.slice(0, 8_000));
}

async function openVoxiPage(page: Page, targetPath: string) {
  if (targetPath !== VOXI_SIGN_IN_PATH && targetPath !== VOXI_ACCOUNT_PATH && targetPath !== "/") {
    throw new CarrierProviderError({
      type: "configuration",
      message: "VOXI 浏览器导航路径不受支持",
    });
  }

  try {
    await page.goto(`${VOXI_ORIGIN}${targetPath}`, {
      waitUntil: "domcontentloaded",
      timeout: BROWSER_NAVIGATION_TIMEOUT_MS,
    });
  } catch (error) {
    const current = page.url();
    if (!current.startsWith(VOXI_ORIGIN)) {
      throw new CarrierProviderError({
        type: "temporary",
        message: "VOXI Chromium 无法打开官方站点，请检查 SIMKeeper 服务器网络",
        cause: error,
      });
    }
  }

  const deadline = Date.now() + CLOUDFLARE_WAIT_MS;
  while (await pageIsCloudflareChallenge(page)) {
    if (Date.now() >= deadline) {
      throw new CarrierProviderError({
        type: "authentication",
        httpStatus: 403,
        message: "服务器 Chromium 仍停留在 VOXI / Cloudflare 验证页，当前验证需要额外交互或该出口网络被限制；SIMKeeper 不会尝试绕过人工验证码",
      });
    }
    await page.waitForTimeout(1_000);
  }

  const currentUrl = page.url();
  try {
    const parsed = new URL(currentUrl);
    if (parsed.origin !== VOXI_ORIGIN) {
      throw new Error("origin mismatch");
    }
  } catch {
    throw new CarrierProviderError({
      type: "unsupported",
      message: "VOXI Chromium 被导航到非 VOXI 页面，已停止认证",
    });
  }
}

function assertAllowedApiPath(value: string) {
  const allowed = value === "/auth/accounts"
    || value === "/auth/session"
    || value === "/subscription/get"
    || /^\/auth\/accounts\/(?:[A-Za-z0-9._~-]|%[0-9A-Fa-f]{2})+\/subscriptions$/.test(value);
  if (!allowed) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "VOXI 内部账户接口路径不受支持",
    });
  }
}

function endpointLabel(value: string) {
  if (/^\/auth\/accounts\/.+\/subscriptions$/.test(value)) {
    return "/auth/accounts/{accountId}/subscriptions";
  }
  return value;
}

async function browserFetch(
  page: Page,
  input: {
    path: string;
    method: "GET" | "POST";
    body?: unknown;
    headers?: Record<string, string>;
  },
): Promise<BrowserFetchResult> {
  try {
    const result = await page.evaluate(async (request) => {
      try {
        const headers = new Headers(request.headers ?? {});
        const init: RequestInit = {
          method: request.method,
          headers,
          credentials: "include",
          cache: "no-store",
          redirect: "follow",
        };
        if (request.hasBody) init.body = JSON.stringify(request.body);
        const response = await fetch(request.path, init);
        const text = await response.text();
        return {
          ok: true,
          error: null,
          status: response.status,
          url: response.url,
          contentType: response.headers.get("content-type") ?? "",
          cfMitigated: response.headers.get("cf-mitigated"),
          cfRay: response.headers.get("cf-ray"),
          text,
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "browser fetch failed",
          status: 0,
          url: "",
          contentType: "",
          cfMitigated: null,
          cfRay: null,
          text: "",
        };
      }
    }, {
      path: input.path,
      method: input.method,
      body: input.body ?? null,
      hasBody: input.body !== undefined,
      headers: input.headers ?? {},
    });
    return result as BrowserFetchResult;
  } catch (error) {
    throw new CarrierProviderError({
      type: "temporary",
      message: `VOXI Chromium 执行 ${input.path} 请求失败`,
      cause: error,
    });
  }
}

function challengeDiagnostic(response: BrowserFetchResult) {
  const parts = [
    response.cfMitigated ? `cf-mitigated=${response.cfMitigated}` : null,
    response.cfRay ? `CF-Ray ${response.cfRay}` : null,
  ].filter(Boolean);
  return parts.length ? `（${parts.join("，")}）` : "";
}

function assertAuthResponse(response: BrowserFetchResult, phase: "credentials" | "send-otp" | "verify-otp") {
  if (!response.ok) {
    throw new CarrierProviderError({
      type: "temporary",
      message: `VOXI Chromium ${phase === "send-otp" ? "发送验证码" : "认证"}请求未完成：${response.error || "浏览器网络错误"}`,
    });
  }
  if (response.status >= 200 && response.status < 300) return;
  if (response.status === 429) {
    throw new CarrierProviderError({
      type: "rate_limit",
      httpStatus: response.status,
      message: "VOXI 暂时限制了登录或验证码请求频率，请稍后重试",
    });
  }
  if (response.status >= 500) {
    throw new CarrierProviderError({
      type: "temporary",
      httpStatus: response.status,
      message: `VOXI 登录服务暂时不可用（HTTP ${response.status}）`,
    });
  }
  if (response.status === 403 && response.cfMitigated?.toLowerCase() === "challenge") {
    throw new CarrierProviderError({
      type: "authentication",
      httpStatus: response.status,
      message: `VOXI / Cloudflare 仍对服务器 Chromium 的认证请求发起验证 ${challengeDiagnostic(response)}；当前浏览器会话尚未获得可用的安全验证状态`,
    });
  }
  if (phase === "credentials" && (response.status === 400 || response.status === 401)) {
    throw new CarrierProviderError({
      type: "authentication",
      httpStatus: response.status,
      message: "VOXI 用户名或密码被拒绝，请检查登录邮箱和密码",
    });
  }
  if (phase === "verify-otp" && (response.status === 400 || response.status === 401)) {
    throw new CarrierProviderError({
      type: "authentication",
      httpStatus: response.status,
      message: "VOXI 验证码无效或已过期，请重新发送验证码",
    });
  }
  throw new CarrierProviderError({
    type: "authentication",
    httpStatus: response.status,
    message: phase === "send-otp"
      ? `VOXI 验证码发送失败（HTTP ${response.status}）`
      : `VOXI 认证失败（HTTP ${response.status}）`,
  });
}

async function authenticateInBrowser(page: Page, username: string, password: string) {
  await openVoxiPage(page, VOXI_SIGN_IN_PATH);
  const response = await browserFetch(page, {
    path: "/authenticate",
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
    },
    body: {
      username,
      password: Buffer.from(password, "utf8").toString("base64"),
    },
  });
  assertAuthResponse(response, "credentials");

  const otpResponse = await browserFetch(page, {
    path: "/authenticate/sendOtp",
    method: "POST",
    headers: { Accept: "application/json, text/plain, */*" },
  });
  assertAuthResponse(otpResponse, "send-otp");
}

async function verifyOtpInBrowser(page: Page, code: string) {
  await openVoxiPage(page, VOXI_SIGN_IN_PATH);
  const response = await browserFetch(page, {
    path: "/authenticate",
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
    },
    body: {
      password: VOXI_OTP_PASSWORD_PLACEHOLDER,
      otp: code,
    },
  });
  assertAuthResponse(response, "verify-otp");
}

async function browserJsonRequest<T>(
  page: Page,
  requestPath: string,
  options: BrowserRequestOptions = {},
): Promise<T | null> {
  assertAllowedApiPath(requestPath);
  const label = endpointLabel(requestPath);
  const method = options.method ?? "GET";
  const response = await browserFetch(page, {
    path: requestPath,
    method,
    body: method === "POST" ? options.body ?? {} : undefined,
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
      ...(requestPath.startsWith("/auth/") ? { dalheaders: "{}" } : {}),
      ...(requestPath === "/auth/session" ? { "reply-with-cookies": "false" } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new CarrierProviderError({
      type: "temporary",
      message: `VOXI Chromium 无法完成 ${label} 请求：${response.error || "浏览器网络错误"}`,
    });
  }
  if (response.status === 403 && response.cfMitigated?.toLowerCase() === "challenge") {
    throw new CarrierProviderError({
      type: "authentication",
      httpStatus: response.status,
      message: `VOXI ${label} 被 Cloudflare 要求重新验证 ${challengeDiagnostic(response)}；请重新进行 VOXI 登录验证`,
    });
  }
  if (response.status === 401 || response.status === 403 || /\/sign-in(?:[/?#]|$)/i.test(response.url)) {
    throw new CarrierProviderError({
      type: "authentication",
      httpStatus: response.status || null,
      message: `VOXI ${label} 登录会话已失效或被拒绝，请重新进行 VOXI 登录验证`,
    });
  }
  if (response.status === 429) {
    throw new CarrierProviderError({
      type: "rate_limit",
      httpStatus: response.status,
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
  if (response.status >= 400) {
    throw new CarrierProviderError({
      type: "unsupported",
      httpStatus: response.status,
      message: `VOXI ${label} 请求失败（HTTP ${response.status}），接口可能已经变更`,
    });
  }
  if (response.status === 204 || !response.text.trim()) {
    if (options.allowNoContent) return null;
    throw new CarrierProviderError({
      type: "unsupported",
      message: `VOXI ${label} 未返回数据`,
    });
  }
  if (Buffer.byteLength(response.text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new CarrierProviderError({
      type: "unsupported",
      message: `VOXI ${label} 响应过大，已停止解析`,
    });
  }
  const contentType = response.contentType.toLowerCase();
  if (contentType.includes("text/html") || /^\s*</.test(response.text)) {
    throw new CarrierProviderError({
      type: "authentication",
      message: `VOXI ${label} 返回了登录网页而不是账户数据，请重新进行 VOXI 登录验证`,
    });
  }
  try {
    return JSON.parse(response.text) as T;
  } catch (error) {
    throw new CarrierProviderError({
      type: "unsupported",
      message: `VOXI ${label} 返回的 JSON 无法解析`,
      cause: error,
    });
  }
}

async function selectVoxiSubscriptionInBrowser(page: Page, targetMsisdn: string) {
  const accounts = accountRows(
    await browserJsonRequest<VoxiAccountsResponse>(page, "/auth/accounts"),
  );
  if (accounts.length === 0) {
    throw new CarrierProviderError({
      type: "authentication",
      message: "VOXI 登录成功但没有读取到账户，请重新进行登录验证",
    });
  }

  const matches: Array<SelectedVoxiSubscription & { score: number }> = [];
  for (const account of accounts) {
    const accountId = stringValue(account.id);
    const accountIdHash = stringValue(account.idHash);
    if (!accountId || !accountIdHash) continue;
    const subscriptions = subscriptionRows(
      await browserJsonRequest<VoxiSubscriptionsResponse>(
        page,
        `/auth/accounts/${encodeURIComponent(accountId)}/subscriptions`,
        { headers: { "account-id-hash": accountIdHash } },
      ),
    );
    for (const subscription of subscriptions) {
      const subscriptionId = stringValue(subscription.subscriptionId);
      const subscriptionIdHash = stringValue(subscription.subscriptionIdHash);
      if (!subscriptionId || !subscriptionIdHash) continue;
      const phone = comparableVoxiNumber(subscription.phoneNumber)
        ?? comparableVoxiNumber(subscriptionId);
      if (phone !== targetMsisdn) continue;
      matches.push({
        accountId,
        accountIdHash,
        subscriptionId,
        subscriptionIdHash,
        msisdn: comparableVoxiNumber(subscriptionId) ?? targetMsisdn,
        status: stringValue(subscription.status),
        score: subscriptionScore(subscription),
      });
    }
  }

  if (matches.length === 0) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "当前 VOXI 登录账户中没有找到与 SIMKeeper 手机号匹配的订阅；请确认号码与登录账户一致",
    });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches[0];
}

async function readVoxiDataInBrowser(
  context: BrowserContext,
  page: Page,
  targetMsisdn: string,
): Promise<VoxiBrowserData> {
  await openVoxiPage(page, VOXI_ACCOUNT_PATH);
  const currentUrl = new URL(page.url());
  if (currentUrl.pathname.startsWith("/sign-in")) {
    throw new CarrierProviderError({
      type: "authentication",
      message: "VOXI 浏览器登录会话已经失效，请重新进行登录验证",
    });
  }

  const selected = await selectVoxiSubscriptionInBrowser(page, targetMsisdn);
  await browserJsonRequest<unknown>(page, "/auth/session", {
    allowNoContent: true,
    headers: {
      "account-id": selected.accountId,
      "account-id-hash": selected.accountIdHash,
      "subscription-id": selected.subscriptionId,
      "subscription-id-hash": selected.subscriptionIdHash,
    },
  });
  const subscription = await browserJsonRequest<VoxiSubscriptionResponse>(
    page,
    "/subscription/get",
    {
      method: "POST",
      body: { msisdn: selected.msisdn },
    },
  );
  if (!subscription) {
    throw new CarrierProviderError({
      type: "unsupported",
      message: "VOXI /subscription/get 未返回订阅数据",
    });
  }
  return {
    balance: normalizeVoxiBalance(subscription.simBalance),
    accountStatus: normalizeVoxiAccountStatus(selected.status),
    cookies: await snapshotCookies(context),
  };
}

async function startVoxiOtpAuthentication(
  connectorId: number,
  sim: CarrierConnectorSimContext,
  username: string,
  password: string,
) {
  assertVoxiSim(sim);
  clearVoxiPendingAuth(connectorId);
  const cookies = await withVoxiBrowser(connectorId, null, async (context, page) => {
    await authenticateInBrowser(page, username, password);
    return snapshotCookies(context);
  });
  const expiresAt = saveVoxiPendingAuth(connectorId, username, cookies);
  return { expiresAt };
}

async function completeVoxiOtpAuthentication(
  connectorId: number,
  sim: CarrierConnectorSimContext,
  username: string,
  code: string,
  targetMsisdn: string,
) {
  assertVoxiSim(sim);
  const pending = readVoxiPendingAuth(connectorId);
  if (!pending) {
    throw new CarrierProviderError({
      type: "authentication",
      message: "VOXI 验证码会话不存在或已过期，请点击“发送验证码”重新开始登录验证",
    });
  }
  if (!pendingVoxiAuthMatchesUsername(connectorId, username)) {
    clearVoxiPendingAuth(connectorId);
    throw new CarrierProviderError({
      type: "configuration",
      message: "VOXI 登录邮箱已发生变化，请重新发送验证码",
    });
  }

  const data = await withVoxiBrowser(connectorId, pending.cookies, async (context, page) => {
    await verifyOtpInBrowser(page, normalizeVoxiOtp(code));
    return readVoxiDataInBrowser(context, page, targetMsisdn);
  });
  saveVoxiAuthenticatedSession(connectorId, username, data.cookies);
  clearVoxiPendingAuth(connectorId);
  clearVoxiOneTimeAuthConfig(connectorId, { requestOtp: true, otpCode: true });
  return data;
}

async function syncVoxiBrowserSession(
  connectorId: number,
  username: string,
  targetMsisdn: string,
) {
  const stored = readVoxiAuthenticatedSession(connectorId, username);
  if (!stored) {
    throw new CarrierProviderError({
      type: "authentication",
      message: "VOXI 尚未建立服务器 Chromium 登录会话，请点击“发送验证码”完成一次登录验证",
    });
  }
  const data = await withVoxiBrowser(connectorId, stored, async (context, page) => (
    readVoxiDataInBrowser(context, page, targetMsisdn)
  ));
  saveVoxiAuthenticatedSession(connectorId, username, data.cookies);
  return data;
}

async function deleteVoxiBrowserProfile(connectorId: number) {
  const profileDir = profileDirectory(connectorId);
  await rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
}

export const voxiCarrierConnectorProvider: CarrierConnectorProvider = {
  id: "voxi",
  label: "VOXI My Account",
  description: "使用 SIMKeeper 服务器内置的 Playwright Chromium 打开 VOXI 官方网页，让 Cloudflare 在真实浏览器环境中正常运行，再完成邮箱/密码 + 短信 OTP 登录，并从 /subscription/get 的 simBalance 读取 Top up / PAYG credit。",
  minLinkedSims: 1,
  maxLinkedSims: 1,
  configFields: [
    {
      key: "requestOtp",
      label: "发送 VOXI 验证码",
      type: "checkbox",
      required: false,
      defaultValue: false,
      description: "VOXI 登录验证的内部一次性状态；号码编辑器会自动处理，无需手动勾选。",
    },
    {
      key: "otpCode",
      label: "VOXI 短信验证码",
      type: "text",
      required: false,
      placeholder: "例如 AB12C",
      description: "VOXI 登录验证的内部一次性状态；验证完成后自动清除，不会长期保存。",
    },
  ],
  credentialFields: [
    {
      key: "username",
      label: "VOXI 登录邮箱",
      required: true,
      placeholder: "输入 VOXI 登录邮箱",
      description: "与密码一起使用 SIMKeeper 凭据加密保存；不会写入 Chromium Profile。",
    },
    {
      key: "password",
      label: "VOXI 密码",
      required: true,
      placeholder: "输入 VOXI 登录密码",
      description: "仅在服务器 Chromium 中提交给 VOXI 官方登录接口。浏览器 Profile 只保存 VOXI / Cloudflare 会话状态，不保存 SIMKeeper 中的明文密码。",
    },
  ],
  async disconnect({ connectorId }) {
    deleteVoxiSession(connectorId);
    await deleteVoxiBrowserProfile(connectorId);
  },
  async sync({ connectorId, credentials, sim, config }): Promise<NormalizedCarrierSyncResult> {
    assertVoxiSim(sim);
    const username = normalizeVoxiUsername(credentials.username);
    const password = normalizeVoxiPassword(credentials.password);
    const targetMsisdn = normalizeVoxiNumber(sim.phoneNumber);
    const otpCode = configuredOtpCode(config.otpCode);
    const requestOtp = configuredOtpRequest(config.requestOtp);
    const pending = readVoxiPendingAuth(connectorId);

    try {
      let data: VoxiBrowserData;
      if (pending && otpCode) {
        data = await completeVoxiOtpAuthentication(
          connectorId,
          sim,
          username,
          otpCode,
          targetMsisdn,
        );
      } else if (requestOtp) {
        const result = await startVoxiOtpAuthentication(
          connectorId,
          sim,
          username,
          password,
        );
        clearVoxiOneTimeAuthConfig(connectorId, { requestOtp: true });
        throw new CarrierProviderError({
          type: "authentication",
          message: `VOXI 验证码已由服务器 Chromium 发送；请在号码编辑器中输入短信验证码并点击“验证并同步”。本次验证码会话约 10 分钟内有效（截至 ${result.expiresAt}）`,
        });
      } else if (pending) {
        throw new CarrierProviderError({
          type: "authentication",
          message: "VOXI 验证码已发送，请输入短信验证码并点击“验证并同步”",
        });
      } else {
        data = await syncVoxiBrowserSession(connectorId, username, targetMsisdn);
      }

      return {
        balance: data.balance,
        currencyCode: "GBP",
        balanceValidUntil: null,
        accountStatus: data.accountStatus,
      };
    } catch (error) {
      if (
        error instanceof CarrierProviderError
        && error.type === "authentication"
        && !/验证码已/.test(error.message)
        && !/用户名或密码/.test(error.message)
      ) {
        clearVoxiAuthenticatedSession(connectorId);
      }
      throw error;
    }
  },
};
