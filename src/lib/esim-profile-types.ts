export const ESIM_PROFILE_STATUSES = [
  { value: "unknown", label: "未知" },
  { value: "unused", label: "未安装 / 未使用" },
  { value: "installed", label: "已安装" },
  { value: "used", label: "激活码已使用" },
  { value: "expired", label: "已失效" },
] as const;

export const ESIM_PROFILE_SOURCES = [
  { value: "website", label: "运营商官网" },
  { value: "app", label: "运营商 App" },
  { value: "email", label: "邮件" },
  { value: "order", label: "订单 / 购买记录" },
  { value: "physical_card", label: "实体卡片 / 凭证" },
  { value: "other", label: "其他" },
] as const;

export const ESIM_REUSE_POLICIES = [
  { value: "unknown", label: "未知" },
  { value: "reusable", label: "可重复激活" },
  { value: "single_use", label: "通常仅可使用一次" },
  { value: "replacement_required", label: "换设备需重新申请" },
] as const;

export type EsimProfileStatus = (typeof ESIM_PROFILE_STATUSES)[number]["value"];
export type EsimProfileSource = (typeof ESIM_PROFILE_SOURCES)[number]["value"];
export type EsimReusePolicy = (typeof ESIM_REUSE_POLICIES)[number]["value"];

export type EsimProfileSummary = {
  id: number;
  simId: number;
  profileStatus: EsimProfileStatus;
  source: EsimProfileSource | null;
  reusePolicy: EsimReusePolicy;
  notes: string | null;
  hasSmdpAddress: boolean;
  hasActivationCode: boolean;
  hasConfirmationCode: boolean;
  hasLpaString: boolean;
  hasOriginalQr: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EsimProfileSecrets = {
  smdpAddress: string;
  activationCode: string;
  confirmationCode: string;
  lpaString: string;
  originalQrDataUrl: string;
};

export type EsimProfileFormValue = {
  profileStatus: EsimProfileStatus;
  source: EsimProfileSource | "";
  reusePolicy: EsimReusePolicy;
  notes: string;
  smdpAddress?: string;
  activationCode?: string;
  confirmationCode?: string;
  lpaString?: string;
  originalQrDataUrl?: string;
};

export function getEsimProfileStatusLabel(value: string | null | undefined) {
  return ESIM_PROFILE_STATUSES.find((item) => item.value === value)?.label ?? "未知";
}

export function getEsimProfileSourceLabel(value: string | null | undefined) {
  if (!value) return "未记录";
  return ESIM_PROFILE_SOURCES.find((item) => item.value === value)?.label ?? value;
}

export function getEsimReusePolicyLabel(value: string | null | undefined) {
  return ESIM_REUSE_POLICIES.find((item) => item.value === value)?.label ?? "未知";
}

export function parseLpaString(value: string) {
  const normalized = value.trim();
  const match = /^LPA:1\$([^$\s]+)\$([^$\s]+)(?:\$.*)?$/i.exec(normalized);
  if (!match) return null;
  return {
    lpaString: normalized,
    smdpAddress: match[1],
    activationCode: match[2],
  };
}

export function buildLpaString(smdpAddress: string, activationCode: string) {
  const smdp = smdpAddress.trim();
  const activation = activationCode.trim();
  if (!smdp || !activation) return "";
  return `LPA:1$${smdp}$${activation}`;
}

export function createEmptyEsimProfileForm(): EsimProfileFormValue {
  return {
    profileStatus: "unknown",
    source: "",
    reusePolicy: "unknown",
    notes: "",
  };
}
