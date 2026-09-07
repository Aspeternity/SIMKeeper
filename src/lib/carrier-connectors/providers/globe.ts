import "server-only";

import { createHash, createPublicKey, publicEncrypt, constants } from "node:crypto";
import { sqlite } from "@/db";
import {
  decryptCarrierConnectorCredential,
  encryptCarrierConnectorCredential,
} from "@/lib/credential-crypto";
import type {
  CarrierConnectorProvider,
  CarrierConnectorSimContext,
  ConnectorAccountStatus,
  NormalizedCarrierSyncResult,
} from "@/lib/carrier-connectors/types";

const GLOBE_API_ORIGIN = "https://digital.api.globe.com.ph";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const OTP_TTL_MS = 10 * 60_000;
const GLOBE_RSA_PUBLIC_KEY_BASE64 =
  "MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAq+375KSFD65rzlI8hJTpzNwZzI65ifJ3QPw0ijoi1FsZsc8GdoTxETxLUZ4+bg/i5yNjbHvUXRIuu8LQYN+tiwTGYPP8L+RMB2xB85UvBTlLhaAnl1+gvhrVTveg4xnTsPSnptTMUKqETLHjprasswue4egk0hJqw3hM4IiFFSZRD7BAciSdKgPjPlYxlXgmXXNVpyCH8r6jQOyC05TvfIuAZFiz257KvO9q3dVl99aHz/ec4fW9OwJK5saCIAbfzbyBYVphubHt3bAffz9Y+35JfkhIVIqGWKn/sOS8J4uVw2fmw98db05GYpg9b0VIrcSfvGTyCzajVpL505xZyc3GmcTsH15Hnw8ZCoMMYABwxfhtETZ8SyLMVXFlLvKYeUzXxnC+Uwn2VqF3bPTTAM+l1lPLkXjXyjQKJbJgLfs5QZbzFtmvjtoagFaalQ0thPs9ooc27VhBQJQtswsuuSmUPXurQjBj+fr9xJaP50LSY+/UDwVeFropwABgwpshzI2gMWr87R1toOlvMHHQ5meJfIjhGRvaHhXgAz5IiEYSonq8jYAzZs+6XUHsat2IFtP9K0J0o3cGpEGmrgzzLZj4M7WzDvX/Uj+bUucXerFjKhyyRHs/LQXgzgslWcHS3gxXUs1269SKa8PuwsLdDxSV8xlSySn6aATQldNhmGcCAwEAAQ==";

const globePublicKey = createPublicKey({
  key: Buffer.from(GLOBE_RSA_PUBLIC_KEY_BASE64, "base64"),
  format: "der",
  type: "spki",
});

const blockedPinFingerprints = new Map<number, string>();

type JsonObject = Record<string, unknown>;
type RequestOptions = {
  method?: "GET" | "POST" | "PUT";
  body?: JsonObject;
  headers?: Record<string, string>;
};

type RawSession = {
  user_token_encrypted: string | null;
  token_expires_at: string | null;
  pending_otp_encrypted: string | null;
  pending_otp_expires_at: string | null;
};

type PendingOtp = {
  mobileNumber: string;
  mobileReferenceId: string;
  otpReferenceId: string;
  brand: string;
};

class GlobeOneApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "GlobeOneApiError";
    this.status = status;
    this.code = code;
  }
}

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

function ensureGlobeSessionTable() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS globeone_connector_sessions (
      connector_id INTEGER PRIMARY KEY,
      user_token_encrypted TEXT,
      token_expires_at TEXT,
      pending_otp_encrypted TEXT,
      pending_otp_expires_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (connector_id) REFERENCES carrier_connectors(id) ON DELETE CASCADE
    );
  `);
}

function getRawSession(connectorId: number) {
  ensureGlobeSessionTable();
  return sqlite
    .prepare(
      `SELECT user_token_encrypted, token_expires_at, pending_otp_encrypted, pending_otp_expires_at
       FROM globeone_connector_sessions
       WHERE connector_id = ?`,
    )
    .get(connectorId) as RawSession | undefined;
}

function decryptStoredValue(value: string | null | undefined) {
  if (!value) return "";
  return decryptCarrierConnectorCredential(value);
}

function upsertSessionToken(connectorId: number, token: string, expiresAt: string | null) {
  ensureGlobeSessionTable();
  const encrypted = encryptCarrierConnectorCredential(token);
  if (!encrypted) throw new Error("GlobeOne User Token 加密失败");
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO globeone_connector_sessions (
         connector_id, user_token_encrypted, token_expires_at,
         pending_otp_encrypted, pending_otp_expires_at, updated_at
       ) VALUES (?, ?, ?, NULL, NULL, ?)
       ON CONFLICT(connector_id) DO UPDATE SET
         user_token_encrypted = excluded.user_token_encrypted,
         token_expires_at = excluded.token_expires_at,
         pending_otp_encrypted = NULL,
         pending_otp_expires_at = NULL,
         updated_at = excluded.updated_at`,
    )
    .run(connectorId, encrypted, expiresAt, now);
}

