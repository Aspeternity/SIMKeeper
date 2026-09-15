import "server-only";

import { constants as fsConstants } from "node:fs";
import { access, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  chromium,
  type BrowserContext,
  type Page,
  type Response as PlaywrightResponse,
} from "playwright-core";
import { registerInteractiveBrowserSession } from "@/lib/carrier-connectors/interactive-browser-runtime";

const SMART_ORIGIN = "https://my.smart.com.ph";
const SMART_SERVICES_URL = `${SMART_ORIGIN}/smart/services`;
const DEFAULT_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

function dataDirectory() {
  return process.env.SIMKEEPER_DATA_DIR?.trim() || "/app/data";
}

function connectorDirectory(connectorId: number) {
  return path.join(dataDirectory(), "carrier-browser", "smart", String(connectorId));
}

function profileDirectory(connectorId: number) {
  return path.join(connectorDirectory(connectorId), "profile");
}

function browserRuntimeDirectories() {
  const dataDir = dataDirectory();
  const home = process.env.HOME?.trim() || path.join(dataDir, "runtime-home");
  const cache = process.env.XDG_CACHE_HOME?.trim() || path.join(home, ".cache");
  const config = process.env.XDG_CONFIG_HOME?.trim() || path.join(home, ".config");
  return { home, cache, config };
}

async function chromiumExecutable() {
  const candidates = [
    process.env.SIMKEEPER_SMART_CHROMIUM_EXECUTABLE?.trim(),
    process.env.SIMKEEPER_VOXI_CHROMIUM_EXECUTABLE?.trim(),
    "/usr/local/bin/simkeeper-chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((item): item is string => Boolean(item));

  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Try the next executable.
    }
  }
  throw new Error("SIMKeeper 没有找到可用的 Chromium 运行时");
}

async function removeStaleChromiumLocks(profileDir: string) {
  for (const name of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    await rm(path.join(profileDir, name), { force: true, recursive: true }).catch(() => undefined);
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

function isAuthenticatedCustomerApiResponse(response: PlaywrightResponse) {
  if (response.status() < 200 || response.status() >= 400) return false;
  try {
    const url = new URL(response.url());
    return url.origin === SMART_ORIGIN
      && url.pathname.startsWith("/rest/v1/customeraccounts/");
  } catch {
    return false;
  }
}

function credentialLocators(page: Page) {
  return {
    username: page.locator('input[name="Username"], input[name="username"]').first(),
    password: page.locator('input[name="Password"], input[name="password"], input[type="password"]').first(),
  };
}

async function fillCredentialsWhenVisible(page: Page, username: string, password: string) {
  const fields = credentialLocators(page);
  const usernameVisible = await fields.username.isVisible().catch(() => false);
  const passwordVisible = await fields.password.isVisible().catch(() => false);
  if (!usernameVisible || !passwordVisible) return false;

  const currentUsername = await fields.username.inputValue().catch(() => "");
  const currentPassword = await fields.password.inputValue().catch(() => "");
  if (!currentUsername) await fields.username.fill(username.trim());
  if (!currentPassword) await fields.password.fill(password);
  return true;
}

async function waitForCredentialForm(page: Page) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const fields = credentialLocators(page);
    const usernameVisible = await fields.username.isVisible().catch(() => false);
    const passwordVisible = await fields.password.isVisible().catch(() => false);
    if (usernameVisible && passwordVisible) return true;
    await page.waitForTimeout(350);
  }
  return false;
}

async function launchSmartContext(connectorId: number) {
  const executablePath = await chromiumExecutable();
  const baseDir = connectorDirectory(connectorId);
  const profileDir = profileDirectory(connectorId);
  const runtime = browserRuntimeDirectories();
  await Promise.all([
    mkdir(baseDir, { recursive: true, mode: 0o700 }),
    mkdir(profileDir, { recursive: true, mode: 0o700 }),
    mkdir(runtime.home, { recursive: true, mode: 0o700 }),
    mkdir(runtime.cache, { recursive: true, mode: 0o700 }),
    mkdir(runtime.config, { recursive: true, mode: 0o700 }),
  ]);
  await removeStaleChromiumLocks(profileDir);

  return chromium.launchPersistentContext(profileDir, {
    executablePath,
    headless: true,
    chromiumSandbox: false,
    locale: "en-PH",
    timezoneId: "Asia/Manila",
    userAgent: DEFAULT_BROWSER_USER_AGENT,
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
}

export async function startSmartInteractiveAuthentication(input: {
  connectorId: number;
  username: string;
  password: string;
}) {
  if (!input.username.trim() || !input.password) {
    throw new Error("请先保存 My Smart 登录账号和密码，再开始人工认证");
  }

  let context: BrowserContext | null = null;
  try {
    context = await launchSmartContext(input.connectorId);
    const page = context.pages()[0] ?? await context.newPage();
    page.setDefaultTimeout(20_000);
    page.setDefaultNavigationTimeout(45_000);

    let authenticatedApiSeen = false;
    const onResponse = (response: PlaywrightResponse) => {
      if (!isAuthenticatedCustomerApiResponse(response)) return;
      const request = response.request();
      void request.allHeaders()
        .then((headers) => {
          if (/^bearer\s+\S+$/i.test(headers.authorization?.trim() ?? "")) {
            authenticatedApiSeen = true;
          }
        })
        .catch(() => undefined);
    };
    page.on("response", onResponse);

    await page.goto(SMART_SERVICES_URL, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    }).catch(() => undefined);

    // My Smart may briefly expose /smart/services before its SPA discovers that
    // the SSO session is stale and redirects back to USSO. Do not treat that
    // transient URL as authenticated. Give the official page time to settle and
    // prefill credentials if the login form appears.
    const settleDeadline = Date.now() + 8_000;
    while (Date.now() < settleDeadline && !authenticatedApiSeen) {
      if (await fillCredentialsWhenVisible(page, input.username, input.password)) break;
      await page.waitForTimeout(300);
    }

    if (!authenticatedApiSeen && !isSmartAppLocation(page.url())) {
      const hasForm = await waitForCredentialForm(page);
      if (hasForm) {
        await fillCredentialsWhenVisible(page, input.username, input.password);
      }
    }

    const session = await registerInteractiveBrowserSession({
      providerId: "smart",
      connectorId: input.connectorId,
      context,
      page,
      message: authenticatedApiSeen
        ? "当前浏览器会话已经通过 My Smart 官方账户 API 验证，正在确认状态"
        : "账号和密码会自动填写。请在下方真实 My Smart 页面中亲自完成人机验证，然后点击官方 Login。",
      isComplete: async (currentPage) => {
        // Login forms may appear only after the Smart SPA finishes its stale-session
        // redirect. Keep the saved credentials filled throughout the interactive
        // window so the user only needs to complete the official CAPTCHA/Login.
        await fillCredentialsWhenVisible(currentPage, input.username, input.password).catch(() => false);

        // A /smart/* URL alone is not proof of authentication: My Smart briefly
        // shows that route even for an expired session. Only finish after the
        // page has made a successful authenticated customeraccounts API request
        // carrying a Bearer token.
        if (!authenticatedApiSeen) return false;
        if (!isSmartAppLocation(currentPage.url())) return false;
        const fields = credentialLocators(currentPage);
        return !await fields.password.isVisible().catch(() => false);
      },
    });
    context = null;
    return session;
  } catch (error) {
    await context?.close().catch(() => undefined);
    throw error;
  }
}
