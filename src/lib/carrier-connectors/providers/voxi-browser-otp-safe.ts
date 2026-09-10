import "server-only";

import { constants as fsConstants } from "node:fs";
import { access, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { CarrierProviderError } from "@/lib/carrier-connectors/errors";
import type { CarrierConnectorProvider } from "@/lib/carrier-connectors/types";
import { voxiCarrierConnectorProvider as legacyVoxiCarrierConnectorProvider } from "@/lib/carrier-connectors/providers/voxi-browser";
import {
  VOXI_OTP_RESEND_COOLDOWN_MS,
  clearVoxiOneTimeAuthConfig,
  clearVoxiPendingAuth,
  pendingVoxiAuthMatchesUsername,
  readVoxiPendingAuth,
  saveVoxiAuthenticatedSession,
  saveVoxiPendingAuth,
  type VoxiCookieJar,
} from "@/lib/carrier-connectors/providers/voxi-native-session";

const VOXI_ORIGIN = "https://www.voxi.co.uk";
const VOXI_SIGN_IN_PATH = "/sign-in?redirectPath=%2Faccount";
const VOXI_SAFE_ORIGIN_PATH = "/";
const VOXI_OTP_PASSWORD_PLACEHOLDER = Buffer.from("undefined", "utf8").toString("base64");
const BROWSER_NAVIGATION_TIMEOUT_MS = 45_000;
const BROWSER_ACTION_TIMEOUT_MS = 20_000;
const CLOUDFLARE_WAIT_MS = 20_000;

type AuthPhase = "credentials" | "send-otp" | "verify-otp";

type BrowserAuthResponse = {
  ok: boolean;
  error: string | null;
  status: number;
  url: string;
  cfMitigated: string | null;
  cfRay: string | null;
};

function assertVoxiSim(countryCode: string, carrierName: string) {
  if (countryCode.toUpperCase() !== "GB" || !carrierName.toLowerCase().includes("voxi")) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "VOXI My Account 只能用于英国 VOXI 号码",
    });
  }
}

function normalizeUsername(value: unknown) {
  const username = typeof value === "string" ? value.trim() : "";
  if (!username || username.length > 254 || /[\r\n]/.test(username) || !username.includes("@")) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "请填写有效的 VOXI 登录邮箱",
    });
  }
  return username;
}

function normalizePassword(value: unknown) {
  const password = typeof value === "string" ? value : "";
  if (!password || password.length > 512 || /[\r\n]/.test(password)) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "未保存有效的 VOXI 密码，请重新填写后保存",
    });
  }
  return password;
}

function normalizeOtp(value: unknown) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{4,8}$/.test(code)) {
    throw new CarrierProviderError({
      type: "configuration",
      message: "请输入 VOXI 短信中的 4-8 位字母或数字验证码",
    });
  }
  return code;
}

function optionalOtp(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  return normalizeOtp(value);
}

function otpRequested(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function dataDirectory() {
  return process.env.SIMKEEPER_DATA_DIR?.trim() || "/app/data";
}

function profileDirectory(connectorId: number) {
  return path.join(dataDirectory(), "carrier-browser", "voxi", String(connectorId));
}

function runtimeDirectories() {
  const dataDir = dataDirectory();
  const home = process.env.HOME?.trim() || path.join(dataDir, "runtime-home");
  return {
    home,
    cache: process.env.XDG_CACHE_HOME?.trim() || path.join(home, ".cache"),
    config: process.env.XDG_CONFIG_HOME?.trim() || path.join(home, ".config"),
  };
}

async function chromiumExecutable() {
  const candidates = [
    process.env.SIMKEEPER_VOXI_CHROMIUM_EXECUTABLE?.trim(),
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].filter((item): item is string => Boolean(item));
  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Try the next executable.
    }
  }
  throw new CarrierProviderError({
    type: "configuration",
    message: "SIMKeeper 没有找到 VOXI Chromium 运行时",
  });
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

