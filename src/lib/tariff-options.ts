export const TARIFF_RATE_MODES = [
  { value: "unknown", label: "未知" },
  { value: "free", label: "免费" },
  { value: "charged", label: "收费" },
  { value: "included", label: "套餐内包含" },
  { value: "unavailable", label: "不可用" },
] as const;

export const TARIFF_BILLING_UNITS = [
  { value: "per_second", label: "每秒", kind: "call" },
  { value: "per_6_seconds", label: "每 6 秒", kind: "call" },
  { value: "per_10_seconds", label: "每 10 秒", kind: "call" },
  { value: "per_15_seconds", label: "每 15 秒", kind: "call" },
  { value: "per_30_seconds", label: "每 30 秒", kind: "call" },
  { value: "per_minute", label: "每分钟", kind: "call" },
  { value: "per_call", label: "每次通话", kind: "call" },
  { value: "per_sms", label: "每条", kind: "sms" },
  { value: "per_kb", label: "每 KB", kind: "data" },
  { value: "per_mb", label: "每 MB", kind: "data" },
  { value: "per_gb", label: "每 GB", kind: "data" },
  { value: "per_day", label: "每天", kind: "data" },
  { value: "per_session", label: "每次", kind: "data" },
] as const;

export const TARIFF_SERVICES = [
  { code: "localOutgoingCall", label: "拨打电话", group: "local", kind: "call", defaultUnit: "per_minute" },
  { code: "localIncomingCall", label: "接听电话", group: "local", kind: "call", defaultUnit: "per_minute" },
  { code: "localOutgoingSms", label: "发送短信", group: "local", kind: "sms", defaultUnit: "per_sms" },
  { code: "localIncomingSms", label: "接收短信", group: "local", kind: "sms", defaultUnit: "per_sms" },
  { code: "localData", label: "移动数据", group: "local", kind: "data", defaultUnit: "per_mb" },
  { code: "internationalOutgoingCall", label: "国际电话", group: "international", kind: "call", defaultUnit: "per_minute" },
  { code: "internationalOutgoingSms", label: "国际短信", group: "international", kind: "sms", defaultUnit: "per_sms" },
  { code: "roamingOutgoingCall", label: "漫游拨打电话", group: "roaming", kind: "call", defaultUnit: "per_minute" },
  { code: "roamingIncomingCall", label: "漫游接听电话", group: "roaming", kind: "call", defaultUnit: "per_minute" },
  { code: "roamingOutgoingSms", label: "漫游发送短信", group: "roaming", kind: "sms", defaultUnit: "per_sms" },
  { code: "roamingIncomingSms", label: "漫游接收短信", group: "roaming", kind: "sms", defaultUnit: "per_sms" },
  { code: "roamingData", label: "漫游数据", group: "roaming", kind: "data", defaultUnit: "per_mb" },
] as const;

export type TariffServiceCode = (typeof TARIFF_SERVICES)[number]["code"];
export type TariffRateMode = (typeof TARIFF_RATE_MODES)[number]["value"];
export type TariffBillingUnit = (typeof TARIFF_BILLING_UNITS)[number]["value"];

export const SMS_RECEIVE_POLICIES = [
  { value: "free", label: "免费" },
  { value: "charged", label: "收费" },
  { value: "unavailable", label: "不可用" },
  { value: "unknown", label: "未知" },
] as const;

export const ROAMING_AVAILABILITY = [
  { value: "yes", label: "支持漫游" },
  { value: "no", label: "不支持漫游" },
  { value: "unknown", label: "漫游情况未知" },
] as const;

export function getTariffService(code: string) {
  return TARIFF_SERVICES.find((item) => item.code === code) ?? null;
}

export function getBillingUnitsForService(code: string) {
  const service = getTariffService(code);
  if (!service) return [];
  return TARIFF_BILLING_UNITS.filter((unit) => unit.kind === service.kind);
}

export function getTariffRateModeLabel(value: string | null | undefined) {
  if (!value) return "未知";
  return TARIFF_RATE_MODES.find((item) => item.value === value)?.label ?? value;
}

export function getBillingUnitLabel(value: string | null | undefined) {
  if (!value) return "";
  return TARIFF_BILLING_UNITS.find((item) => item.value === value)?.label ?? value;
}

export function getSmsReceivePolicyLabel(value: string | null | undefined) {
  if (!value) return "未记录";
  return SMS_RECEIVE_POLICIES.find((item) => item.value === value)?.label ?? value;
}

export function getRoamingAvailabilityLabel(value: string | null | undefined) {
  if (!value) return "未记录";
  return ROAMING_AVAILABILITY.find((item) => item.value === value)?.label ?? value;
}

export function smsPolicyFromRateMode(mode: string | null | undefined) {
  if (mode === "free") return "free";
  if (mode === "charged") return "charged";
  if (mode === "unavailable") return "unavailable";
  return "unknown";
}
