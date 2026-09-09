import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir, sqlite } from "@/db";
import { encryptPortableBackup, validateBackupPassphrase } from "@/lib/backup-security";
import {
  createBackupPayload,
  getBackupRetention,
  getBackupSummary,
  parseBackupInput,
  pruneLocalBackups,
  restoreBackupInput,
  type BackupPayload,
  type BackupSummary,
} from "@/lib/backups";
import {
  decryptRemoteBackupPassphrase,
  decryptRemoteBackupPassword,
  encryptRemoteBackupPassphrase,
  encryptRemoteBackupPassword,
} from "@/lib/credential-crypto";
import type { AttentionItem } from "@/lib/attention-items";

export const REMOTE_BACKUP_PROVIDER = "webdav" as const;
export type RemoteBackupScheduleFrequency = "daily" | "weekly";
export type RemoteBackupTrigger = "manual" | "scheduled";
export type RemoteBackupRunStatus = "running" | "success" | "failed";
export type RemoteBackupRetentionMode = "count" | "smart";
export type RemoteBackupPauseReason = "auth" | "permission" | null;

const CONFIG_SETTING_KEY = "remote_backup_config_v1";
const STATUS_SETTING_KEY = "remote_backup_status_v1";
const PASSWORD_SETTING_KEY = "remote_backup_webdav_password_v1";
const PASSPHRASE_SETTING_KEY = "remote_backup_passphrase_v1";
const INSTANCE_ID_SETTING_KEY = "remote_backup_instance_id_v1";
const RESTORE_PAUSE_SETTING_KEY = "remote_backup_restore_paused_v1";
const REQUEST_TIMEOUT_MS = 20_000;
const SCHEDULER_SCAN_MS = 60_000;
const SCHEDULER_INITIAL_DELAY_MS = 15_000;
const STALE_UPLOAD_MS = 24 * 60 * 60_000;
const RETRY_BACKOFF_MS = [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000] as const;

const DEFAULT_CONFIG = {
  provider: REMOTE_BACKUP_PROVIDER,
  enabled: false,
  endpoint: "",
  remotePath: "/SIMKeeper",
  username: "",
  scheduleFrequency: "daily" as RemoteBackupScheduleFrequency,
  scheduleWeekday: 0,
  scheduleHour: 3,
  scheduleMinute: 0,
  scheduleTimezone: "Asia/Shanghai",
  retentionMode: "smart" as RemoteBackupRetentionMode,
  retentionCount: 14,
  notifyFailures: true,
};

const DEFAULT_STATUS = {
  lastAttemptAt: null as string | null,
  lastSuccessAt: null as string | null,
  lastScheduledSuccessAt: null as string | null,
  lastError: null as string | null,
  lastRemoteName: null as string | null,
  lastRemoteSize: null as number | null,
  lastRemoteDigest: null as string | null,
  lastRetentionWarning: null as string | null,
  nextRunAt: null as string | null,
  nextRetryAt: null as string | null,
  consecutiveFailures: 0,
  pausedReason: null as RemoteBackupPauseReason,
  failureEpisodeStartedAt: null as string | null,
};

type StoredConfig = typeof DEFAULT_CONFIG;
type StoredStatus = typeof DEFAULT_STATUS;

export type RemoteBackupPublicConfig = StoredConfig & StoredStatus & {
  passwordConfigured: boolean;
  passphraseConfigured: boolean;
  restorePaused: boolean;
  restorePausedAt: string | null;
  instanceId: string;
  instanceShortId: string;
};

export type RemoteBackupRun = {
  id: number;
  trigger: RemoteBackupTrigger;
  status: RemoteBackupRunStatus;
  startedAt: string;
  completedAt: string | null;
  localBackupName: string | null;
  remoteName: string | null;
  size: number | null;
  error: string | null;
};

export type SaveRemoteBackupConfigInput = {
  enabled: boolean;
  endpoint: string;
  remotePath: string;
  username: string;
  password?: string;
  backupPassphrase?: string;
  scheduleFrequency: RemoteBackupScheduleFrequency;
  scheduleWeekday: number;
  scheduleHour: number;
  scheduleMinute: number;
  scheduleTimezone: string;
  retentionMode?: RemoteBackupRetentionMode;
  retentionCount: number;
  notifyFailures?: boolean;
};

export type RemoteBackupConnectionInput = {
  endpoint: string;
  remotePath: string;
  username: string;
  password?: string;
};

export type RemoteBackupRunResult = {
  runId: number;
  trigger: RemoteBackupTrigger;
  localBackupName: string;
  remoteName: string;
  size: number;
  digest: string;
  retentionWarning: string | null;
  completedAt: string;
};

export type RemoteBackupFile = {
  name: string;
  size: number | null;
  modifiedAt: string | null;
  createdAt: string | null;
  instanceId: string | null;
  scope: "current" | "other" | "legacy";
};

export type RemoteBackupInspection = {
  file: RemoteBackupFile;
  digest: string;
  summary: BackupSummary;
};

export type RemoteBackupRestoreResult = {
  file: RemoteBackupFile;
  digest: string;
  restored: BackupSummary;
  safetyBackup: string;
  remoteSchedulePaused: boolean;
};

type WebDavConnection = {
  endpoint: string;
  remotePath: string;
  username: string;
  password: string;
};

type DavEntry = {
  name: string;
  size: number | null;
  modifiedAt: string | null;
};

function readSetting(key: string) {
  const row = sqlite.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value?: string } | undefined;
  return typeof row?.value === "string" ? row.value : "";
}

function writeSetting(key: string, value: string) {
  const now = new Date().toISOString();
  sqlite.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, now);
}