function clearSessionToken(connectorId: number) {
  ensureGlobeSessionTable();
  sqlite
    .prepare(
      `UPDATE globeone_connector_sessions
       SET user_token_encrypted = NULL, token_expires_at = NULL, updated_at = ?
       WHERE connector_id = ?`,
    )
    .run(new Date().toISOString(), connectorId);
}

function savePendingOtp(connectorId: number, pending: PendingOtp) {
  ensureGlobeSessionTable();
  const encrypted = encryptCarrierConnectorCredential(JSON.stringify(pending));
  if (!encrypted) throw new Error("GlobeOne 验证状态加密失败");
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  sqlite
    .prepare(
      `INSERT INTO globeone_connector_sessions (
         connector_id, user_token_encrypted, token_expires_at,
         pending_otp_encrypted, pending_otp_expires_at, updated_at
       ) VALUES (?, NULL, NULL, ?, ?, ?)
       ON CONFLICT(connector_id) DO UPDATE SET
         pending_otp_encrypted = excluded.pending_otp_encrypted,
         pending_otp_expires_at = excluded.pending_otp_expires_at,
         updated_at = excluded.updated_at`,
    )
    .run(connectorId, encrypted, expiresAt, now);
}

function readPendingOtp(connectorId: number) {
  const session = getRawSession(connectorId);
  if (!session?.pending_otp_encrypted || !session.pending_otp_expires_at) return null;
  const expiresAt = Date.parse(session.pending_otp_expires_at);
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
    clearPendingOtp(connectorId);
    return null;
  }
  try {
    const parsed = JSON.parse(decryptStoredValue(session.pending_otp_encrypted)) as unknown;
    if (!isObject(parsed)) return null;
    const mobileNumber = stringValue(parsed.mobileNumber);
    const mobileReferenceId = stringValue(parsed.mobileReferenceId);
    const otpReferenceId = stringValue(parsed.otpReferenceId);
    const brand = stringValue(parsed.brand) || "prepaid";
    if (!mobileNumber || !mobileReferenceId || !otpReferenceId) return null;
    return { mobileNumber, mobileReferenceId, otpReferenceId, brand } satisfies PendingOtp;
  } catch {
    clearPendingOtp(connectorId);
    return null;
  }
}

function clearPendingOtp(connectorId: number) {
  ensureGlobeSessionTable();
  sqlite
    .prepare(
      `UPDATE globeone_connector_sessions
       SET pending_otp_encrypted = NULL, pending_otp_expires_at = NULL, updated_at = ?
       WHERE connector_id = ?`,
    )
    .run(new Date().toISOString(), connectorId);
}

function deleteSession(connectorId: number) {
  ensureGlobeSessionTable();
  sqlite.prepare("DELETE FROM globeone_connector_sessions WHERE connector_id = ?").run(connectorId);
}

function normalizeGlobeNumber(phoneNumber: string | null | undefined) {
  let digits = String(phoneNumber ?? "").replace(/\D/g, "");
  if (digits.startsWith("63") && digits.length === 12) digits = `0${digits.slice(2)}`;
  if (digits.startsWith("9") && digits.length === 10) digits = `0${digits}`;
  if (!/^09\d{9}$/.test(digits)) {
    throw new Error("关联 SIM 缺少有效的菲律宾 Globe 手机号；请先填写 09xx xxx xxxx 或 +63 9xx xxx xxxx");
  }
  return digits;
}

function assertGlobeSim(sim: CarrierConnectorSimContext) {
  if (sim.countryCode.toUpperCase() !== "PH") {
    throw new Error("GlobeOne 自动同步只能用于菲律宾号码");
  }
  const carrier = sim.carrierName.toLowerCase();
  if (!carrier.includes("globe") && carrier !== "tm" && !carrier.includes("touch mobile")) {
    throw new Error("关联号码的运营商不是 Globe / TM");
  }
}

function pinFingerprint(pin: string) {
  return createHash("sha256").update(pin, "utf8").digest("hex");
}

function encryptRequestObject(value: JsonObject) {
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  return publicEncrypt(
    { key: globePublicKey, padding: constants.RSA_PKCS1_PADDING },
    plaintext,
  ).toString("base64");
}

