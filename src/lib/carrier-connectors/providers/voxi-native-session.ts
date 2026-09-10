import "server-only";

import { createHash } from "node:crypto";
import { sqlite } from "@/db";
import {
  decryptCarrierConnectorCredential,
  encryptCarrierConnectorCredential,
} from "@/lib/credential-crypto";

export const VOXI_OTP_TTL_MS = 20 * 60_000;
export const VOXI_OTP_RESEND_COOLDOWN_MS = 60_000;

export type VoxiCookieJar = Map<string, string>;

type VoxiSessionRow = {
  session_cookies_encrypted: string | null;
  session_username_hash: string | null;
  pending_auth_encrypted: string | null;
  pending_auth_expires_at: string | null;
};

type StoredPendingAuth = {
  usernameHash: string;
  cookies: Array<[string, string]>;
  sentAt?: string;
};

function usernameHash(username: string) {
  return createHash("sha256").update(username, "utf8").digest("hex");
}

function ensureSessionTable() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS voxi_connector_sessions (
      connector_id INTEGER PRIMARY KEY,
      session_cookies_encrypted TEXT,
      session_username_hash TEXT,
      authenticated_at TEXT,
      pending_auth_encrypted TEXT,
      pending_auth_expires_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (connector_id) REFERENCES carrier_connectors(id) ON DELETE CASCADE
    );
  `);
}

function getSessionRow(connectorId: number) {
  ensureSessionTable();
  return sqlite
    .prepare(
      `SELECT session_cookies_encrypted, session_username_hash,
              pending_auth_encrypted, pending_auth_expires_at
       FROM voxi_connector_sessions
       WHERE connector_id = ?`,
    )
    .get(connectorId) as VoxiSessionRow | undefined;
}

function encryptJson(value: unknown, label: string) {
  const encrypted = encryptCarrierConnectorCredential(JSON.stringify(value));
  if (!encrypted) throw new Error(`${label}加密失败`);
  return encrypted;
}

function decryptJson(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(decryptCarrierConnectorCredential(value)) as unknown;
  } catch {
    return null;
  }
}

function cookieEntries(cookies: VoxiCookieJar) {
  return Array.from(cookies.entries()).filter(([name, value]) => (
    Boolean(name)
    && Boolean(value)
    && name.length <= 256
    && value.length <= 16_000
    && !/[\r\n;]/.test(name)
    && !/[\r\n]/.test(value)
  ));
}

function cookieJarFromUnknown(value: unknown): VoxiCookieJar {
  const cookies: VoxiCookieJar = new Map();
  if (!Array.isArray(value)) return cookies;
  for (const item of value) {
    if (!Array.isArray(item) || item.length !== 2) continue;
    const name = typeof item[0] === "string" ? item[0].trim() : "";
    const cookieValue = typeof item[1] === "string" ? item[1] : "";
    if (!name || !cookieValue || name.length > 256 || cookieValue.length > 16_000) continue;
    if (/[\r\n;]/.test(name) || /[\r\n]/.test(cookieValue)) continue;
    cookies.set(name, cookieValue);
  }
  return cookies;
}

export function saveVoxiPendingAuth(
  connectorId: number,
  username: string,
  cookies: VoxiCookieJar,
) {
  ensureSessionTable();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + VOXI_OTP_TTL_MS).toISOString();
  const payload: StoredPendingAuth = {
    usernameHash: usernameHash(username),
    cookies: cookieEntries(cookies),
    sentAt: now,
  };
  const encrypted = encryptJson(payload, "VOXI 验证状态");
  sqlite
    .prepare(
      `INSERT INTO voxi_connector_sessions (
         connector_id, session_cookies_encrypted, session_username_hash, authenticated_at,
         pending_auth_encrypted, pending_auth_expires_at, updated_at
       ) VALUES (?, NULL, NULL, NULL, ?, ?, ?)
       ON CONFLICT(connector_id) DO UPDATE SET
         pending_auth_encrypted = excluded.pending_auth_encrypted,
         pending_auth_expires_at = excluded.pending_auth_expires_at,
         updated_at = excluded.updated_at`,
    )
    .run(connectorId, encrypted, expiresAt, now);
  return expiresAt;
}

export function readVoxiPendingAuth(connectorId: number) {
  const row = getSessionRow(connectorId);
  if (!row?.pending_auth_encrypted || !row.pending_auth_expires_at) return null;
  const expiresAtMs = Date.parse(row.pending_auth_expires_at);
  if (!Number.isFinite(expiresAtMs) || Date.now() >= expiresAtMs) {
    clearVoxiPendingAuth(connectorId);
    return null;
  }
  const parsed = decryptJson(row.pending_auth_encrypted);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const storedUsernameHash = typeof record.usernameHash === "string" ? record.usernameHash : "";
  if (!storedUsernameHash) return null;
  const sentAtValue = typeof record.sentAt === "string" ? record.sentAt : "";
  const sentAtMs = sentAtValue ? Date.parse(sentAtValue) : Number.NaN;
  return {
    usernameHash: storedUsernameHash,
    cookies: cookieJarFromUnknown(record.cookies),
    sentAt: Number.isFinite(sentAtMs) ? new Date(sentAtMs).toISOString() : null,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

export function pendingVoxiAuthMatchesUsername(connectorId: number, username: string) {
  return readVoxiPendingAuth(connectorId)?.usernameHash === usernameHash(username);
}

export function clearVoxiPendingAuth(connectorId: number) {
  ensureSessionTable();
  sqlite
    .prepare(
      `UPDATE voxi_connector_sessions
       SET pending_auth_encrypted = NULL, pending_auth_expires_at = NULL, updated_at = ?
       WHERE connector_id = ?`,
    )
    .run(new Date().toISOString(), connectorId);
}

export function saveVoxiAuthenticatedSession(
  connectorId: number,
  username: string,
  cookies: VoxiCookieJar,
) {
  ensureSessionTable();
  const now = new Date().toISOString();
  const encrypted = encryptJson(cookieEntries(cookies), "VOXI 登录会话");
  sqlite
    .prepare(
      `INSERT INTO voxi_connector_sessions (
         connector_id, session_cookies_encrypted, session_username_hash, authenticated_at,
         pending_auth_encrypted, pending_auth_expires_at, updated_at
       ) VALUES (?, ?, ?, ?, NULL, NULL, ?)
       ON CONFLICT(connector_id) DO UPDATE SET
         session_cookies_encrypted = excluded.session_cookies_encrypted,
         session_username_hash = excluded.session_username_hash,
         authenticated_at = excluded.authenticated_at,
         pending_auth_encrypted = NULL,
         pending_auth_expires_at = NULL,
         updated_at = excluded.updated_at`,
    )
    .run(connectorId, encrypted, usernameHash(username), now, now);
}

export function readVoxiAuthenticatedSession(connectorId: number, username: string) {
  const row = getSessionRow(connectorId);
  if (!row?.session_cookies_encrypted || !row.session_username_hash) return null;
  if (row.session_username_hash !== usernameHash(username)) return null;
  const parsed = decryptJson(row.session_cookies_encrypted);
  if (!Array.isArray(parsed)) return null;
  return cookieJarFromUnknown(parsed);
}

export function clearVoxiAuthenticatedSession(connectorId: number) {
  ensureSessionTable();
  sqlite
    .prepare(
      `UPDATE voxi_connector_sessions
       SET session_cookies_encrypted = NULL, session_username_hash = NULL, updated_at = ?
       WHERE connector_id = ?`,
    )
    .run(new Date().toISOString(), connectorId);
}

export function deleteVoxiSession(connectorId: number) {
  ensureSessionTable();
  sqlite.prepare("DELETE FROM voxi_connector_sessions WHERE connector_id = ?").run(connectorId);
}

export function clearVoxiOneTimeAuthConfig(
  connectorId: number,
  options: { requestOtp?: boolean; otpCode?: boolean } = {},
) {
  const row = sqlite
    .prepare("SELECT provider_config FROM carrier_connectors WHERE id = ? AND provider = 'voxi'")
    .get(connectorId) as { provider_config: string | null } | undefined;
  if (!row) return;
  let config: Record<string, unknown> = {};
  try {
    const parsed = row.provider_config ? JSON.parse(row.provider_config) as unknown : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      config = parsed as Record<string, unknown>;
    }
  } catch {
    config = {};
  }
  if (options.requestOtp) delete config.requestOtp;
  if (options.otpCode) delete config.otpCode;
  sqlite
    .prepare("UPDATE carrier_connectors SET provider_config = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(config), new Date().toISOString(), connectorId);
}