function parseObject(value: string) {
  if (!value) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

function readStoredConfig(): StoredConfig {
  const encoded = readSetting(CONFIG_SETTING_KEY);
  if (!encoded) return { ...DEFAULT_CONFIG };
  const raw = parseObject(encoded);
  return {
    provider: REMOTE_BACKUP_PROVIDER,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_CONFIG.enabled,
    endpoint: typeof raw.endpoint === "string" ? raw.endpoint : DEFAULT_CONFIG.endpoint,
    remotePath: typeof raw.remotePath === "string" ? raw.remotePath : DEFAULT_CONFIG.remotePath,
    username: typeof raw.username === "string" ? raw.username : DEFAULT_CONFIG.username,
    scheduleFrequency: raw.scheduleFrequency === "weekly" ? "weekly" : "daily",
    scheduleWeekday: clampInteger(raw.scheduleWeekday, DEFAULT_CONFIG.scheduleWeekday, 0, 6),
    scheduleHour: clampInteger(raw.scheduleHour, DEFAULT_CONFIG.scheduleHour, 0, 23),
    scheduleMinute: clampInteger(raw.scheduleMinute, DEFAULT_CONFIG.scheduleMinute, 0, 59),
    scheduleTimezone: typeof raw.scheduleTimezone === "string" ? raw.scheduleTimezone : DEFAULT_CONFIG.scheduleTimezone,
    // alpha.48/49 only had retentionCount. Keep those installations on the old policy
    // until the user explicitly chooses smart retention.
    retentionMode: raw.retentionMode === "smart" ? "smart" : "count",
    retentionCount: clampInteger(raw.retentionCount, DEFAULT_CONFIG.retentionCount, 1, 100),
    notifyFailures: typeof raw.notifyFailures === "boolean" ? raw.notifyFailures : true,
  };
}

function readStoredStatus(): StoredStatus {
  const raw = parseObject(readSetting(STATUS_SETTING_KEY));
  const pausedReason: RemoteBackupPauseReason = raw.pausedReason === "auth"
    ? "auth"
    : raw.pausedReason === "permission"
      ? "permission"
      : null;
  return {
    lastAttemptAt: typeof raw.lastAttemptAt === "string" ? raw.lastAttemptAt : null,
    lastSuccessAt: typeof raw.lastSuccessAt === "string" ? raw.lastSuccessAt : null,
    lastScheduledSuccessAt: typeof raw.lastScheduledSuccessAt === "string" ? raw.lastScheduledSuccessAt : null,
    lastError: typeof raw.lastError === "string" ? raw.lastError : null,
    lastRemoteName: typeof raw.lastRemoteName === "string" ? raw.lastRemoteName : null,
    lastRemoteSize: typeof raw.lastRemoteSize === "number" && Number.isFinite(raw.lastRemoteSize) ? raw.lastRemoteSize : null,
    lastRemoteDigest: typeof raw.lastRemoteDigest === "string" ? raw.lastRemoteDigest : null,
    lastRetentionWarning: typeof raw.lastRetentionWarning === "string" ? raw.lastRetentionWarning : null,
    nextRunAt: typeof raw.nextRunAt === "string" ? raw.nextRunAt : null,
    nextRetryAt: typeof raw.nextRetryAt === "string" ? raw.nextRetryAt : null,
    consecutiveFailures: clampInteger(raw.consecutiveFailures, 0, 0, 1_000_000),
    pausedReason,
    failureEpisodeStartedAt: typeof raw.failureEpisodeStartedAt === "string" ? raw.failureEpisodeStartedAt : null,
  };
}

function writeStatus(status: StoredStatus) {
  writeSetting(STATUS_SETTING_KEY, JSON.stringify(status));
}

function restorePauseState() {
  const raw = parseObject(readSetting(RESTORE_PAUSE_SETTING_KEY));
  return {
    pending: raw.pending === true,
    restoredAt: typeof raw.restoredAt === "string" ? raw.restoredAt : null,
  };
}

function getOrCreateInstanceId() {
  const current = readSetting(INSTANCE_ID_SETTING_KEY).trim();
  if (/^[0-9a-f-]{36}$/i.test(current)) return current.toLowerCase();
  const created = crypto.randomUUID();
  writeSetting(INSTANCE_ID_SETTING_KEY, created);
  return created;
}

function instanceShortId(instanceId = getOrCreateInstanceId()) {
  return instanceId.replaceAll("-", "").slice(0, 8).toLowerCase();
}

function normalizeEndpoint(value: string, allowEmpty = false) {
  const trimmed = value.trim();
  if (!trimmed && allowEmpty) return "";
  if (!trimmed) throw new Error("请输入 WebDAV 地址");
  if (trimmed.length > 2048) throw new Error("WebDAV 地址过长");

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("WebDAV 地址格式不正确");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("WebDAV 地址只支持 http:// 或 https://");
  }
  if (url.username || url.password) {
    throw new Error("请不要把 WebDAV 用户名或密码写在地址中，请使用独立凭据字段");
  }
  url.hash = "";
  url.search = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.toString();
}

function normalizeRemotePath(value: string) {
  const trimmed = value.trim() || "/SIMKeeper";
  if (trimmed.length > 512) throw new Error("远端目录过长");
  const segments = trimmed.split("/").filter(Boolean);
  if (!segments.length) return "/";
  for (const segment of segments) {
    if (segment === "." || segment === ".." || /[\u0000-\u001f]/.test(segment)) {
      throw new Error("远端目录包含不支持的路径片段");
    }
  }
  return `/${segments.join("/")}`;
}

function validateTimezone(value: string) {
  const timezone = value.trim();
  if (!timezone || timezone.length > 100) throw new Error("时区设置不正确");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error("时区名称无效，例如可填写 Asia/Shanghai");
  }
  return timezone;
}

