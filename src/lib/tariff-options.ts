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

export function getSmsReceivePolicyLabel(value: string | null | undefined) {
  if (!value) return "未记录";
  return SMS_RECEIVE_POLICIES.find((item) => item.value === value)?.label ?? value;
}

export function getRoamingAvailabilityLabel(value: string | null | undefined) {
  if (!value) return "未记录";
  return ROAMING_AVAILABILITY.find((item) => item.value === value)?.label ?? value;
}
