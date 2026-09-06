import "server-only";

import type {
  CarrierConnectorProvider,
  CarrierConnectorSimContext,
  ConnectorAccountStatus,
  NormalizedCarrierSyncResult,
} from "@/lib/carrier-connectors/types";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 12_000;
const FORBIDDEN_REQUEST_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "transfer-encoding",
  "upgrade",
  "proxy-authorization",
  "proxy-authenticate",
]);

const BALANCE_KEYS = new Set([
  "balance",
  "loadbalance",
  "mainbalance",
  "availablebalance",
  "currentbalance",
  "remainingbalance",
  "regularloadbalance",
  "accountbalance",
]);

const CURRENCY_KEYS = new Set(["currency", "currencycode", "ccy"]);
const VALIDITY_KEYS = new Set([
  "balancevaliduntil",
  "loadbalancevaliduntil",
  "loadbalancevalidity",
  "balanceexpirydate",
  "balanceexpirationdate",
  "loadexpirydate",
  "loadexpirationdate",
]);
const STATUS_KEYS = new Set(["accountstatus", "servicestatus", "subscriberstatus", "simstatus"]);

type LocatedValue = {
  value: unknown;
  path: string;
};

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stringConfig(config: Record<string, unknown>, key: string) {
  return typeof config[key] === "string" ? config[key].trim() : "";
}

function validateDitoUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DITO 请求 URL 无效");
  }

  if (url.protocol !== "https:") {
    throw new Error("DITO Provider 只允许访问 HTTPS 地址");
  }
  if (url.username || url.password) {
    throw new Error("DITO 请求 URL 不能包含用户名或密码");
  }
  if (url.port && url.port !== "443") {
    throw new Error("DITO Provider 只允许标准 HTTPS 端口");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname !== "dito.ph" && !hostname.endsWith(".dito.ph")) {
    throw new Error("DITO Provider 只允许访问 dito.ph 官方域名");
  }
  return url;
}

function interpolationVariables(sim: CarrierConnectorSimContext) {
  const e164 = sim.phoneNumber || "";
  const digits = e164.replace(/\D/g, "");
  const localNumber = e164.startsWith("+63") ? `0${e164.slice(3)}` : e164;
  return {
    phoneNumber: e164,
    e164,
    msisdn: digits,
    localNumber,
    simLabel: sim.label,
  };
}

function interpolate(value: string, sim: CarrierConnectorSimContext) {
  const variables = interpolationVariables(sim);
  return value.replace(/\{\{\s*(phoneNumber|e164|msisdn|localNumber|simLabel)\s*\}\}/g, (_match, key: keyof typeof variables) => variables[key]);
}

function parseRequestHeaders(raw: string, sim: CarrierConnectorSimContext) {
  if (!raw.trim()) return new Headers();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("MyDITO 请求头必须是 JSON 对象，例如 {\"Authorization\":\"Bearer …\"}");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("MyDITO 请求头必须是 JSON 对象");
  }

  const headers = new Headers();
  for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
    const normalizedName = name.trim().toLowerCase();
    if (!normalizedName || normalizedName.startsWith(":")) continue;
    if (FORBIDDEN_REQUEST_HEADERS.has(normalizedName)) continue;
    if (typeof value !== "string") {
      throw new Error(`MyDITO 请求头 ${name} 必须是字符串`);
    }
    headers.set(name, interpolate(value, sim));
  }
  return headers;
}

function readPath(root: unknown, path: string): unknown {
  const normalized = path
    .trim()
    .replace(/^\$\.?/, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/^\./, "");
  if (!normalized) return root;

  let current: unknown = root;
  for (const segment of normalized.split(".").filter(Boolean)) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index];
      continue;
    }
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function findCandidate(root: unknown, keys: Set<string>): LocatedValue | null {
  const queue: Array<{ value: unknown; path: string; depth: number }> = [{ value: root, path: "", depth: 0 }];
  const seen = new Set<object>();
  let visited = 0;

  while (queue.length && visited < 2500) {
    const item = queue.shift()!;
    visited += 1;
    if (!item.value || typeof item.value !== "object" || item.depth > 12) continue;
    if (seen.has(item.value as object)) continue;
    seen.add(item.value as object);

    const entries = Array.isArray(item.value)
      ? item.value.map((value, index) => [String(index), value] as const)
      : Object.entries(item.value as Record<string, unknown>);

    for (const [key, value] of entries) {
      const path = item.path ? `${item.path}.${key}` : key;
      if (!Array.isArray(item.value) && keys.has(normalizeKey(key))) {
        return { value, path };
      }
      if (value && typeof value === "object") {
        queue.push({ value, path, depth: item.depth + 1 });
      }
    }
  }
  return null;
}