function validateScheduleNumber(value: number, min: number, max: number, label: string) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label}设置不正确`);
  return value;
}

function validateRetention(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error("远端备份保留数量需要在 1-100 之间");
  }
  return value;
}

function normalizeConfigInput(input: SaveRemoteBackupConfigInput): StoredConfig {
  return {
    provider: REMOTE_BACKUP_PROVIDER,
    enabled: Boolean(input.enabled),
    endpoint: normalizeEndpoint(input.endpoint, !input.enabled),
    remotePath: normalizeRemotePath(input.remotePath),
    username: input.username.trim().slice(0, 512),
    scheduleFrequency: input.scheduleFrequency === "weekly" ? "weekly" : "daily",
    scheduleWeekday: validateScheduleNumber(input.scheduleWeekday, 0, 6, "星期"),
    scheduleHour: validateScheduleNumber(input.scheduleHour, 0, 23, "小时"),
    scheduleMinute: validateScheduleNumber(input.scheduleMinute, 0, 59, "分钟"),
    scheduleTimezone: validateTimezone(input.scheduleTimezone),
    retentionMode: input.retentionMode === "smart" ? "smart" : "count",
    retentionCount: validateRetention(input.retentionCount),
    notifyFailures: input.notifyFailures !== false,
  };
}

type ZonedParts = {
  dateKey: string;
  weekday: number;
  hour: number;
  minute: number;
  second: number;
};

function getZonedParts(date: Date, timezone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: weekdays[parts.weekday] ?? 0,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function weekdayForDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

function localDateTimeToInstant(dateKey: string, hour: number, minute: number, timezone: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const desiredUtcLike = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = new Date(desiredUtcLike);

  for (let index = 0; index < 4; index += 1) {
    const actual = getZonedParts(guess, timezone);
    const [actualYear, actualMonth, actualDay] = actual.dateKey.split("-").map(Number);
    const actualUtcLike = Date.UTC(actualYear, actualMonth - 1, actualDay, actual.hour, actual.minute, actual.second);
    const delta = desiredUtcLike - actualUtcLike;
    if (Math.abs(delta) < 1000) break;
    guess = new Date(guess.getTime() + delta);
  }
  return guess;
}

function nextScheduledInstant(config: StoredConfig, after: Date) {
  const local = getZonedParts(after, config.scheduleTimezone);
  for (let offset = 0; offset <= 8; offset += 1) {
    const dateKey = addDays(local.dateKey, offset);
    if (config.scheduleFrequency === "weekly" && weekdayForDateKey(dateKey) !== config.scheduleWeekday) continue;
    const candidate = localDateTimeToInstant(dateKey, config.scheduleHour, config.scheduleMinute, config.scheduleTimezone);
    if (candidate.getTime() > after.getTime() + 500) return candidate;
  }
  return new Date(after.getTime() + 24 * 60 * 60_000);
}

function zonedDateKey(value: string | null, timezone: string) {
  if (!value) return "";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  return getZonedParts(new Date(timestamp), timezone).dateKey;
}

function initialScheduleInstant(config: StoredConfig, status: StoredStatus, now: Date) {
  const local = getZonedParts(now, config.scheduleTimezone);
  const todayTarget = localDateTimeToInstant(local.dateKey, config.scheduleHour, config.scheduleMinute, config.scheduleTimezone);
  const alreadySucceeded = zonedDateKey(status.lastScheduledSuccessAt || status.lastSuccessAt, config.scheduleTimezone) === local.dateKey;
  const eligibleToday = config.scheduleFrequency === "daily" || local.weekday === config.scheduleWeekday;
  if (!alreadySucceeded && eligibleToday && now.getTime() >= todayTarget.getTime()) {
    return new Date(now.getTime() + 1000);
  }
  return nextScheduledInstant(config, now);
}

function scheduleFieldsChanged(previous: StoredConfig, next: StoredConfig) {
  return previous.scheduleFrequency !== next.scheduleFrequency
    || previous.scheduleWeekday !== next.scheduleWeekday
    || previous.scheduleHour !== next.scheduleHour
    || previous.scheduleMinute !== next.scheduleMinute
    || previous.scheduleTimezone !== next.scheduleTimezone;
}

export function getRemoteBackupConfig(): RemoteBackupPublicConfig {
  const config = readStoredConfig();
  const status = readStoredStatus();
  const pause = restorePauseState();
  const instanceId = getOrCreateInstanceId();
  return {
    ...config,
    ...status,
    passwordConfigured: Boolean(readSetting(PASSWORD_SETTING_KEY)),
    passphraseConfigured: Boolean(readSetting(PASSPHRASE_SETTING_KEY)),
    restorePaused: pause.pending,
    restorePausedAt: pause.restoredAt,
    instanceId,
    instanceShortId: instanceShortId(instanceId),
  };
}

export function saveRemoteBackupConfig(input: SaveRemoteBackupConfigInput) {
  const previous = readStoredConfig();
  const config = normalizeConfigInput(input);
  const previousPassword = readSetting(PASSWORD_SETTING_KEY);
  const previousPassphrase = readSetting(PASSPHRASE_SETTING_KEY);

  let passwordEncrypted = previousPassword;
  const suppliedPassword = typeof input.password === "string" ? input.password : "";
  if (suppliedPassword) {
    if (Buffer.byteLength(suppliedPassword, "utf8") > 4096) throw new Error("WebDAV 密码过长");
    passwordEncrypted = encryptRemoteBackupPassword(suppliedPassword) ?? "";
  } else if (config.endpoint !== previous.endpoint || config.username !== previous.username) {
    passwordEncrypted = "";
  }

  let passphraseEncrypted = previousPassphrase;
  const suppliedPassphrase = typeof input.backupPassphrase === "string" ? input.backupPassphrase : "";
  if (suppliedPassphrase) {
    validateBackupPassphrase(suppliedPassphrase);
    passphraseEncrypted = encryptRemoteBackupPassphrase(suppliedPassphrase) ?? "";
  }

  if (config.enabled) {
    if (!config.endpoint) throw new Error("启用自动异地备份前需要填写 WebDAV 地址");
    if (!passphraseEncrypted) throw new Error("启用自动异地备份前需要设置备份加密口令");
    if (config.username && !passwordEncrypted) throw new Error("启用自动异地备份前需要填写 WebDAV 密码");
  }

  const now = new Date();
  const currentStatus = readStoredStatus();
  const targetChanged = config.endpoint !== previous.endpoint || config.username !== previous.username;
  const scheduleChanged = scheduleFieldsChanged(previous, config);
  const enabling = config.enabled && !previous.enabled;
  let nextStatus = { ...currentStatus };

  if (!config.enabled) {
    nextStatus = {
      ...nextStatus,
      nextRunAt: null,
      nextRetryAt: null,
      pausedReason: null,
      consecutiveFailures: 0,
      failureEpisodeStartedAt: null,
    };
  } else {
    if (enabling || scheduleChanged || !nextStatus.nextRunAt) {
      nextStatus.nextRunAt = initialScheduleInstant(config, nextStatus, now).toISOString();
    }
    if (targetChanged || suppliedPassword) {
      nextStatus.nextRetryAt = null;
      nextStatus.pausedReason = null;
      nextStatus.consecutiveFailures = 0;
      nextStatus.failureEpisodeStartedAt = null;
      nextStatus.lastError = null;
    }
  }

  const save = sqlite.transaction(() => {
    writeSetting(CONFIG_SETTING_KEY, JSON.stringify(config));
    writeSetting(PASSWORD_SETTING_KEY, passwordEncrypted);
    writeSetting(PASSPHRASE_SETTING_KEY, passphraseEncrypted);
    writeStatus(nextStatus);
    if (config.enabled) writeSetting(RESTORE_PAUSE_SETTING_KEY, JSON.stringify({ pending: false }));
  });
  save();
  getOrCreateInstanceId();
  return getRemoteBackupConfig();
}

function requestHeaders(connection: WebDavConnection, initHeaders?: HeadersInit) {
  const headers = new Headers(initHeaders);
  if (connection.username) {
    headers.set(
      "Authorization",
      `Basic ${Buffer.from(`${connection.username}:${connection.password}`, "utf8").toString("base64")}`,
    );
  }
  return headers;
}

async function webDavFetch(connection: WebDavConnection, url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      redirect: "manual",
      signal: controller.signal,
      headers: requestHeaders(connection, init.headers),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("WebDAV 请求超时，请检查网络和服务端地址");
    }
    throw new Error(error instanceof Error ? `WebDAV 连接失败：${error.message}` : "WebDAV 连接失败");
  } finally {
    clearTimeout(timer);
  }
}

function webDavError(action: string, response: Response) {
  if (response.status === 401) return new Error(`WebDAV ${action}失败：用户名或密码错误（HTTP 401）`);
  if (response.status === 403) return new Error(`WebDAV ${action}失败：当前账户没有所需权限（HTTP 403）`);
  if (response.status === 507) return new Error(`WebDAV ${action}失败：远端存储空间不足（HTTP 507）`);
  if (response.status >= 300 && response.status < 400) {
    return new Error(`WebDAV ${action}返回重定向（HTTP ${response.status}）；请直接填写最终 WebDAV 地址`);
  }
  return new Error(`WebDAV ${action}失败（HTTP ${response.status}）`);
}

function encodedRemoteSegments(remotePath: string) {
  return remotePath.split("/").filter(Boolean).map((segment) => encodeURIComponent(segment));
}

function collectionUrl(connection: WebDavConnection, segmentCount?: number) {
  const url = new URL(connection.endpoint);
  const segments = encodedRemoteSegments(connection.remotePath);
  const selected = typeof segmentCount === "number" ? segments.slice(0, segmentCount) : segments;
  const base = url.pathname.replace(/\/+$/, "");
  url.pathname = `${base}${selected.length ? `/${selected.join("/")}` : ""}/`;
  return url.toString();
}

function fileUrl(connection: WebDavConnection, fileName: string) {
  return new URL(encodeURIComponent(fileName), collectionUrl(connection)).toString();
}

async function ensureRemoteDirectory(connection: WebDavConnection) {
  const segments = encodedRemoteSegments(connection.remotePath);
  if (!segments.length) return collectionUrl(connection);
  for (let index = 1; index <= segments.length; index += 1) {
    const url = collectionUrl(connection, index);
    const response = await webDavFetch(connection, url, { method: "MKCOL" });
    if ([200, 201, 204, 405].includes(response.status)) continue;
    throw webDavError("创建远端目录", response);
  }
  return collectionUrl(connection);
}

function sha256(content: Buffer) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function getAndVerify(connection: WebDavConnection, name: string, expected: Buffer) {
  const response = await webDavFetch(connection, fileUrl(connection, name), { method: "GET" });
  if (!response.ok) throw webDavError("回读校验", response);
  const remote = Buffer.from(await response.arrayBuffer());
  const localDigest = sha256(expected);
  const remoteDigest = sha256(remote);
  if (remote.length !== expected.length || localDigest !== remoteDigest) {
    throw new Error("WebDAV 上传后的回读校验失败；远端文件与本地加密备份不一致");
  }
  return localDigest;
}

async function deleteRemoteFileBestEffort(connection: WebDavConnection, name: string) {
  try {
    await webDavFetch(connection, fileUrl(connection, name), { method: "DELETE" });
  } catch {
    // Best effort cleanup for temporary files.
  }
}

async function putAndVerifyAtomic(connection: WebDavConnection, finalName: string, content: Buffer) {
  await ensureRemoteDirectory(connection);
  const short = instanceShortId();
  const temporaryName = `${finalName}.${short}.${crypto.randomBytes(5).toString("hex")}.uploading`;
  const temporaryUrl = fileUrl(connection, temporaryName);
  const finalUrl = fileUrl(connection, finalName);

  try {
    const upload = await webDavFetch(connection, temporaryUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array(content),
    });
    if (![200, 201, 204].includes(upload.status)) throw webDavError("上传临时备份", upload);

    const digest = await getAndVerify(connection, temporaryName, content);
    const move = await webDavFetch(connection, temporaryUrl, {
      method: "MOVE",
      headers: {
        Destination: finalUrl,
        Overwrite: "T",
      },
    });
    if (![200, 201, 204].includes(move.status)) {
      if (move.status === 405 || move.status === 501) {
        throw new Error("WebDAV 服务不支持 MOVE，无法保证备份原子提交；请使用支持标准 WebDAV MOVE 的目标");
      }
      throw webDavError("原子提交备份", move);
    }

    await getAndVerify(connection, finalName, content);
    return digest;
  } finally {
    await deleteRemoteFileBestEffort(connection, temporaryName);
  }
}

function decodeXml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function xmlTagValue(block: string, tag: string) {
  const expression = new RegExp(`<(?:[A-Za-z0-9_-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${tag}>`, "i");
  return decodeXml(expression.exec(block)?.[1]?.trim() || "");
}

function davEntriesFromPropfind(xml: string, baseUrl: string) {
  const entries: DavEntry[] = [];
  const responsePattern = /<(?:[A-Za-z0-9_-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_-]+:)?response>/gi;
  for (const match of xml.matchAll(responsePattern)) {
    const block = match[1] || "";
    const href = xmlTagValue(block, "href");
    if (!href) continue;
    try {
      const parsed = new URL(href, baseUrl);
      const rawName = parsed.pathname.split("/").filter(Boolean).at(-1) || "";
      const name = decodeURIComponent(rawName);
      if (!name) continue;
      const rawSize = Number(xmlTagValue(block, "getcontentlength"));
      const rawModified = xmlTagValue(block, "getlastmodified");
      const modifiedTimestamp = rawModified ? Date.parse(rawModified) : Number.NaN;
      entries.push({
        name,
        size: Number.isFinite(rawSize) ? rawSize : null,
        modifiedAt: Number.isFinite(modifiedTimestamp) ? new Date(modifiedTimestamp).toISOString() : null,
      });
    } catch {
      // Ignore malformed WebDAV href entries.
    }
  }
  return entries;
}

async function listDavEntries(connection: WebDavConnection) {
  const directory = await ensureRemoteDirectory(connection);
  const response = await webDavFetch(connection, directory, {
    method: "PROPFIND",
    headers: { Depth: "1", "Content-Type": "application/xml; charset=utf-8" },
    body: `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>`,
  });
  if (!response.ok) throw webDavError("读取远端备份列表", response);
  return davEntriesFromPropfind(await response.text(), directory);
}

function readyBackupName(name: string) {
  return name.startsWith("simkeeper-secure-backup-") && name.endsWith(".simkeeper-backup") && !name.endsWith(".uploading");
}

function validateRemoteBackupName(name: string) {
  if (path.basename(name) !== name || !readyBackupName(name)) throw new Error("远端备份文件名不合法");
  return name;
}

function instanceFromRemoteName(name: string) {
  const match = /^simkeeper-secure-backup-([0-9a-f]{8})-\d{8}T/i.exec(name);
  return match?.[1]?.toLowerCase() || null;
}

function createdAtFromRemoteName(name: string) {
  const match = /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})-(\d{3})Z(?=\.simkeeper-backup$)/.exec(name);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${match[7]}Z`;
}

function mapRemoteFile(entry: DavEntry): RemoteBackupFile {
  const ownShort = instanceShortId();
  const fileInstance = instanceFromRemoteName(entry.name);
  return {
    name: entry.name,
    size: entry.size,
    modifiedAt: entry.modifiedAt,
    createdAt: createdAtFromRemoteName(entry.name) || entry.modifiedAt,
    instanceId: fileInstance,
    scope: fileInstance === ownShort ? "current" : fileInstance ? "other" : "legacy",
  };
}

async function listRemoteBackupFiles(connection: WebDavConnection) {
  return (await listDavEntries(connection))
    .filter((entry) => readyBackupName(entry.name))
    .map(mapRemoteFile)
    .sort((a, b) => (b.createdAt || b.modifiedAt || "").localeCompare(a.createdAt || a.modifiedAt || "") || b.name.localeCompare(a.name));
}

async function cleanupStaleUploads(connection: WebDavConnection) {
  const now = Date.now();
  const short = instanceShortId();
  const entries = await listDavEntries(connection);
  for (const entry of entries) {
    if (!entry.name.endsWith(".uploading") || !entry.name.includes(`.${short}.`)) continue;
    const modified = entry.modifiedAt ? Date.parse(entry.modifiedAt) : Number.NaN;
    if (!Number.isFinite(modified) || now - modified < STALE_UPLOAD_MS) continue;
    await deleteRemoteFileBestEffort(connection, entry.name);
  }
}

function isoWeekKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const weekYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

function dateKeyForFile(file: RemoteBackupFile, timezone: string) {
  const value = file.createdAt || file.modifiedAt;
  if (!value) return "";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? getZonedParts(new Date(timestamp), timezone).dateKey : "";
}

function smartRetentionKeepSet(files: RemoteBackupFile[], timezone: string) {
  const keep = new Set<string>();
  const dated = files.filter((file) => dateKeyForFile(file, timezone));

  function keepByBucket(limit: number, bucket: (dateKey: string) => string) {
    const seen = new Set<string>();
    for (const file of dated) {
      const dateKey = dateKeyForFile(file, timezone);
      const key = bucket(dateKey);
      if (seen.has(key)) continue;
      seen.add(key);
      keep.add(file.name);
      if (seen.size >= limit) break;
    }
  }

  keepByBucket(7, (dateKey) => dateKey);
  keepByBucket(4, (dateKey) => isoWeekKey(dateKey));
  keepByBucket(6, (dateKey) => dateKey.slice(0, 7));
  if (files[0]) keep.add(files[0].name);
  return keep;
}

async function pruneRemoteBackups(connection: WebDavConnection, config: StoredConfig) {
  const own = (await listRemoteBackupFiles(connection)).filter((file) => file.scope === "current");
  let toDelete: RemoteBackupFile[];
  if (config.retentionMode === "smart") {
    const keep = smartRetentionKeepSet(own, config.scheduleTimezone);
    toDelete = own.filter((file) => !keep.has(file.name));
  } else {
    toDelete = own.slice(config.retentionCount);
  }

  for (const file of toDelete) {
    const response = await webDavFetch(connection, fileUrl(connection, file.name), { method: "DELETE" });
    if (![200, 202, 204, 404].includes(response.status)) throw webDavError("清理旧备份", response);
  }
  return { removed: toDelete.length, retained: own.length - toDelete.length };
}

function resolveSavedConnection(config = readStoredConfig()): WebDavConnection {
  const endpoint = normalizeEndpoint(config.endpoint);
  const passwordEncrypted = readSetting(PASSWORD_SETTING_KEY);
  const password = passwordEncrypted ? decryptRemoteBackupPassword(passwordEncrypted) : "";
  if (config.username && !password) throw new Error("WebDAV 密码尚未配置");
  return {
    endpoint,
    remotePath: normalizeRemotePath(config.remotePath),
    username: config.username,
    password,
  };
}

function resolveInputConnection(input: RemoteBackupConnectionInput, allowSavedPassword = false): WebDavConnection {
  const current = readStoredConfig();
  const endpoint = normalizeEndpoint(input.endpoint);
  const remotePath = normalizeRemotePath(input.remotePath);
  const username = input.username.trim().slice(0, 512);
  let password = typeof input.password === "string" ? input.password : "";
  if (!password && allowSavedPassword && endpoint === current.endpoint && username === current.username) {
    const encrypted = readSetting(PASSWORD_SETTING_KEY);
    if (encrypted) password = decryptRemoteBackupPassword(encrypted);
  }
  if (username && !password) throw new Error("请输入 WebDAV 密码");
  return { endpoint, remotePath, username, password };
}

export async function testRemoteBackupConnection(input: RemoteBackupConnectionInput) {
  const connection = resolveInputConnection(input, true);
  await ensureRemoteDirectory(connection);
  const probeBase = `.simkeeper-write-test-${crypto.randomBytes(8).toString("hex")}`;
  const finalName = `${probeBase}.done`;
  const probe = Buffer.from(`SIMKeeper WebDAV atomic write test ${new Date().toISOString()}`, "utf8");
  await putAndVerifyAtomic(connection, finalName, probe);
  const remove = await webDavFetch(connection, fileUrl(connection, finalName), { method: "DELETE" });
  if (![200, 202, 204, 404].includes(remove.status)) throw webDavError("清理测试文件", remove);
  return { ok: true, remotePath: connection.remotePath, atomicMove: true };
}

function insertRun(trigger: RemoteBackupTrigger, startedAt: string) {
  const result = sqlite.prepare(
    `INSERT INTO remote_backup_runs (trigger, status, started_at)
     VALUES (?, 'running', ?)`,
  ).run(trigger, startedAt);
  return Number(result.lastInsertRowid);
}

function finishRun(
  id: number,
  status: Exclude<RemoteBackupRunStatus, "running">,
  values: { completedAt: string; localBackupName?: string; remoteName?: string; size?: number; error?: string },
) {
  sqlite.prepare(
    `UPDATE remote_backup_runs
     SET status = ?, completed_at = ?, local_backup_name = ?, remote_name = ?, size = ?, error = ?
     WHERE id = ?`,
  ).run(
    status,
    values.completedAt,
    values.localBackupName ?? null,
    values.remoteName ?? null,
    values.size ?? null,
    values.error ?? null,
    id,
  );
}

export function listRemoteBackupRuns(limit = 12): RemoteBackupRun[] {
  const normalizedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  return (sqlite.prepare(
    `SELECT id, trigger, status, started_at, completed_at, local_backup_name, remote_name, size, error
     FROM remote_backup_runs
     ORDER BY started_at DESC, id DESC
     LIMIT ?`,
  ).all(normalizedLimit) as Array<{
    id: number;
    trigger: RemoteBackupTrigger;
    status: RemoteBackupRunStatus;
    started_at: string;
    completed_at: string | null;
    local_backup_name: string | null;
    remote_name: string | null;
    size: number | null;
    error: string | null;
  }>).map((row) => ({
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    localBackupName: row.local_backup_name,
    remoteName: row.remote_name,
    size: row.size,
    error: row.error,
  }));
}

export function getRemoteBackupOverview() {
  return { config: getRemoteBackupConfig(), runs: listRemoteBackupRuns() };
}

function localSnapshotFilename(payload: BackupPayload) {
  const stamp = payload.createdAt.replace(/[-:]/g, "").replace(".", "-");
  const reason = payload.reason.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 32) || "manual";
  return `simkeeper-backup-${reason}-${stamp}.json`;
}

