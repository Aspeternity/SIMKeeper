export const TARIFF_RATE_MODES = [
  { value: "unknown", label: "未知" },
  { value: "free", label: "免费" },
  { value: "charged", label: "收费" },
  { value: "included", label: "套餐内包含" },
  { value: "included_unlimited", label: "套餐内无限" },
  { value: "unavailable", label: "不可用" },
] as const;

export const TARIFF_RULE_MODES = [
  { value: "free", label: "免费" },
  { value: "charged", label: "收费" },
  { value: "included", label: "套餐内包含" },
  { value: "included_unlimited", label: "套餐内无限" },
  { value: "package", label: "套餐 / 通行证" },
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

export const TARIFF_ALLOWANCE_UNITS = [
  { value: "minute", label: "分钟", kind: "call" },
  { value: "sms", label: "条", kind: "sms" },
  { value: "kb", label: "KB", kind: "data" },
  { value: "mb", label: "MB", kind: "data" },
  { value: "gb", label: "GB", kind: "data" },
] as const;

export const TARIFF_SERVICES = [
  { code: "localOutgoingCall", label: "拨打电话", group: "local", kind: "call", defaultUnit: "per_minute", defaultAllowanceUnit: "minute" },
  { code: "localIncomingCall", label: "接听电话", group: "local", kind: "call", defaultUnit: "per_minute", defaultAllowanceUnit: "minute" },
  { code: "localOutgoingSms", label: "发送短信", group: "local", kind: "sms", defaultUnit: "per_sms", defaultAllowanceUnit: "sms" },
  { code: "localIncomingSms", label: "接收短信", group: "local", kind: "sms", defaultUnit: "per_sms", defaultAllowanceUnit: "sms" },
  { code: "localData", label: "移动数据", group: "local", kind: "data", defaultUnit: "per_mb", defaultAllowanceUnit: "gb" },
  { code: "internationalOutgoingCall", label: "国际电话", group: "international", kind: "call", defaultUnit: "per_minute", defaultAllowanceUnit: "minute" },
  { code: "internationalOutgoingSms", label: "国际短信", group: "international", kind: "sms", defaultUnit: "per_sms", defaultAllowanceUnit: "sms" },
  { code: "roamingOutgoingCall", label: "漫游拨打电话", group: "roaming", kind: "call", defaultUnit: "per_minute", defaultAllowanceUnit: "minute" },
  { code: "roamingIncomingCall", label: "漫游接听电话", group: "roaming", kind: "call", defaultUnit: "per_minute", defaultAllowanceUnit: "minute" },
  { code: "roamingOutgoingSms", label: "漫游发送短信", group: "roaming", kind: "sms", defaultUnit: "per_sms", defaultAllowanceUnit: "sms" },
  { code: "roamingIncomingSms", label: "漫游接收短信", group: "roaming", kind: "sms", defaultUnit: "per_sms", defaultAllowanceUnit: "sms" },
  { code: "roamingData", label: "漫游数据", group: "roaming", kind: "data", defaultUnit: "per_mb", defaultAllowanceUnit: "gb" },
] as const;

export const TARIFF_PLAN_TYPES = [
  { value: "unknown", label: "未知" },
  { value: "prepaid", label: "储值 / 预付费" },
  { value: "postpaid", label: "月费 / 后付费" },
] as const;

export const TARIFF_PERIOD_UNITS = [
  { value: "day", label: "天" },
  { value: "month", label: "个月" },
  { value: "year", label: "年" },
] as const;

export const AUTO_RENEW_OPTIONS = [
  { value: "unknown", label: "未知" },
  { value: "yes", label: "自动续订" },
  { value: "no", label: "不自动续订" },
] as const;

export const TARIFF_RULE_CONDITION_TYPES = [
  { value: "network_scope", label: "网络范围" },
  { value: "destination", label: "目的地" },
  { value: "roaming_region", label: "漫游地区" },
  { value: "time_window", label: "时间段" },
] as const;

export const NETWORK_SCOPE_OPTIONS = [
  { value: "same_network", label: "同网" },
  { value: "other_network", label: "异网" },
] as const;

export const DESTINATION_SPECIAL_OPTIONS = [
  { value: "HOME", label: "号码归属地" },
  { value: "CURRENT", label: "当前漫游地" },
  { value: "OTHER", label: "其他国家 / 地区" },
] as const;

export type TariffServiceCode = (typeof TARIFF_SERVICES)[number]["code"];
export type TariffRateMode = (typeof TARIFF_RATE_MODES)[number]["value"];
export type TariffRuleMode = (typeof TARIFF_RULE_MODES)[number]["value"];
export type TariffBillingUnit = (typeof TARIFF_BILLING_UNITS)[number]["value"];
export type TariffAllowanceUnit = (typeof TARIFF_ALLOWANCE_UNITS)[number]["value"];
export type TariffRuleConditionType = (typeof TARIFF_RULE_CONDITION_TYPES)[number]["value"];

export const SMS_RECEIVE_POLICIES = [
  { value: "free", label: "免费" },
  { value: "charged", label: "收费" },
  { value: "included", label: "套餐内" },
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

export function getAllowanceUnitsForService(code: string) {
  const service = getTariffService(code);
  if (!service) return [];
  return TARIFF_ALLOWANCE_UNITS.filter((unit) => unit.kind === service.kind);
}

export function getConditionTypesForService(code: string) {
  const service = getTariffService(code);
  if (!service) return [];

  if (service.group === "local") {
    if (service.kind === "sms" || service.kind === "call") {
      return TARIFF_RULE_CONDITION_TYPES.filter((item) => item.value === "network_scope" || item.value === "time_window");
    }
    return TARIFF_RULE_CONDITION_TYPES.filter((item) => item.value === "time_window");
  }

  if (service.group === "international") {
    return TARIFF_RULE_CONDITION_TYPES.filter((item) => item.value === "destination" || item.value === "time_window");
  }

  if (service.code === "roamingOutgoingCall" || service.code === "roamingOutgoingSms") {
    return TARIFF_RULE_CONDITION_TYPES.filter((item) => item.value === "roaming_region" || item.value === "destination" || item.value === "time_window");
  }

  return TARIFF_RULE_CONDITION_TYPES.filter((item) => item.value === "roaming_region" || item.value === "time_window");
}

export function getTariffRateModeLabel(value: string | null | undefined) {
  if (!value) return "未知";
  return TARIFF_RATE_MODES.find((item) => item.value === value)?.label
    ?? TARIFF_RULE_MODES.find((item) => item.value === value)?.label
    ?? value;
}

export function getBillingUnitLabel(value: string | null | undefined) {
  if (!value) return "";
  return TARIFF_BILLING_UNITS.find((item) => item.value === value)?.label
    ?? TARIFF_ALLOWANCE_UNITS.find((item) => item.value === value)?.label
    ?? value;
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
  if (mode === "included" || mode === "included_unlimited") return "included";
  if (mode === "unavailable") return "unavailable";
  return "unknown";
}
