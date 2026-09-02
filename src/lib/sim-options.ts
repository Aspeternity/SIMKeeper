export const SIM_TYPES = [
  { value: "physical", label: "实体 SIM" },
  { value: "esim", label: "eSIM" },
  { value: "esim_adapter", label: "eSIM 卡 / 转接卡" },
] as const;

export const SIM_STATUSES = [
  { value: "active", label: "正常" },
  { value: "paused", label: "暂停使用" },
  { value: "expired", label: "已失效" },
  { value: "closed", label: "已注销" },
] as const;

export const CURRENCIES = [
  { code: "CNY", label: "人民币" },
  { code: "HKD", label: "港币" },
  { code: "TWD", label: "新台币" },
  { code: "PHP", label: "菲律宾比索" },
  { code: "SGD", label: "新加坡元" },
  { code: "MYR", label: "马来西亚林吉特" },
  { code: "THB", label: "泰铢" },
  { code: "IDR", label: "印度尼西亚盾" },
  { code: "JPY", label: "日元" },
  { code: "KRW", label: "韩元" },
  { code: "GBP", label: "英镑" },
  { code: "EUR", label: "欧元" },
  { code: "USD", label: "美元" },
  { code: "CAD", label: "加拿大元" },
  { code: "AUD", label: "澳大利亚元" },
  { code: "NZD", label: "新西兰元" },
  { code: "NGN", label: "尼日利亚奈拉" },
  { code: "AED", label: "阿联酋迪拉姆" },
  { code: "SAR", label: "沙特里亚尔" },
  { code: "QAR", label: "卡塔尔里亚尔" },
  { code: "TRY", label: "土耳其里拉" },
  { code: "MXN", label: "墨西哥比索" },
  { code: "BRL", label: "巴西雷亚尔" },
  { code: "ZAR", label: "南非兰特" },
  { code: "EGP", label: "埃及镑" },
  { code: "KES", label: "肯尼亚先令" },
  { code: "VND", label: "越南盾" },
  { code: "KHR", label: "柬埔寨瑞尔" },
] as const;

export const DEFAULT_CURRENCY_BY_COUNTRY: Record<string, string> = {
  CN: "CNY",
  HK: "HKD",
  TW: "TWD",
  PH: "PHP",
  SG: "SGD",
  MY: "MYR",
  TH: "THB",
  ID: "IDR",
  JP: "JPY",
  KR: "KRW",
  GB: "GBP",
  DE: "EUR",
  FR: "EUR",
  ES: "EUR",
  IT: "EUR",
  NL: "EUR",
  AT: "EUR",
  IE: "EUR",
  US: "USD",
  CA: "CAD",
  AU: "AUD",
  NZ: "NZD",
  NG: "NGN",
  AE: "AED",
  SA: "SAR",
  QA: "QAR",
  TR: "TRY",
  MX: "MXN",
  BR: "BRL",
  ZA: "ZAR",
  EG: "EGP",
  KE: "KES",
  VN: "VND",
  KH: "KHR",
};

export function getSimTypeLabel(value: string) {
  return SIM_TYPES.find((item) => item.value === value)?.label ?? value;
}

export function getSimStatusLabel(value: string) {
  return SIM_STATUSES.find((item) => item.value === value)?.label ?? value;
}

export function getDefaultCurrency(countryCode: string) {
  return DEFAULT_CURRENCY_BY_COUNTRY[countryCode.toUpperCase()] ?? "USD";
}
