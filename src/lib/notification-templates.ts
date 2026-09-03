export const DEFAULT_NOTIFICATION_TITLE_TEMPLATE = "SIMKeeper {{heading}} · {{count}} 项";
export const DEFAULT_NOTIFICATION_BODY_TEMPLATE = "{{items}}";
export const DEFAULT_NOTIFICATION_ITEM_TEMPLATE = "{{index}}. {{simLabel}} · {{title}}\n   {{status}} · {{relative}}{{dueSuffix}}";

export const NOTIFICATION_TEMPLATE_VARIABLES = [
  { key: "app", label: "应用名称", scope: "all" },
  { key: "heading", label: "今日提醒 / 当前提醒 / 测试通知", scope: "all" },
  { key: "count", label: "本次提醒数量", scope: "all" },
  { key: "date", label: "发送日期", scope: "all" },
  { key: "channelName", label: "通知渠道名称", scope: "all" },
  { key: "items", label: "所有提醒条目（正文模板使用）", scope: "digest" },
  { key: "index", label: "当前条目序号", scope: "item" },
  { key: "simLabel", label: "号码名称", scope: "item" },
  { key: "phoneNumber", label: "手机号", scope: "item" },
  { key: "carrierName", label: "运营商", scope: "item" },
  { key: "country", label: "国家 / 地区", scope: "item" },
  { key: "title", label: "提醒标题", scope: "item" },
  { key: "kind", label: "提醒来源", scope: "item" },
  { key: "status", label: "提醒状态", scope: "item" },
  { key: "relative", label: "相对日期，例如还有 7 天", scope: "item" },
  { key: "dueDate", label: "到期日期", scope: "item" },
  { key: "dueSuffix", label: "带前置分隔符的到期日期；无日期时为空", scope: "item" },
  { key: "detail", label: "提醒详细说明", scope: "item" },
] as const;

export type NotificationTemplateVariables = Record<string, string | number | null | undefined>;

export function renderNotificationTemplate(template: string, variables: NotificationTemplateVariables) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(variables, key)) return match;
    const value = variables[key];
    return value === null || value === undefined ? "" : String(value);
  });
}