function deepStrings(value: unknown, depth = 0): string[] {
  if (depth > 4 || value === null || value === undefined) return [];
  if (typeof value === "string" || typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => deepStrings(item, depth + 1));
  if (!isObject(value)) return [];
  const preferred = ["message", "errorMsg", "description", "details", "detail", "code", "errorCode"];
  const output: string[] = [];
  for (const key of preferred) {
    if (key in value) output.push(...deepStrings(value[key], depth + 1));
  }
  return output;
}

function remoteErrorInfo(payload: unknown) {
  const root = objectValue(payload);
  const error = objectValue(root.error);
  const code = stringValue(error.code ?? root.code ?? root.errorCode);
  const candidates = [
    ...deepStrings(error),
    ...deepStrings(root.message),
    ...deepStrings(root.errorMsg),
    ...deepStrings(root.description),
  ].map((item) => item.trim()).filter(Boolean);
  const message = candidates.find((item) => item !== code) || code || "GlobeOne 返回了错误响应";
  return { code: code.slice(0, 80), message: message.slice(0, 300) };
}

async function requestGlobe(path: string, options: RequestOptions = {}) {
  if (!path.startsWith("/v")) throw new Error("GlobeOne 请求路径不受支持");
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };
  if (options.body) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${GLOBE_API_ORIGIN}${path}`, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("连接 GlobeOne 超时，请稍后重试");
    }
    throw new Error("无法连接 GlobeOne，请检查 SIMKeeper 服务器的网络访问");
  } finally {
    clearTimeout(timeout);
  }

  if (response.status >= 300 && response.status < 400) {
    throw new Error("GlobeOne 返回了意外跳转，接口可能已经变更");
  }

  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("GlobeOne 响应过大，已停止解析");
  }

  let payload: unknown = {};
  if (text.trim()) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new Error(`GlobeOne 返回了无法解析的数据（HTTP ${response.status}）`);
    }
  }

  const root = objectValue(payload);
  const hasErrorEnvelope = isObject(root.error) && Object.keys(root.error as JsonObject).length > 0;
  if (!response.ok || hasErrorEnvelope) {
    const info = remoteErrorInfo(payload);
    throw new GlobeOneApiError(response.status, info.code, info.message);
  }
  return payload;
}

function resultObject(payload: unknown) {
  const root = objectValue(payload);
  return isObject(root.result) ? root.result : root;
}

function apiErrorText(error: unknown) {
  if (error instanceof GlobeOneApiError) return `${error.code} ${error.message}`.trim();
  return error instanceof Error ? error.message : String(error ?? "");
}

function isPinError(error: unknown) {
  const text = apiErrorText(error);
  return /password\s+is\s+invalid|invalid\s+(?:password|pin)|incorrect\s+pin/i.test(text);
}

function isLockedError(error: unknown) {
  const text = apiErrorText(error);
  return /50202|account\s+is\s+locked/i.test(text);
}

function isReauthenticationError(error: unknown) {
  const text = apiErrorText(error);
  return /40005|reauthentication\s+needed|device\s+not\s+recognized/i.test(text);
}

function isOtherDeviceError(error: unknown) {
  const text = apiErrorText(error);
  return /40109|40102|account\s+is\s+active\s+in\s+another\s+device/i.test(text);
}

function isTokenAuthError(error: unknown) {
  if (isReauthenticationError(error) || isOtherDeviceError(error)) return true;
  if (error instanceof GlobeOneApiError && [401, 403].includes(error.status)) return true;
  const text = apiErrorText(error);
  return /invalid\s+token|expired\s+token|unauthori[sz]ed|user.?token/i.test(text);
}

function friendlyLoginError(error: unknown) {
  if (isPinError(error)) {
    return new Error("需要重新认证：GlobeOne 6 位 PIN 不正确。SIMKeeper 不会使用同一 PIN 连续尝试登录");
  }
  if (isLockedError(error)) {
    return new Error("GlobeOne 账户已锁定，请先在官方 GlobeOne App 中处理后再同步");
  }
  if (isReauthenticationError(error)) {
    return new Error("GlobeOne 需要短信验证码重新认证；请在号码详情的余额区域完成一次 GlobeOne 验证");
  }
  if (isOtherDeviceError(error)) {
    return new Error("GlobeOne 检测到账户正在另一台设备使用；SIMKeeper 已停止自动重新登录，避免影响手机上的 GlobeOne App");
  }
  return error instanceof Error ? error : new Error("GlobeOne 登录失败");
}

function tokenExpiry(expiresIn: unknown) {
  const seconds = numberValue(expiresIn);
  if (seconds === null || seconds <= 0) return null;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function loginWithPin(
  connectorId: number,
  mobileNumber: string,
  pin: string,
  otpReferenceId?: string,
) {
  const fingerprint = pinFingerprint(pin);
  if (!otpReferenceId && blockedPinFingerprints.get(connectorId) === fingerprint) {
    throw new Error("需要重新认证：上一次 GlobeOne PIN 登录失败。请编辑号码并重新填写正确的 6 位 PIN");
  }

  try {
    const payload = await requestGlobe("/v1/userManagement/mobile/login", {
      method: "POST",
      headers: otpReferenceId ? { OTPReferenceId: otpReferenceId } : undefined,
      body: {
        login: encryptRequestObject({ mobileNumber, pin }),
      },
    });
    const result = resultObject(payload);
    const token = stringValue(result.userToken);
    if (!token) throw new Error("GlobeOne 登录成功但未返回 User Token");
    blockedPinFingerprints.delete(connectorId);
    return { token, expiresAt: tokenExpiry(result.expiresIn) };
  } catch (error) {
    if (isPinError(error)) blockedPinFingerprints.set(connectorId, fingerprint);
    throw friendlyLoginError(error);
  }
}

async function refreshUserToken(token: string) {
  const payload = await requestGlobe("/v3/userManagement/token", {
    method: "PUT",
    headers: {
      "User-Token": `Bearer ${token}`,
      Platform: "ANDROID",
      FCMToken: "fcmToken",
    },
  });
  const result = resultObject(payload);
  const nextToken = stringValue(result.userToken);
  if (!nextToken) throw new Error("GlobeOne Token 刷新成功但未返回新的 User Token");
  return { token: nextToken, expiresAt: tokenExpiry(result.expiresIn) };
}

function parseBalanceValidity(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return null;
  if (/^\d{8}(?:\d{6})?$/.test(raw)) {
    const normalized = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    const timestamp = Date.parse(`${normalized}T00:00:00Z`);
    return Number.isFinite(timestamp) ? normalized : null;
  }
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : null;
}

function accountStatus(value: unknown): ConnectorAccountStatus {
  const status = stringValue(value).toLowerCase();
  if (!status) return "unknown";
  if (["active", "a", "valid", "enabled"].includes(status)) return "active";
  if (/suspend|barred|blocked|restricted/.test(status)) return "suspended";
  if (/expir/.test(status)) return "expired";
  if (/closed|deactiv|terminated/.test(status)) return "closed";
  return "unknown";
}

async function readBalance(
  mobileNumber: string,
  token: string,
): Promise<NormalizedCarrierSyncResult> {
  const payload = await requestGlobe(
    `/v2/balanceManagement/${encodeURIComponent(mobileNumber)}/balance`,
    { headers: { "User-Token": `Bearer ${token}` } },
  );
  const result = resultObject(payload);
  const balance = numberValue(result.balance);
  if (balance === null || balance < 0) {
    throw new Error("GlobeOne 余额响应缺少有效的 balance");
  }
  return {
    balance,
    currencyCode: "PHP",
    balanceValidUntil: parseBalanceValidity(result.expiryDate),
    accountStatus: accountStatus(result.status),
  };
}

async function acquireSessionToken(connectorId: number, mobileNumber: string, pin: string) {
  const session = getRawSession(connectorId);
  const storedToken = decryptStoredValue(session?.user_token_encrypted);

  if (storedToken) {
    try {
      const balance = await readBalance(mobileNumber, storedToken);
      return { token: storedToken, balance };
    } catch (error) {
      if (!isTokenAuthError(error)) throw error;
      if (isReauthenticationError(error)) {
        clearSessionToken(connectorId);
        throw friendlyLoginError(error);
      }
      if (isOtherDeviceError(error)) throw friendlyLoginError(error);

      try {
        const refreshed = await refreshUserToken(storedToken);
        upsertSessionToken(connectorId, refreshed.token, refreshed.expiresAt);
        const balance = await readBalance(mobileNumber, refreshed.token);
        return { token: refreshed.token, balance };
      } catch (refreshError) {
        if (isReauthenticationError(refreshError) || isOtherDeviceError(refreshError)) {
          clearSessionToken(connectorId);
          throw friendlyLoginError(refreshError);
        }
        if (!isTokenAuthError(refreshError)) throw refreshError;
        clearSessionToken(connectorId);
      }
    }
  }

  const login = await loginWithPin(connectorId, mobileNumber, pin);
  upsertSessionToken(connectorId, login.token, login.expiresAt);
  const balance = await readBalance(mobileNumber, login.token);
  return { token: login.token, balance };
}

export async function startGlobeOneOtpAuthentication(
  connectorId: number,
  sim: CarrierConnectorSimContext,
) {
  assertGlobeSim(sim);
  const mobileNumber = normalizeGlobeNumber(sim.phoneNumber);

  const verificationPayload = await requestGlobe("/v1/userManagement/mobileNumber/verification", {
    method: "POST",
    body: {
      verify: encryptRequestObject({ mobileNumber }),
    },
  });
  const verification = resultObject(verificationPayload);
  const mobileReferenceId = stringValue(verification.referenceId);
  if (!mobileReferenceId) throw new Error("GlobeOne 手机号验证未返回 Reference ID");

  const brandType = stringValue(verification.brandType).toLowerCase();
  if (brandType && brandType !== "prepaid") {
    throw new Error(`当前 GlobeOne Provider 仅支持 Prepaid 号码（检测到 ${brandType}）`);
  }
  const brand = brandType || "prepaid";

  const query = new URLSearchParams({
    mobileNumber,
    referenceId: mobileReferenceId,
    categoryIdentifier: "MobileUserLogin",
  });
  const otpPayload = await requestGlobe(`/v1/communicationMessage/otp?${query.toString()}`);
  const otp = resultObject(otpPayload);
  const otpReferenceId = stringValue(otp.otp ?? otp.referenceId);
  if (!otpReferenceId) throw new Error("GlobeOne 验证码请求成功但未返回 OTP Reference ID");

  savePendingOtp(connectorId, {
    mobileNumber,
    mobileReferenceId,
    otpReferenceId,
    brand,
  });

  return { expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString() };
}

export async function completeGlobeOneOtpAuthentication(
  connectorId: number,
  sim: CarrierConnectorSimContext,
  pin: string,
  code: string,
) {
  assertGlobeSim(sim);
  const mobileNumber = normalizeGlobeNumber(sim.phoneNumber);
  if (!/^\d{6}$/.test(pin)) throw new Error("GlobeOne PIN 必须为 6 位数字");
  if (!/^\d{4,8}$/.test(code)) throw new Error("请输入短信中的 GlobeOne 验证码");

  const pending = readPendingOtp(connectorId);
  if (!pending) throw new Error("GlobeOne 验证码会话不存在或已过期，请重新发送验证码");
  if (pending.mobileNumber !== mobileNumber) {
    clearPendingOtp(connectorId);
    throw new Error("号码已发生变化，请重新发送 GlobeOne 验证码");
  }

  await requestGlobe("/v2/communicationMessage/otp/verification", {
    method: "POST",
    body: {
      source: "LFIAM",
      mobileNumber,
      referenceId: pending.otpReferenceId,
      code,
      brand: pending.brand || "prepaid",
      segment: "mobile",
      categoryIdentifier: ["MobileUserLogin"],
      transactionType: 1,
    },
  });

  clearPendingOtp(connectorId);
  const login = await loginWithPin(connectorId, mobileNumber, pin, pending.otpReferenceId);
  upsertSessionToken(connectorId, login.token, login.expiresAt);
  return { authenticated: true };
}

export const globeCarrierConnectorProvider: CarrierConnectorProvider = {
  id: "globe",
  label: "GlobeOne",
  description: "使用菲律宾 Globe Prepaid 号码与 6 位 GlobeOne PIN 登录官方 GlobeOne，并自动同步 Load Balance 与余额有效期；需要时可在号码详情完成一次短信验证。",
  minLinkedSims: 1,
  maxLinkedSims: 1,
  configFields: [],
  credentialFields: [
    {
      key: "pin",
      label: "GlobeOne 6 位 PIN",
      required: true,
      placeholder: "输入 6 位 GlobeOne PIN",
      description: "PIN 使用 SIMKeeper 凭据加密保存；User Token 单独加密保存，短信验证码不会持久化。",
    },
  ],
  async disconnect({ connectorId }) {
    deleteSession(connectorId);
    blockedPinFingerprints.delete(connectorId);
  },
  async sync({ connectorId, credentials, sim }) {
    assertGlobeSim(sim);
    const mobileNumber = normalizeGlobeNumber(sim.phoneNumber);
    const pin = stringValue(credentials.pin);
    if (!pin) throw new Error("未保存 GlobeOne PIN，请编辑号码后重新填写");
    if (!/^\d{6}$/.test(pin)) throw new Error("GlobeOne PIN 必须为 6 位数字");

    const session = await acquireSessionToken(connectorId, mobileNumber, pin);
    return session.balance;
  },
};
