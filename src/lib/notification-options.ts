export const NOTIFICATION_CHANNEL_TYPES = [
  { value: "webhook", label: "Webhook", description: "向任意 HTTP / HTTPS 地址发送结构化提醒。" },
  { value: "bark", label: "Bark", description: "通过 Bark 向 iPhone / iPad 推送提醒。" },
  { value: "gotify", label: "Gotify", description: "向自托管 Gotify 实例发送提醒。" },
  { value: "telegram", label: "Telegram Bot", description: "通过 Telegram Bot 向指定 Chat ID 发送提醒。" },
] as const;

export type NotificationChannelType = (typeof NOTIFICATION_CHANNEL_TYPES)[number]["value"];

export function getNotificationChannelTypeLabel(value: string) {
  return NOTIFICATION_CHANNEL_TYPES.find((item) => item.value === value)?.label ?? value;
}
