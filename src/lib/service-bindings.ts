export const SERVICE_CATEGORIES = [
  { value: "communication", label: "通讯 / 社交" },
  { value: "finance", label: "金融 / 支付" },
  { value: "shopping", label: "购物 / 电商" },
  { value: "cloud", label: "云服务 / 账号" },
  { value: "entertainment", label: "影音 / 娱乐" },
  { value: "work", label: "工作 / 协作" },
  { value: "government", label: "政务 / 公共服务" },
  { value: "security", label: "安全 / 身份验证" },
  { value: "other", label: "其他" },
] as const;

export const SERVICE_BINDING_TYPES = [
  { value: "login", label: "登录 / 主账号" },
  { value: "verification", label: "验证码 / 验证" },
  { value: "two_factor", label: "双重验证 / 2FA" },
  { value: "recovery", label: "找回 / 恢复" },
  { value: "contact", label: "联系号码" },
  { value: "other", label: "其他用途" },
] as const;

export const SERVICE_IMPORTANCE_LEVELS = [
  { value: "critical", label: "关键" },
  { value: "high", label: "重要" },
  { value: "normal", label: "普通" },
  { value: "low", label: "低" },
] as const;

export const SERVICE_BINDING_STATUSES = [
  { value: "active", label: "当前绑定" },
  { value: "migrated", label: "已迁移" },
  { value: "unbound", label: "已解绑" },
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number]["value"];
export type ServiceBindingType = (typeof SERVICE_BINDING_TYPES)[number]["value"];
export type ServiceImportance = (typeof SERVICE_IMPORTANCE_LEVELS)[number]["value"];
export type ServiceBindingStatus = (typeof SERVICE_BINDING_STATUSES)[number]["value"];

export function getServiceCategoryLabel(value: string) {
  return SERVICE_CATEGORIES.find((item) => item.value === value)?.label ?? value;
}

export function getServiceBindingTypeLabel(value: string) {
  return SERVICE_BINDING_TYPES.find((item) => item.value === value)?.label ?? value;
}

export function getServiceImportanceLabel(value: string) {
  return SERVICE_IMPORTANCE_LEVELS.find((item) => item.value === value)?.label ?? value;
}

export function getServiceBindingStatusLabel(value: string) {
  return SERVICE_BINDING_STATUSES.find((item) => item.value === value)?.label ?? value;
}
