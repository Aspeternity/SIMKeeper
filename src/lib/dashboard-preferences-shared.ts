export const DASHBOARD_MODULE_IDS = [
  "health-summary",
  "planning",
  "asset",
  "configuration",
  "focus-sims",
  "actions",
  "health-risks",
  "country-distribution",
  "carrier-distribution",
  "recent-activity",
] as const;

export type DashboardModuleId = (typeof DASHBOARD_MODULE_IDS)[number];

export const DASHBOARD_MODULES: ReadonlyArray<{
  id: DashboardModuleId;
  label: string;
  description: string;
}> = [
  { id: "health-summary", label: "号码健康概览", description: "号码总数、健康正常、需要关注和紧急状态。" },
  { id: "planning", label: "未来安排", description: "按所选统计周期查看即将到期和待设置日期。" },
  { id: "asset", label: "资产结构", description: "实体 SIM、eSIM、国家/地区、运营商和状态结构。" },
  { id: "configuration", label: "配置检查", description: "找出缺少保号规则、绑定服务、设备或手机号的号码。" },
  { id: "focus-sims", label: "重点号码", description: "固定最多 6 张常用或重要号码到首页。" },
  { id: "actions", label: "需要处理", description: "当前优先级最高的提醒和条件任务。" },
  { id: "health-risks", label: "号码健康风险", description: "当前最值得关注的号码及主要风险原因。" },
  { id: "country-distribution", label: "地区分布", description: "按国家/地区统计当前仍在管理的号码。" },
  { id: "carrier-distribution", label: "运营商分布", description: "按运营商统计当前仍在管理的号码。" },
  { id: "recent-activity", label: "最近保号记录", description: "最近的充值、拨号、短信、延期等保号事实记录。" },
];

export type DashboardModulePreference = {
  id: DashboardModuleId;
  visible: boolean;
};

export type DashboardPreferences = {
  version: 1;
  modules: DashboardModulePreference[];
  horizonDays: 7 | 30 | 60;
  distributionLimit: 3 | 6 | 10;
  focusedSimIds: number[];
};

export type DashboardSimOption = {
  id: number;
  label: string;
  phoneNumber: string | null;
  carrierName: string;
  country: string;
};

export const DEFAULT_DASHBOARD_PREFERENCES: DashboardPreferences = {
  version: 1,
  modules: DASHBOARD_MODULE_IDS.map((id) => ({ id, visible: true })),
  horizonDays: 30,
  distributionLimit: 6,
  focusedSimIds: [],
};

export function cloneDefaultDashboardPreferences(): DashboardPreferences {
  return {
    ...DEFAULT_DASHBOARD_PREFERENCES,
    modules: DEFAULT_DASHBOARD_PREFERENCES.modules.map((module) => ({ ...module })),
    focusedSimIds: [],
  };
}
