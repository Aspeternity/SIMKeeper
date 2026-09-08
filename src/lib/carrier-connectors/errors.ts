import type { CarrierProviderErrorType } from "@/lib/carrier-connectors/types";

const ERROR_TYPES = new Set<CarrierProviderErrorType>([
  "temporary",
  "authentication",
  "rate_limit",
  "maintenance",
  "configuration",
  "unsupported",
  "permanent",
]);

export type ClassifiedCarrierProviderError = {
  type: CarrierProviderErrorType;
  message: string;
  retryAfterMs: number | null;
  providerCode: string | null;
  httpStatus: number | null;
};

export class CarrierProviderError extends Error {
  readonly type: CarrierProviderErrorType;
  readonly retryAfterMs: number | null;
  readonly providerCode: string | null;
  readonly httpStatus: number | null;

  constructor(input: {
    type: CarrierProviderErrorType;
    message: string;
    retryAfterMs?: number | null;
    providerCode?: string | null;
    httpStatus?: number | null;
    cause?: unknown;
  }) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause });
    this.name = "CarrierProviderError";
    this.type = input.type;
    this.retryAfterMs = normalizeRetryDelay(input.retryAfterMs ?? null);
    this.providerCode = input.providerCode?.trim() || null;
    this.httpStatus = Number.isInteger(input.httpStatus) ? Number(input.httpStatus) : null;
  }
}

function normalizeRetryDelay(value: number | null) {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  return Math.max(1_000, Math.min(6 * 60 * 60_000, Math.round(value)));
}

function httpStatusFromText(message: string) {
  const match = /(?:HTTP|status(?:\s+code)?)[\s:()#-]*(\d{3})/i.exec(message)
    ?? /请求失败[（(]?\s*HTTP\s*(\d{3})/i.exec(message);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
}

export function retryAfterMsFromText(message: string) {
  const patterns: Array<{ regex: RegExp; multiplier: number }> = [
    { regex: /(?:after|in)\s+(\d+)\s*(?:minutes?|mins?)/i, multiplier: 60_000 },
    { regex: /(?:after|in)\s+(\d+)\s*(?:seconds?|secs?)/i, multiplier: 1_000 },
    { regex: /(\d+)\s*分钟(?:后|内)?/i, multiplier: 60_000 },
    { regex: /(\d+)\s*秒(?:钟)?(?:后|内)?/i, multiplier: 1_000 },
    { regex: /retry-after[\s:=]+(\d+)/i, multiplier: 1_000 },
  ];
  for (const { regex, multiplier } of patterns) {
    const match = regex.exec(message);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) return normalizeRetryDelay(value * multiplier);
  }
  return null;
}

export function isRetryableCarrierProviderErrorType(type: CarrierProviderErrorType) {
  return type === "temporary" || type === "rate_limit" || type === "maintenance";
}

function typedCarrierError(error: unknown): ClassifiedCarrierProviderError | null {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  const rawType = typeof record.type === "string" ? record.type : "";
  if (!ERROR_TYPES.has(rawType as CarrierProviderErrorType)) return null;
  const message = error instanceof Error
    ? error.message
    : typeof record.message === "string"
      ? record.message
      : "运营商同步失败";
  const retryAfterMs = normalizeRetryDelay(
    typeof record.retryAfterMs === "number" ? record.retryAfterMs : retryAfterMsFromText(message),
  );
  const httpStatus = typeof record.httpStatus === "number" && Number.isInteger(record.httpStatus)
    ? record.httpStatus
    : httpStatusFromText(message);
  return {
    type: rawType as CarrierProviderErrorType,
    message,
    retryAfterMs,
    providerCode: typeof record.providerCode === "string" && record.providerCode.trim() ? record.providerCode.trim() : null,
    httpStatus,
  };
}

export function classifyCarrierProviderError(error: unknown): ClassifiedCarrierProviderError {
  const typed = typedCarrierError(error);
  if (typed) return typed;

  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "运营商同步失败";
  const httpStatus = httpStatusFromText(message);
  const retryAfterMs = retryAfterMsFromText(message);
  const normalized = message.toLowerCase();

  let type: CarrierProviderErrorType;
  if (
    httpStatus === 401
    || httpStatus === 403
    || /需要重新认证|认证.{0,8}(?:失效|失败)|密码.{0,8}(?:错误|失败)|登录.{0,8}(?:失败|失效)|短信验证|验证码|device\s+not\s+recognized|session.{0,8}expired|token.{0,8}expired|invalid.{0,8}token|unauthori[sz]ed|forbidden/i.test(message)
  ) {
    type = "authentication";
  } else if (httpStatus === 429 || /rate.?limit|too many requests|throttl/i.test(normalized)) {
    type = "rate_limit";
  } else if (httpStatus === 417 || /系统维护|服务维护|维护中|maintenance|scheduled maintenance/i.test(message)) {
    type = "maintenance";
  } else if (
    /关联 SIM|关联号码|缺少有效|请填写|配置.{0,8}(?:错误|无效)|configuration|invalid configuration|credential.{0,8}missing/i.test(message)
  ) {
    type = "configuration";
  } else if (/不支持|接口.{0,8}(?:变更|不受支持)|unsupported|not supported/i.test(message)) {
    type = "unsupported";
  } else if (
    httpStatus === 408
    || httpStatus === 425
    || (httpStatus !== null && httpStatus >= 500)
    || /超时|稍后重试|暂时不可用|无法连接|网络访问|timeout|timed out|temporary|temporarily unavailable|network|fetch failed|econnreset|econnrefused|enotfound|socket hang up/i.test(message)
  ) {
    type = "temporary";
  } else {
    type = "permanent";
  }

  return {
    type,
    message,
    retryAfterMs,
    providerCode: null,
    httpStatus,
  };
}