function configuredOrCandidate(root: unknown, configuredPath: string, candidates: Set<string>) {
  if (configuredPath) {
    const value = readPath(root, configuredPath);
    if (value === undefined) {
      throw new Error(`DITO 响应中找不到 JSON 路径：${configuredPath}`);
    }
    return { value, path: configuredPath } satisfies LocatedValue;
  }
  return findCandidate(root, candidates);
}

function objectField(value: unknown, names: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(record)) {
    if (names.includes(normalizeKey(key))) return item;
  }
  return undefined;
}

function parseBalance(value: unknown): number | null {
  let candidate = value;
  if (candidate && typeof candidate === "object") {
    candidate = objectField(candidate, ["amount", "value", "balance", "loadbalance"]);
  }
  if (candidate === null || candidate === undefined || candidate === "") return null;
  if (typeof candidate === "number") {
    return Number.isFinite(candidate) && candidate >= 0 ? candidate : null;
  }
  if (typeof candidate !== "string") return null;
  const cleaned = candidate.replace(/,/g, "").replace(/[^0-9.+-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseCurrency(value: unknown): string | null {
  let candidate = value;
  if (candidate && typeof candidate === "object") {
    candidate = objectField(candidate, ["currency", "currencycode", "ccy"]);
  }
  if (typeof candidate !== "string") return null;
  const normalized = candidate.trim().toUpperCase();
  if (normalized === "₱" || normalized === "PESO" || normalized === "PESOS") return "PHP";
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  const direct = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function parseAccountStatus(value: unknown): ConnectorAccountStatus {
  if (typeof value !== "string") return "unknown";
  const normalized = normalizeKey(value);
  if (["active", "registered", "enabled", "normal", "ok", "serviceable"].includes(normalized)) return "active";
  if (["suspended", "suspend", "blocked", "restricted", "barred", "temporarydisconnected"].includes(normalized)) return "suspended";
  if (["expired", "expiry", "inactive"].includes(normalized)) return "expired";
  if (["closed", "terminated", "deactivated", "permanentlydisconnected", "disabled"].includes(normalized)) return "closed";
  return "unknown";
}

async function requestJson(
  requestUrl: string,
  method: "GET" | "POST",
  requestBody: string,
  requestHeadersJson: string,
  sim: CarrierConnectorSimContext,
) {
  const url = validateDitoUrl(interpolate(requestUrl, sim));
  const headers = parseRequestHeaders(requestHeadersJson, sim);
  if (!headers.has("Accept")) headers.set("Accept", "application/json, text/plain, */*");
  if (!headers.has("User-Agent")) headers.set("User-Agent", "SIMKeeper/DITO-connector");

  const body = method === "POST" && requestBody ? interpolate(requestBody, sim) : undefined;
  if (body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("MyDITO 请求超时");
    throw new Error(error instanceof Error ? `MyDITO 请求失败：${error.message}` : "MyDITO 请求失败");
  } finally {
    clearTimeout(timer);
  }

  if (response.status >= 300 && response.status < 400) {
    throw new Error("MyDITO 接口发生重定向；请在浏览器开发者工具中复制最终的余额请求 URL");
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error("MyDITO 会话已失效或无权限，请重新登录 my.dito.ph 并更新鉴权请求头");
  }
  if (!response.ok) {
    throw new Error(`MyDITO 接口返回 HTTP ${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error("MyDITO 响应过大，已拒绝解析");
  }

  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("MyDITO 响应过大，已拒绝解析");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("MyDITO 返回的不是 JSON；通常表示接口地址不正确或登录会话已失效");
  }
}

export const ditoCarrierConnectorProvider: CarrierConnectorProvider = {
  id: "dito",
  label: "DITO MyDITO（实验）",
  description: "通过你在 my.dito.ph 已登录会话中的余额 JSON 请求读取数据。DITO 未公开稳定 API，因此需要从浏览器开发者工具复制真实请求 URL 与鉴权请求头；SIMKeeper 不会猜测或硬编码未知私有接口。",
  configFields: [
    {
      key: "requestUrl",
      label: "余额请求 URL",
      type: "url",
      required: true,
      placeholder: "https://…dito.ph/…",
      description: "必须是 https://dito.ph 或其子域名。可使用 {{phoneNumber}} / {{msisdn}} / {{localNumber}} 模板。",
    },
    {
      key: "requestMethod",
      label: "请求方法",
      type: "select",
      defaultValue: "GET",
      options: [
        { value: "GET", label: "GET" },
        { value: "POST", label: "POST" },
      ],
    },
    {
      key: "requestBody",
      label: "请求 Body",
      type: "textarea",
      defaultValue: "",
      placeholder: "仅 POST 需要；可使用 {{phoneNumber}} / {{msisdn}} / {{localNumber}}",
      description: "保持为空即可用于 GET；Body 不应包含密码、Cookie 或 Token。",
    },
    {
      key: "balancePath",
      label: "余额 JSON 路径",
      type: "text",
      defaultValue: "",
      placeholder: "例如 data.balance",
      description: "可留空让 SIMKeeper 尝试识别常见余额字段；识别失败时再填写。",
    },
    {
      key: "currencyPath",
      label: "币种 JSON 路径",
      type: "text",
      defaultValue: "",
      placeholder: "例如 data.currencyCode",
      description: "留空且已识别到余额时默认使用 PHP。",
    },
    {
      key: "balanceValidUntilPath",
      label: "余额有效期 JSON 路径",
      type: "text",
      defaultValue: "",
      placeholder: "例如 data.balanceValidUntil",
      description: "该字段只写入“余额有效期”，不会覆盖号码有效期。",
    },
    {
      key: "accountStatusPath",
      label: "账户状态 JSON 路径",
      type: "text",
      defaultValue: "",
      placeholder: "例如 data.accountStatus",
    },
  ],
  credentialFields: [
    {
      key: "requestHeadersJson",
      label: "MyDITO 鉴权请求头（JSON）",
      required: false,
      placeholder: "{\"Authorization\":\"Bearer …\",\"Cookie\":\"…\"}",
      description: "从余额请求中只复制鉴权相关请求头。该 JSON 会在服务端 AES-256-GCM 加密保存，普通 API 不回显；Host、Content-Length 等危险请求头会被忽略。",
    },
  ],
  async disconnect() {
    return;
  },
  async sync(context): Promise<NormalizedCarrierSyncResult> {
    if (context.sim.countryCode.toUpperCase() !== "PH" || !context.sim.carrierName.toLowerCase().includes("dito")) {
      throw new Error("DITO Provider 只能关联菲律宾 DITO 号码");
    }

    const requestUrl = stringConfig(context.config, "requestUrl");
    if (!requestUrl) throw new Error("请先填写 MyDITO 余额请求 URL");
    const requestMethodRaw = stringConfig(context.config, "requestMethod").toUpperCase();
    const requestMethod: "GET" | "POST" = requestMethodRaw === "POST" ? "POST" : "GET";
    const requestBody = stringConfig(context.config, "requestBody");
    const requestHeadersJson = context.credentials.requestHeadersJson || "";

    const payload = await requestJson(
      requestUrl,
      requestMethod,
      requestBody,
      requestHeadersJson,
      context.sim,
    );

    const balanceLocated = configuredOrCandidate(
      payload,
      stringConfig(context.config, "balancePath"),
      BALANCE_KEYS,
    );
    if (!balanceLocated) {
      throw new Error("未能从 MyDITO 响应中识别余额，请在连接设置中填写“余额 JSON 路径”");
    }
    const balance = parseBalance(balanceLocated.value);
    if (balance === null) {
      throw new Error(`MyDITO 余额字段无法解析：${balanceLocated.path}`);
    }

    const currencyLocated = configuredOrCandidate(
      payload,
      stringConfig(context.config, "currencyPath"),
      CURRENCY_KEYS,
    );
    const currencyFromBalance = parseCurrency(balanceLocated.value);
    const currencyCode = parseCurrency(currencyLocated?.value) || currencyFromBalance || "PHP";

    const validityLocated = configuredOrCandidate(
      payload,
      stringConfig(context.config, "balanceValidUntilPath"),
      VALIDITY_KEYS,
    );
    const configuredValidityPath = stringConfig(context.config, "balanceValidUntilPath");
    const balanceValidUntil = validityLocated ? parseDate(validityLocated.value) : null;
    if (configuredValidityPath && validityLocated && balanceValidUntil === null) {
      throw new Error(`MyDITO 余额有效期字段无法解析：${validityLocated.path}`);
    }

    const statusLocated = configuredOrCandidate(
      payload,
      stringConfig(context.config, "accountStatusPath"),
      STATUS_KEYS,
    );

    return {
      balance,
      currencyCode,
      balanceValidUntil,
      accountStatus: parseAccountStatus(statusLocated?.value),
    };
  },
};