function browserError(error: unknown) {
  return (error instanceof Error ? error.message : String(error ?? ""))
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\/app\/data\/carrier-browser\/voxi\/\d+/g, "<VOXI profile>")
    .trim()
    .slice(0, 320);
}

async function withAuthBrowser<T>(
  connectorId: number,
  seed: VoxiCookieJar | null,
  operation: (context: BrowserContext, page: Page) => Promise<T>,
) {
  const executablePath = await chromiumExecutable();
  const profileDir = profileDirectory(connectorId);
  const runtime = runtimeDirectories();
  await Promise.all([
    mkdir(profileDir, { recursive: true, mode: 0o700 }),
    mkdir(runtime.home, { recursive: true, mode: 0o700 }),
    mkdir(runtime.cache, { recursive: true, mode: 0o700 }),
    mkdir(runtime.config, { recursive: true, mode: 0o700 }),
  ]);
  for (const name of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    await rm(path.join(profileDir, name), { force: true, recursive: true }).catch(() => undefined);
  }

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
    throw new CarrierProviderError({
      type: "configuration",
      message: `SIMKeeper 无法启动 VOXI Chromium：${browserError(error) || "未知错误"}`,
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

function looksLikeChallenge(title: string, body: string) {
  const value = `${title}\n${body}`.toLowerCase();
  return value.includes("just a moment")
    || value.includes("checking your browser")
    || value.includes("verify you are human")
    || value.includes("performing security verification")
    || value.includes("enable javascript and cookies to continue");
}

async function openOrigin(page: Page, targetPath: string) {
  try {
    await page.goto(`${VOXI_ORIGIN}${targetPath}`, {
      waitUntil: "domcontentloaded",
      timeout: BROWSER_NAVIGATION_TIMEOUT_MS,
    });
  } catch (error) {
    if (!page.url().startsWith(VOXI_ORIGIN)) {
      throw new CarrierProviderError({
        type: "temporary",
        message: "VOXI Chromium 无法打开官方站点，请检查 SIMKeeper 服务器网络",
        cause: error,
      });
    }
  }

  const deadline = Date.now() + CLOUDFLARE_WAIT_MS;
  while (true) {
    const title = await page.title().catch(() => "");
    const body = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => "");
    if (!looksLikeChallenge(title, body.slice(0, 8_000))) break;
    if (Date.now() >= deadline) {
      throw new CarrierProviderError({
        type: "authentication",
        httpStatus: 403,
        message: "服务器 Chromium 仍停留在 VOXI / Cloudflare 验证页，暂时无法完成登录认证",
      });
    }
    await page.waitForTimeout(1_000);
  }

  try {
    if (new URL(page.url()).origin !== VOXI_ORIGIN) throw new Error("origin mismatch");
  } catch {
    throw new CarrierProviderError({
      type: "authentication",
      message: "VOXI Chromium 被导航到非 VOXI 页面，已停止认证",
    });
  }
}

async function browserAuthRequest(
  page: Page,
  input: { path: "/authenticate" | "/authenticate/sendOtp"; body?: unknown },
): Promise<BrowserAuthResponse> {
  try {
    return await page.evaluate(async (request) => {
      try {
        const headers = new Headers({ Accept: "application/json, text/plain, */*" });
        const init: RequestInit = {
          method: "POST",
          headers,
          credentials: "include",
          cache: "no-store",
          redirect: "follow",
        };
        if (request.hasBody) {
          headers.set("Content-Type", "application/json");
          init.body = JSON.stringify(request.body);
        }
        const response = await fetch(request.path, init);
        return {
          ok: true,
          error: null,
          status: response.status,
          url: response.url,
          cfMitigated: response.headers.get("cf-mitigated"),
          cfRay: response.headers.get("cf-ray"),
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "browser fetch failed",
          status: 0,
          url: "",
          cfMitigated: null,
          cfRay: null,
        };
      }
    }, {
      path: input.path,
      body: input.body ?? null,
      hasBody: input.body !== undefined,
    }) as BrowserAuthResponse;
  } catch (error) {
    throw new CarrierProviderError({
      type: "temporary",
      message: `VOXI Chromium 执行 ${input.path} 请求失败`,
      cause: error,
    });
  }
}

function assertAuthResponse(response: BrowserAuthResponse, phase: AuthPhase) {
  if (!response.ok) {
    throw new CarrierProviderError({
      type: "temporary",
      message: `VOXI ${phase === "send-otp" ? "发送验证码" : "认证"}请求未完成：${response.error || "浏览器网络错误"}`,
    });
  }
  if (response.status >= 200 && response.status < 300) return;
  if (response.status === 429) {
    throw new CarrierProviderError({
      type: "rate_limit",
      httpStatus: 429,
      message: "VOXI 暂时限制了验证码请求频率，请稍后重试",
    });
  }
  if (response.status === 403 && response.cfMitigated?.toLowerCase() === "challenge") {
    throw new CarrierProviderError({
      type: "authentication",
      httpStatus: 403,
      message: `VOXI / Cloudflare 要求重新验证${response.cfRay ? `（CF-Ray ${response.cfRay}）` : ""}`,
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
      message: "VOXI 验证码无效或已过期；如果这是刚收到的最新验证码，请不要再次重发，直接重试验证",
    });
  }
  throw new CarrierProviderError({
    type: response.status >= 500 ? "temporary" : "authentication",
    httpStatus: response.status,
    message: `${phase === "send-otp" ? "VOXI 验证码发送" : "VOXI 认证"}失败（HTTP ${response.status}）`,
  });
}

async function startOtp(connectorId: number, username: string, password: string) {
  const cookies = await withAuthBrowser(connectorId, null, async (context, page) => {
    await openOrigin(page, VOXI_SIGN_IN_PATH);
    const credentialsResponse = await browserAuthRequest(page, {
      path: "/authenticate",
      body: {
        username,
        password: Buffer.from(password, "utf8").toString("base64"),
      },
    });
    assertAuthResponse(credentialsResponse, "credentials");
    const otpResponse = await browserAuthRequest(page, { path: "/authenticate/sendOtp" });
    assertAuthResponse(otpResponse, "send-otp");
    return snapshotCookies(context);
  });
  return saveVoxiPendingAuth(connectorId, username, cookies);
}

function resendWaitSeconds(sentAt: string | null | undefined) {
  if (!sentAt) return 0;
  const sentAtMs = Date.parse(sentAt);
  if (!Number.isFinite(sentAtMs)) return 0;
  return Math.max(0, Math.ceil((VOXI_OTP_RESEND_COOLDOWN_MS - (Date.now() - sentAtMs)) / 1000));
}

async function resendOtp(connectorId: number, username: string) {
  const pending = readVoxiPendingAuth(connectorId);
  if (!pending) {
    throw new CarrierProviderError({
      type: "authentication",
      message: "VOXI 验证码会话不存在或已过期，请重新开始登录验证",
    });
  }
  const waitSeconds = resendWaitSeconds(pending.sentAt);
  if (waitSeconds > 0) {
    throw new CarrierProviderError({
      type: "rate_limit",
      message: `VOXI 验证码刚刚发送，请等待 ${waitSeconds} 秒后再重新发送`,
    });
  }

  const cookies = await withAuthBrowser(connectorId, pending.cookies, async (context, page) => {
    // Do not reopen /sign-in here. The real VOXI flow resends against the
    // existing OTP transaction; revisiting the sign-in SPA can reset it.
    await openOrigin(page, VOXI_SAFE_ORIGIN_PATH);
    const response = await browserAuthRequest(page, { path: "/authenticate/sendOtp" });
    assertAuthResponse(response, "send-otp");
    return snapshotCookies(context);
  });
  return saveVoxiPendingAuth(connectorId, username, cookies);
}

async function verifyOtp(connectorId: number, username: string, code: string) {
  const pending = readVoxiPendingAuth(connectorId);
  if (!pending) {
    throw new CarrierProviderError({
      type: "authentication",
      message: "VOXI 验证码会话不存在或已过期，请重新发送验证码",
    });
  }
  if (!pendingVoxiAuthMatchesUsername(connectorId, username)) {
    clearVoxiPendingAuth(connectorId);
    throw new CarrierProviderError({
      type: "configuration",
      message: "VOXI 登录邮箱已发生变化，请重新发送验证码",
    });
  }

  const cookies = await withAuthBrowser(connectorId, pending.cookies, async (context, page) => {
    // Important: verify from a neutral VOXI page instead of reopening /sign-in.
    // The OTP challenge is bound to the existing authenticated browser session.
    await openOrigin(page, VOXI_SAFE_ORIGIN_PATH);
    const response = await browserAuthRequest(page, {
      path: "/authenticate",
      body: {
        password: VOXI_OTP_PASSWORD_PLACEHOLDER,
        otp: code,
      },
    });
    assertAuthResponse(response, "verify-otp");
    return snapshotCookies(context);
  });
  saveVoxiAuthenticatedSession(connectorId, username, cookies);
  clearVoxiPendingAuth(connectorId);
}

function cleanConfig(config: Record<string, unknown>) {
  return { ...config, requestOtp: false, otpCode: "" };
}

export const voxiCarrierConnectorProvider: CarrierConnectorProvider = {
  ...legacyVoxiCarrierConnectorProvider,
  description: "使用 SIMKeeper 服务器内置的 Playwright Chromium 打开 VOXI 官方网页，完成邮箱/密码 + 短信 OTP 登录，并复用持久化会话从 /subscription/get 读取 Top up / PAYG credit。OTP 重发遵循本地冷却保护，验证阶段不会重新打开登录页以免重置验证码会话。",
  async sync(context) {
    assertVoxiSim(context.sim.countryCode, context.sim.carrierName);
    const username = normalizeUsername(context.credentials.username);
    const requestOtp = otpRequested(context.config.requestOtp);
    const otpCode = optionalOtp(context.config.otpCode);
    const pending = readVoxiPendingAuth(context.connectorId);

    if (otpCode) {
      clearVoxiOneTimeAuthConfig(context.connectorId, { otpCode: true });
      if (!pending) {
        throw new CarrierProviderError({
          type: "authentication",
          message: "VOXI 验证码会话不存在或已过期，请重新发送验证码",
        });
      }
      await verifyOtp(context.connectorId, username, otpCode);
      clearVoxiOneTimeAuthConfig(context.connectorId, { requestOtp: true, otpCode: true });
      return legacyVoxiCarrierConnectorProvider.sync({
        ...context,
        config: cleanConfig(context.config),
      });
    }

    if (requestOtp) {
      clearVoxiOneTimeAuthConfig(context.connectorId, { requestOtp: true, otpCode: true });
      if (pending) {
        const expiresAt = await resendOtp(context.connectorId, username);
        throw new CarrierProviderError({
          type: "authentication",
          message: `VOXI 验证码已由服务器 Chromium 发送；这是当前登录会话的重新发送。请使用最新短信验证码直接验证，验证码会话最长保留至 ${expiresAt}`,
        });
      }
      const password = normalizePassword(context.credentials.password);
      const expiresAt = await startOtp(context.connectorId, username, password);
      throw new CarrierProviderError({
        type: "authentication",
        message: `VOXI 验证码已由服务器 Chromium 发送；请使用最新短信验证码直接验证。SIMKeeper 按 VOXI 短信提示将本次验证码会话保留 20 分钟（截至 ${expiresAt}）`,
      });
    }

    if (pending) {
      throw new CarrierProviderError({
        type: "authentication",
        message: "VOXI 验证码已发送，请输入最新短信验证码并点击“验证并同步”；不要重复发送，否则旧验证码会失效",
      });
    }

    return legacyVoxiCarrierConnectorProvider.sync({
      ...context,
      config: cleanConfig(context.config),
    });
  },
};
