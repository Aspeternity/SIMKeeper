import "server-only";

import crypto from "node:crypto";
import { sqlite } from "@/db";
import { validateBackupPassphrase } from "@/lib/backup-security";
import { createEncryptedPortableBackup, createLocalBackup } from "@/lib/backups";
import {
  decryptRemoteBackupPassphrase,
  decryptRemoteBackupPassword,
  encryptRemoteBackupPassphrase,
  encryptRemoteBackupPassword,
} from "@/lib/credential-crypto";

export const REMOTE_BACKUP_PROVIDER = "webdav" as const;
export type RemoteBackupScheduleFrequency = "daily" | "weekly";
export type RemoteBackupTrigger = "manual" | "scheduled";
export type RemoteBackupRunStatus = "running" | "success" | "failed";

const CONFIG_SETTING_KEY = "remote_backup_config_v1";
const STATUS_SETTING_KEY = "remote_backup_status_v1";
const PASSWORD_SETTING_KEY = "remote_backup_webdav_password_v1";
const PASSPHRASE_SETTING_KEY = "remote_backup_passphrase_v1";
const REQUEST_TIMEOUT_MS = 20_000;
const SCHEDULER_SCAN_MS = 60_000;
const SCHEDULER_INITIAL_DELAY_MS = 15_000;
const FAILED_RETRY_MS = 60 * 60_000;

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
  retentionCount: 14,
};

const DEFAULT_STATUS = {
  lastAttemptAt: null as string | null,
  lastSuccessAt: null as string | null,
  lastError: null as string | null,
  lastRemoteName: null as string | null,
  lastRemoteSize: null as number | null,
};

type StoredConfig = typeof DEFAULT_CONFIG;
type StoredStatus = typeof DEFAULT_STATUS;

export type RemoteBackupPublicConfig = StoredConfig & StoredStatus & {
  passwordConfigured: boolean;
  passphraseConfigured: boolean;
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
  retentionCount: number;
};

export type TestRemoteBackupInput = {
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
  retentionWarning: string | null;
  completedAt: string;
};