function writeLocalSnapshot(payload: BackupPayload) {
  const directory = path.join(dataDir, "backups");
  fs.mkdirSync(directory, { recursive: true });
  const name = localSnapshotFilename(payload);
  const destination = path.join(directory, name);
  const temporary = `${destination}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(payload, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, destination);
  try {
    fs.chmodSync(destination, 0o600);
  } catch {
    // Best effort on filesystems that do not support POSIX modes.
  }
  pruneLocalBackups(getBackupRetention());
  return { name, size: fs.statSync(destination).size };
}

function captureConsistentSnapshot(reason: string) {
  const capture = sqlite.transaction(() => createBackupPayload(reason));
  return capture();
}

function scopedRemoteName(createdAt: string) {
  const stamp = createdAt.replace(/[-:]/g, "").replace(".", "-");
  return `simkeeper-secure-backup-${instanceShortId()}-${stamp}.simkeeper-backup`;
}

function classifyFailure(message: string): RemoteBackupPauseReason | "transient" {
  if (message.includes("HTTP 401") || message.includes("用户名或密码错误")) return "auth";
  if (message.includes("HTTP 403") || message.includes("没有所需权限")) return "permission";
  return "transient";
}

function retryDelay(failures: number) {
  return RETRY_BACKOFF_MS[Math.min(Math.max(0, failures - 1), RETRY_BACKOFF_MS.length - 1)];
}

async function sendBackupSystemNotification(eventKey: string, title: string, message: string) {
  try {
    const { dispatchSystemNotification } = await import("@/lib/system-notifications");
    await dispatchSystemNotification({ eventKey, title, message });
  } catch (error) {
    console.warn("[SIMKeeper] remote backup system notification failed", error);
  }
}

function notifyFailureIfNeeded(config: StoredConfig, status: StoredStatus, category: RemoteBackupPauseReason | "transient") {
  if (!config.notifyFailures || !status.failureEpisodeStartedAt) return;
  const milestone = category === "auth" || category === "permission"
    ? "blocked"
    : status.consecutiveFailures === 1
      ? "first"
      : status.consecutiveFailures === 3
        ? "persistent"
        : "";
  if (!milestone) return;
  const title = category === "auth"
    ? "SIMKeeper 异地备份凭据失效"
    : category === "permission"
      ? "SIMKeeper 异地备份权限不足"
      : status.consecutiveFailures >= 3
        ? `SIMKeeper 异地备份连续失败 ${status.consecutiveFailures} 次`
        : "SIMKeeper 异地备份失败";
  const detail = `${status.lastError || "异地备份失败"}\n请前往 设置 → 备份与恢复 检查。`;
  void sendBackupSystemNotification(`remote-backup:${status.failureEpisodeStartedAt}:${milestone}`, title, detail);
}

function notifyRecoveryIfNeeded(config: StoredConfig, episode: string | null, completedAt: string) {
  if (!config.notifyFailures || !episode) return;
  void sendBackupSystemNotification(
    `remote-backup:${episode}:recovered`,
    "SIMKeeper 异地备份已恢复",
    `异地备份已于 ${completedAt} 再次成功完成并通过远端回读校验。`,
  );
}

let activeRun: Promise<RemoteBackupRunResult> | null = null;

async function performRemoteBackup(trigger: RemoteBackupTrigger): Promise<RemoteBackupRunResult> {
  const config = readStoredConfig();
  if (!config.endpoint) throw new Error("WebDAV 地址尚未配置");
  const passphraseEncrypted = readSetting(PASSPHRASE_SETTING_KEY);
  if (!passphraseEncrypted) throw new Error("自动异地备份口令尚未配置");

  const connection = resolveSavedConnection(config);
  const passphrase = decryptRemoteBackupPassphrase(passphraseEncrypted);
  validateBackupPassphrase(passphrase);

  const startedAt = new Date().toISOString();
  const runId = insertRun(trigger, startedAt);
  const statusBefore = readStoredStatus();
  writeStatus({ ...statusBefore, lastAttemptAt: startedAt, lastError: null });

  let localBackupName: string | undefined;
  try {
    await cleanupStaleUploads(connection).catch((error) => {
      console.warn("[SIMKeeper] stale remote upload cleanup failed", error);
    });

    // One SQLite read transaction produces one payload. The local JSON and the
    // encrypted WebDAV object are derived from exactly the same snapshot.
    const payload = captureConsistentSnapshot(`remote-${trigger}`);
    const local = writeLocalSnapshot(payload);
    localBackupName = local.name;

    const encrypted = encryptPortableBackup(
      payload,
      { appVersion: payload.appVersion, createdAt: payload.createdAt },
      passphrase,
    );
    const content = Buffer.from(JSON.stringify(encrypted), "utf8");
    const remoteName = scopedRemoteName(payload.createdAt);
    const digest = await putAndVerifyAtomic(connection, remoteName, content);

    let retentionWarning: string | null = null;
    try {
      await pruneRemoteBackups(connection, config);
    } catch (error) {
      retentionWarning = error instanceof Error ? error.message : "远端旧备份清理失败";
      console.warn("[SIMKeeper] remote backup retention cleanup failed", error);
    }

    const completedAt = new Date().toISOString();
    const now = new Date(completedAt);
    const episode = statusBefore.failureEpisodeStartedAt;
    let nextRunAt = statusBefore.nextRunAt;
    if (trigger === "scheduled" || (nextRunAt && Date.parse(nextRunAt) <= now.getTime())) {
      nextRunAt = nextScheduledInstant(config, now).toISOString();
    }

    finishRun(runId, "success", {
      completedAt,
      localBackupName,
      remoteName,
      size: content.length,
    });
    writeStatus({
      lastAttemptAt: startedAt,
      lastSuccessAt: completedAt,
      lastScheduledSuccessAt: trigger === "scheduled" ? completedAt : statusBefore.lastScheduledSuccessAt,
      lastError: null,
      lastRemoteName: remoteName,
      lastRemoteSize: content.length,
      lastRemoteDigest: digest,
      lastRetentionWarning: retentionWarning,
      nextRunAt,
      nextRetryAt: null,
      consecutiveFailures: 0,
      pausedReason: null,
      failureEpisodeStartedAt: null,
    });

    notifyRecoveryIfNeeded(config, episode, completedAt);
    if (retentionWarning && config.notifyFailures) {
      void sendBackupSystemNotification(
        `remote-backup-retention:${completedAt}`,
        "SIMKeeper 远端备份清理需要检查",
        `${retentionWarning}\n新的加密备份已经成功保存并验证，但旧备份自动清理未完整完成。`,
      );
    }

    return {
      runId,
      trigger,
      localBackupName,
      remoteName,
      size: content.length,
      digest,
      retentionWarning,
      completedAt,
    };
  } catch (error) {
    const message = (error instanceof Error ? error.message : "异地备份失败").slice(0, 2000);
    const completedAt = new Date().toISOString();
    const category = classifyFailure(message);
    const failures = statusBefore.consecutiveFailures + 1;
    const episode = statusBefore.failureEpisodeStartedAt || startedAt;
    const pausedReason = category === "auth" || category === "permission" ? category : null;
    const nextRetryAt = config.enabled && !pausedReason
      ? new Date(Date.now() + retryDelay(failures)).toISOString()
      : null;

    finishRun(runId, "failed", { completedAt, localBackupName, error: message });
    const failedStatus: StoredStatus = {
      ...statusBefore,
      lastAttemptAt: startedAt,
      lastError: message,
      nextRetryAt,
      consecutiveFailures: failures,
      pausedReason,
      failureEpisodeStartedAt: episode,
    };
    writeStatus(failedStatus);
    notifyFailureIfNeeded(config, failedStatus, category);
    throw new Error(message);
  }
}

export function runRemoteBackup(trigger: RemoteBackupTrigger = "manual") {
  if (activeRun) return activeRun;
  activeRun = performRemoteBackup(trigger).finally(() => {
    activeRun = null;
  });
  return activeRun;
}

function ensureScheduleState(now = new Date()) {
  const config = readStoredConfig();
  if (!config.enabled) return;
  if (restorePauseState().pending) return;
  const status = readStoredStatus();
  if (status.nextRunAt) return;
  writeStatus({ ...status, nextRunAt: initialScheduleInstant(config, status, now).toISOString() });
}

export function remoteBackupIsDue(now = new Date()) {
  const config = readStoredConfig();
  if (!config.enabled || !config.endpoint || restorePauseState().pending) return false;
  if (!readSetting(PASSPHRASE_SETTING_KEY)) return false;
  if (config.username && !readSetting(PASSWORD_SETTING_KEY)) return false;

  ensureScheduleState(now);
  const status = readStoredStatus();
  if (status.pausedReason) return false;

  const retryAt = status.nextRetryAt ? Date.parse(status.nextRetryAt) : Number.NaN;
  if (Number.isFinite(retryAt)) return now.getTime() >= retryAt;

  const nextAt = status.nextRunAt ? Date.parse(status.nextRunAt) : Number.NaN;
  return Number.isFinite(nextAt) && now.getTime() >= nextAt;
}

async function runDueRemoteBackup() {
  if (!remoteBackupIsDue()) return;
  try {
    await runRemoteBackup("scheduled");
  } catch (error) {
    console.error("[SIMKeeper] scheduled remote backup failed", error);
  }
}

let schedulerStarted = false;
let schedulerTimer: ReturnType<typeof setTimeout> | null = null;

function armRemoteBackupScheduler(delay = SCHEDULER_SCAN_MS) {
  if (!schedulerStarted) return;
  if (schedulerTimer) clearTimeout(schedulerTimer);
  schedulerTimer = setTimeout(() => {
    void runDueRemoteBackup().finally(() => armRemoteBackupScheduler());
  }, delay);
  schedulerTimer.unref?.();
}

export function rescheduleRemoteBackupScheduler() {
  ensureScheduleState();
  armRemoteBackupScheduler(1000);
}

export function startRemoteBackupScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  ensureScheduleState();
  armRemoteBackupScheduler(SCHEDULER_INITIAL_DELAY_MS);
}

async function downloadRemoteBackup(connection: WebDavConnection, name: string) {
  validateRemoteBackupName(name);
  const response = await webDavFetch(connection, fileUrl(connection, name), { method: "GET" });
  if (!response.ok) throw webDavError("下载远端备份", response);
  return Buffer.from(await response.arrayBuffer());
}

async function inspectWithConnection(connection: WebDavConnection, name: string, passphrase: string): Promise<RemoteBackupInspection> {
  validateBackupPassphrase(passphrase);
  const files = await listRemoteBackupFiles(connection);
  const file = files.find((candidate) => candidate.name === name);
  if (!file) throw new Error("远端备份不存在");
  const content = await downloadRemoteBackup(connection, name);
  let encoded: unknown;
  try {
    encoded = JSON.parse(content.toString("utf8")) as unknown;
  } catch {
    throw new Error("远端备份不是有效的 SIMKeeper 加密备份文件");
  }
  const parsed = parseBackupInput(encoded, passphrase);
  return {
    file,
    digest: sha256(content),
    summary: getBackupSummary(parsed.payload, parsed.encrypted),
  };
}

function pauseRestoredRemoteBackupSchedule() {
  const raw = parseObject(readSetting(CONFIG_SETTING_KEY));
  if (!Object.keys(raw).length) return false;
  const wasEnabled = raw.enabled === true;
  raw.enabled = false;
  writeSetting(CONFIG_SETTING_KEY, JSON.stringify(raw));
  writeSetting(RESTORE_PAUSE_SETTING_KEY, JSON.stringify({
    pending: true,
    restoredAt: new Date().toISOString(),
    wasEnabled,
  }));
  const status = readStoredStatus();
  writeStatus({
    ...status,
    nextRunAt: null,
    nextRetryAt: null,
    pausedReason: null,
    consecutiveFailures: 0,
    failureEpisodeStartedAt: null,
  });
  return true;
}

async function restoreWithConnection(connection: WebDavConnection, name: string, passphrase: string): Promise<RemoteBackupRestoreResult> {
  const inspection = await inspectWithConnection(connection, name, passphrase);
  const content = await downloadRemoteBackup(connection, name);
  const encoded = JSON.parse(content.toString("utf8")) as unknown;
  const restored = restoreBackupInput(encoded, passphrase);
  const remoteSchedulePaused = pauseRestoredRemoteBackupSchedule();
  return {
    file: inspection.file,
    digest: inspection.digest,
    restored: getBackupSummary(restored.payload, restored.encrypted),
    safetyBackup: restored.safetyBackup,
    remoteSchedulePaused,
  };
}

export async function listSavedRemoteBackups() {
  return listRemoteBackupFiles(resolveSavedConnection());
}

export async function inspectSavedRemoteBackup(name: string, passphrase: string) {
  return inspectWithConnection(resolveSavedConnection(), name, passphrase);
}

export async function restoreSavedRemoteBackup(name: string, passphrase: string) {
  return restoreWithConnection(resolveSavedConnection(), name, passphrase);
}

export async function listRemoteBackupsFromInput(input: RemoteBackupConnectionInput) {
  return listRemoteBackupFiles(resolveInputConnection(input, false));
}

export async function inspectRemoteBackupFromInput(input: RemoteBackupConnectionInput, name: string, passphrase: string) {
  return inspectWithConnection(resolveInputConnection(input, false), name, passphrase);
}

export async function restoreRemoteBackupFromInput(input: RemoteBackupConnectionInput, name: string, passphrase: string) {
  return restoreWithConnection(resolveInputConnection(input, false), name, passphrase);
}

function endpointLabel(endpoint: string) {
  try {
    return new URL(endpoint).host;
  } catch {
    return "WebDAV";
  }
}

export function getRemoteBackupAttentionItems(now = new Date()): AttentionItem[] {
  const config = getRemoteBackupConfig();
  const base = {
    source: "backup" as const,
    kind: "backup_health" as const,
    kindLabel: "异地备份",
    subjectType: "system" as const,
    subjectId: null,
    subjectLabel: "自动异地备份",
    subjectMeta: config.endpoint ? `${endpointLabel(config.endpoint)} · ${config.remotePath}` : "WebDAV",
    dueDate: null,
    href: "/settings/backup#remote-backup",
    actionLabel: "检查备份",
    reminderKey: null,
    canSnooze: false,
    canIgnore: false,
  };

  if (config.restorePaused) {
    return [{
      ...base,
      key: `backup:restore-paused:${config.restorePausedAt || "pending"}`,
      priority: "attention",
      priorityLabel: "优先处理",
      section: "now",
      title: "恢复后的自动备份尚未重新确认",
      detail: "为避免恢复实例和原实例同时清理同一远端目录，自动调度已暂停。请测试 WebDAV 后手动重新启用。",
      relativeLabel: "等待确认",
      status: "restore_paused",
      statusLabel: "已暂停",
    }];
  }

  if (!config.enabled) return [];

  if (config.pausedReason) {
    return [{
      ...base,
      key: `backup:blocked:${config.failureEpisodeStartedAt || config.lastAttemptAt || "current"}`,
      priority: "critical",
      priorityLabel: "需要立即处理",
      section: "now",
      title: config.pausedReason === "auth" ? "WebDAV 凭据已失效" : "WebDAV 权限不足",
      detail: config.lastError || "自动异地备份已暂停重试，需要更新 WebDAV 凭据或权限。",
      relativeLabel: "自动重试已暂停",
      status: "blocked",
      statusLabel: "需要处理",
    }];
  }

  if (config.consecutiveFailures > 0) {
    const critical = config.consecutiveFailures >= 3;
    return [{
      ...base,
      key: `backup:failed:${config.failureEpisodeStartedAt || config.lastAttemptAt || "current"}`,
      priority: critical ? "critical" : "attention",
      priorityLabel: critical ? "需要立即处理" : "优先处理",
      section: "now",
      title: `异地备份连续失败 ${config.consecutiveFailures} 次`,
      detail: config.lastError || "自动异地备份失败，SIMKeeper 已进入退避重试。",
      relativeLabel: config.nextRetryAt ? `将于 ${new Date(config.nextRetryAt).toLocaleString("zh-CN")} 重试` : "等待重试",
      status: "failed",
      statusLabel: "备份失败",
    }];
  }

  if (config.lastRetentionWarning) {
    return [{
      ...base,
      key: `backup:retention:${config.lastSuccessAt || "current"}`,
      priority: "watch",
      priorityLabel: "近期关注",
      section: "soon",
      title: "远端旧备份清理未完整完成",
      detail: config.lastRetentionWarning,
      relativeLabel: "新备份已安全保存",
      status: "retention_warning",
      statusLabel: "清理异常",
    }];
  }

  if (config.nextRunAt) {
    const next = Date.parse(config.nextRunAt);
    if (Number.isFinite(next) && now.getTime() - next > 6 * 60 * 60_000) {
      return [{
        ...base,
        key: `backup:overdue:${config.nextRunAt}`,
        priority: "attention",
        priorityLabel: "优先处理",
        section: "now",
        title: "计划异地备份已明显延迟",
        detail: `计划执行时间为 ${config.nextRunAt}，但尚未记录成功结果。请检查调度器和 WebDAV 状态。`,
        relativeLabel: "计划已延迟",
        status: "overdue",
        statusLabel: "调度异常",
      }];
    }
  }

  return [];
}
