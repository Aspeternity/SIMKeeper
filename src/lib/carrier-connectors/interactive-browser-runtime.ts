import "server-only";

import { randomUUID } from "node:crypto";
import type { BrowserContext, Page } from "playwright-core";

const SESSION_TTL_MS = 10 * 60_000;
const COMPLETED_RETENTION_MS = 2 * 60_000;
const MONITOR_INTERVAL_MS = 650;

export type InteractiveBrowserSessionState = "waiting" | "success" | "error" | "closed";

export type InteractiveBrowserSessionPublic = {
  id: string;
  providerId: string;
  connectorId: number;
  state: InteractiveBrowserSessionState;
  message: string;
  createdAt: string;
  expiresAt: string;
};

type InteractiveBrowserSession = InteractiveBrowserSessionPublic & {
  context: BrowserContext;
  page: Page;
  monitor: ReturnType<typeof setInterval> | null;
  expiryTimer: ReturnType<typeof setTimeout> | null;
  removalTimer: ReturnType<typeof setTimeout> | null;
  closing: boolean;
  isComplete: (page: Page) => Promise<boolean>;
};

type InteractiveBrowserGlobal = typeof globalThis & {
  __simkeeperInteractiveBrowserSessions?: Map<string, InteractiveBrowserSession>;
};

const runtimeGlobal = globalThis as InteractiveBrowserGlobal;
const sessions = runtimeGlobal.__simkeeperInteractiveBrowserSessions
  ?? new Map<string, InteractiveBrowserSession>();
runtimeGlobal.__simkeeperInteractiveBrowserSessions = sessions;

function publicSession(session: InteractiveBrowserSession): InteractiveBrowserSessionPublic {
  return {
    id: session.id,
    providerId: session.providerId,
    connectorId: session.connectorId,
    state: session.state,
    message: session.message,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  };
}

function clearSessionTimers(session: InteractiveBrowserSession) {
  if (session.monitor) clearInterval(session.monitor);
  if (session.expiryTimer) clearTimeout(session.expiryTimer);
  session.monitor = null;
  session.expiryTimer = null;
}

function scheduleRemoval(session: InteractiveBrowserSession) {
  if (session.removalTimer) clearTimeout(session.removalTimer);
  session.removalTimer = setTimeout(() => {
    sessions.delete(session.id);
  }, COMPLETED_RETENTION_MS);
}

async function finishSession(
  session: InteractiveBrowserSession,
  state: Extract<InteractiveBrowserSessionState, "success" | "error" | "closed">,
  message: string,
) {
  if (session.closing) return;
  session.closing = true;
  session.state = state;
  session.message = message;
  clearSessionTimers(session);
  await session.context.close().catch(() => undefined);
  session.closing = false;
  scheduleRemoval(session);
}

async function closeMatchingSessions(providerId: string, connectorId: number) {
  const matching = Array.from(sessions.values()).filter((session) => (
    session.providerId === providerId
    && session.connectorId === connectorId
    && session.state === "waiting"
  ));
  await Promise.all(matching.map((session) => (
    finishSession(session, "closed", "已由新的人工认证会话替换")
  )));
}

export async function registerInteractiveBrowserSession(input: {
  providerId: string;
  connectorId: number;
  context: BrowserContext;
  page: Page;
  message: string;
  isComplete: (page: Page) => Promise<boolean>;
}) {
  await closeMatchingSessions(input.providerId, input.connectorId);

  const now = Date.now();
  const session: InteractiveBrowserSession = {
    id: randomUUID(),
    providerId: input.providerId,
    connectorId: input.connectorId,
    state: "waiting",
    message: input.message,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    context: input.context,
    page: input.page,
    monitor: null,
    expiryTimer: null,
    removalTimer: null,
    closing: false,
    isComplete: input.isComplete,
  };
  sessions.set(session.id, session);

  let monitoring = false;
  session.monitor = setInterval(() => {
    if (monitoring || session.state !== "waiting") return;
    monitoring = true;
    void (async () => {
      try {
        if (session.page.isClosed()) {
          await finishSession(session, "error", "服务器 Chromium 页面已经关闭，请重新开始人工认证");
          return;
        }
        if (await session.isComplete(session.page)) {
          await finishSession(session, "success", "My Smart 官方登录已完成，浏览器会话已保存");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "人工认证状态检测失败";
        await finishSession(session, "error", message.slice(0, 300));
      } finally {
        monitoring = false;
      }
    })();
  }, MONITOR_INTERVAL_MS);

  session.expiryTimer = setTimeout(() => {
    void finishSession(session, "error", "人工认证窗口已超过 10 分钟，请重新开始");
  }, SESSION_TTL_MS);

  return publicSession(session);
}

function matchingSession(sessionId: string, providerId: string, connectorId: number) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.providerId !== providerId || session.connectorId !== connectorId) return null;
  return session;
}

export function getInteractiveBrowserSession(
  sessionId: string,
  providerId: string,
  connectorId: number,
) {
  const session = matchingSession(sessionId, providerId, connectorId);
  return session ? publicSession(session) : null;
}

export async function closeInteractiveBrowserSession(
  sessionId: string,
  providerId: string,
  connectorId: number,
) {
  const session = matchingSession(sessionId, providerId, connectorId);
  if (!session) return false;
  await finishSession(session, "closed", "人工认证窗口已关闭");
  return true;
}

export async function captureInteractiveBrowserFrame(
  sessionId: string,
  providerId: string,
  connectorId: number,
) {
  const session = matchingSession(sessionId, providerId, connectorId);
  if (!session || session.state !== "waiting" || session.page.isClosed()) return null;
  return session.page.screenshot({
    type: "jpeg",
    quality: 78,
    animations: "disabled",
    caret: "hide",
    timeout: 8_000,
  });
}

export async function dispatchInteractiveBrowserInput(
  sessionId: string,
  providerId: string,
  connectorId: number,
  input:
    | { kind: "click"; x: number; y: number }
    | { kind: "scroll"; deltaY: number }
    | { kind: "press"; key: string }
    | { kind: "reload" },
) {
  const session = matchingSession(sessionId, providerId, connectorId);
  if (!session || session.state !== "waiting" || session.page.isClosed()) {
    throw new Error("人工认证会话已经结束，请重新打开");
  }

  if (input.kind === "click") {
    const viewport = session.page.viewportSize() ?? { width: 1365, height: 900 };
    const x = Math.max(0, Math.min(1, input.x)) * viewport.width;
    const y = Math.max(0, Math.min(1, input.y)) * viewport.height;
    await session.page.mouse.click(x, y);
    return;
  }

  if (input.kind === "scroll") {
    const deltaY = Math.max(-1800, Math.min(1800, input.deltaY));
    await session.page.mouse.wheel(0, deltaY);
    return;
  }

  if (input.kind === "reload") {
    await session.page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => undefined);
    return;
  }

  const allowedKeys = new Set([
    "Tab",
    "Enter",
    "Escape",
    "Space",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Backspace",
  ]);
  if (!allowedKeys.has(input.key)) throw new Error("不支持的按键");
  await session.page.keyboard.press(input.key);
}