type WebDavConnection = {
  endpoint: string;
  remotePath: string;
  username: string;
  password: string;
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

function readStoredConfig(): StoredConfig {
  const raw = parseObject(readSetting(CONFIG_SETTING_KEY));
  return {
    provider: REMOTE_BACKUP_PROVIDER,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_CONFIG.enabled,
    endpoint: typeof raw.endpoint === "string" ? raw.endpoint : DEFAULT_CONFIG.endpoint,
    remotePath: typeof raw.remotePath === "string" ? raw.remotePath : DEFAULT_CONFIG.remotePath,
    username: typeof raw.username === "string" ? raw.username : DEFAULT_CONFIG.username,
    scheduleFrequency: raw.scheduleFrequency === "weekly" ? "weekly" : "daily",
    scheduleWeekday: typeof raw.scheduleWeekday === "number" && Number.isInteger(raw.scheduleWeekday)
      ? raw.scheduleWeekday
      : DEFAULT_CONFIG.scheduleWeekday,
    scheduleHour: typeof raw.scheduleHour === "number" && Number.isInteger(raw.scheduleHour)
      ? raw.scheduleHour
      : DEFAULT_CONFIG.scheduleHour,
    scheduleMinute: typeof raw.scheduleMinute === "number" && Number.isInteger(raw.scheduleMinute)
      ? raw.scheduleMinute
      : DEFAULT_CONFIG.scheduleMinute,
    scheduleTimezone: typeof raw.scheduleTimezone === "string" ? raw.scheduleTimezone : DEFAULT_CONFIG.scheduleTimezone,
    retentionCount: typeof raw.retentionCount === "number" && Number.isInteger(raw.retentionCount)
      ? raw.retentionCount
      : DEFAULT_CONFIG.retentionCount,
  };
}

function readStoredStatus(): StoredStatus {
  const raw = parseObject(readSetting(STATUS_SETTING_KEY));
  return {
    lastAttemptAt: typeof raw.lastAttemptAt === "string" ? raw.lastAttemptAt : null,
    lastSuccessAt: typeof raw.lastSuccessAt === "string" ? raw.lastSuccessAt : null,
    lastError: typeof raw.lastError === "string" ? raw.lastError : null,
    lastRemoteName: typeof raw.lastRemoteName === "string" ? raw.lastRemoteName : null,
    lastRemoteSize: typeof raw.lastRemoteSize === "number" && Number.isFinite(raw.lastRemoteSize)
      ? raw.lastRemoteSize
      : null,
  };
}

function writeStatus(status: StoredStatus) {
  writeSetting(STATUS_SETTING_KEY, JSON.stringify(status));
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
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label}设置不正确`);
  }
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
    retentionCount: validateRetention(input.retentionCount),
  };
}

export function getRemoteBackupConfig(): RemoteBackupPublicConfig {
  const config = readStoredConfig();
  const status = readStoredStatus();
  return {
    ...config,
    ...status,
    passwordConfigured: Boolean(readSetting(PASSWORD_SETTING_KEY)),
    passphraseConfigured: Boolean(readSetting(PASSPHRASE_SETTING_KEY)),
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

  const save = sqlite.transaction(() => {
    writeSetting(CONFIG_SETTING_KEY, JSON.stringify(config));
    writeSetting(PASSWORD_SETTING_KEY, passwordEncrypted);
    writeSetting(PASSPHRASE_SETTING_KEY, passphraseEncrypted);
  });
  save();
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

async function putAndVerify(connection: WebDavConnection, name: string, content: Buffer) {
  await ensureRemoteDirectory(connection);
  const target = fileUrl(connection, name);
  const upload = await webDavFetch(connection, target, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array(content),
  });
  if (![200, 201, 204].includes(upload.status)) throw webDavError("上传备份", upload);

  const download = await webDavFetch(connection, target, { method: "GET" });
  if (!download.ok) throw webDavError("回读校验", download);
  const remote = Buffer.from(await download.arrayBuffer());
  const localDigest = crypto.createHash("sha256").update(content).digest("hex");
  const remoteDigest = crypto.createHash("sha256").update(remote).digest("hex");
  if (remote.length !== content.length || localDigest !== remoteDigest) {
    throw new Error("WebDAV 上传后的回读校验失败；远端文件与本地加密备份不一致");
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

function remoteBackupNamesFromPropfind(xml: string, baseUrl: string) {
  const names = new Set<string>();
  const hrefPattern = /<(?:[A-Za-z0-9_-]+:)?href\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_-]+:)?href>/gi;
  for (const match of xml.matchAll(hrefPattern)) {
    const href = decodeXml(match[1]?.trim() || "");
    if (!href) continue;
    try {
      const parsed = new URL(href, baseUrl);
      const rawName = parsed.pathname.split("/").filter(Boolean).at(-1) || "";
      const name = decodeURIComponent(rawName);
      if (name.startsWith("simkeeper-secure-backup-") && name.endsWith(".simkeeper-backup")) {
        names.add(name);
      }
    } catch {
      // Ignore malformed href entries from a WebDAV listing.
    }
  }
  return [...names].sort().reverse();
}

async function listRemoteBackupNames(connection: WebDavConnection) {
  const directory = await ensureRemoteDirectory(connection);
  const response = await webDavFetch(connection, directory, {
    method: "PROPFIND",
    headers: {
      Depth: "1",
      "Content-Type": "application/xml; charset=utf-8",
    },
    body: `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/></d:prop></d:propfind>`,
  });
  if (!response.ok) throw webDavError("读取远端备份列表", response);
  return remoteBackupNamesFromPropfind(await response.text(), directory);
}

async function pruneRemoteBackups(connection: WebDavConnection, retentionCount: number) {
  const names = await listRemoteBackupNames(connection);
  for (const name of names.slice(retentionCount)) {
    const response = await webDavFetch(connection, fileUrl(connection, name), { method: "DELETE" });
    if (![200, 202, 204, 404].includes(response.status)) throw webDavError("清理旧备份", response);
  }
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

export async function testRemoteBackupConnection(input: TestRemoteBackupInput) {
  const current = readStoredConfig();
  const endpoint = normalizeEndpoint(input.endpoint);
  const remotePath = normalizeRemotePath(input.remotePath);
  const username = input.username.trim().slice(0, 512);
  let password = typeof input.password === "string" ? input.password : "";
  if (!password && endpoint === current.endpoint && username === current.username) {
    const encrypted = readSetting(PASSWORD_SETTING_KEY);
    if (encrypted) password = decryptRemoteBackupPassword(encrypted);
  }
  if (username && !password) throw new Error("请输入 WebDAV 密码后再测试连接");

  const connection = { endpoint, remotePath, username, password };
  await ensureRemoteDirectory(connection);
  const probeName = `.simkeeper-write-test-${crypto.randomBytes(8).toString("hex")}.txt`;
  const probe = Buffer.from(`SIMKeeper WebDAV write test ${new Date().toISOString()}`, "utf8");
  await putAndVerify(connection, probeName, probe);
  const remove = await webDavFetch(connection, fileUrl(connection, probeName), { method: "DELETE" });
  if (![200, 202, 204, 404].includes(remove.status)) throw webDavError("清理测试文件", remove);
  return { ok: true, remotePath };
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
  return {
    config: getRemoteBackupConfig(),
    runs: listRemoteBackupRuns(),
  };
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
  writeStatus({ ...readStoredStatus(), lastAttemptAt: startedAt, lastError: null });

  let localBackupName: string | undefined;
  try {
    const local = createLocalBackup(`remote-${trigger}`);
    localBackupName = local.name;

    const portable = createEncryptedPortableBackup(passphrase);
    const content = Buffer.from(JSON.stringify(portable.encrypted), "utf8");
    await putAndVerify(connection, portable.name, content);

    let retentionWarning: string | null = null;
    try {
      await pruneRemoteBackups(connection, config.retentionCount);
    } catch (error) {
      retentionWarning = error instanceof Error ? error.message : "远端旧备份清理失败";
      console.warn("[SIMKeeper] remote backup retention cleanup failed", error);
    }

    const completedAt = new Date().toISOString();
    finishRun(runId, "success", {
      completedAt,
      localBackupName,
      remoteName: portable.name,
      size: content.length,
    });
    writeStatus({
      lastAttemptAt: startedAt,
      lastSuccessAt: completedAt,
      lastError: null,
      lastRemoteName: portable.name,
      lastRemoteSize: content.length,
    });
    return {
      runId,
      trigger,
      localBackupName,
      remoteName: portable.name,
      size: content.length,
      retentionWarning,
      completedAt,
    };
  } catch (error) {
    const message = (error instanceof Error ? error.message : "异地备份失败").slice(0, 2000);
    const completedAt = new Date().toISOString();
    finishRun(runId, "failed", { completedAt, localBackupName, error: message });
    writeStatus({ ...readStoredStatus(), lastAttemptAt: startedAt, lastError: message });
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

type ZonedParts = {
  dateKey: string;
  weekday: number;
  hour: number;
  minute: number;
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
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: weekdays[parts.weekday] ?? 0,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function zonedDateKey(value: string | null, timezone: string) {
  if (!value) return "";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  return getZonedParts(new Date(timestamp), timezone).dateKey;
}

export function remoteBackupIsDue(now = new Date()) {
  const config = readStoredConfig();
  if (!config.enabled || !config.endpoint) return false;
  if (!readSetting(PASSPHRASE_SETTING_KEY)) return false;
  if (config.username && !readSetting(PASSWORD_SETTING_KEY)) return false;

  const status = readStoredStatus();
  const local = getZonedParts(now, config.scheduleTimezone);
  if (config.scheduleFrequency === "weekly" && local.weekday !== config.scheduleWeekday) return false;
  if (local.hour * 60 + local.minute < config.scheduleHour * 60 + config.scheduleMinute) return false;
  if (zonedDateKey(status.lastSuccessAt, config.scheduleTimezone) === local.dateKey) return false;

  const lastAttempt = status.lastAttemptAt ? Date.parse(status.lastAttemptAt) : Number.NaN;
  if (
    zonedDateKey(status.lastAttemptAt, config.scheduleTimezone) === local.dateKey
    && Number.isFinite(lastAttempt)
    && now.getTime() - lastAttempt < FAILED_RETRY_MS
  ) {
    return false;
  }
  return true;
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
  armRemoteBackupScheduler(1000);
}

export function startRemoteBackupScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  armRemoteBackupScheduler(SCHEDULER_INITIAL_DELAY_MS);
}
