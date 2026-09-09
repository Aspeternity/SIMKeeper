"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BellRing,
  Braces,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Edit3,
  Loader2,
  MessageSquareText,
  Plus,
  Radio,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Webhook,
  XCircle,
} from "lucide-react";
import { NotificationTemplateModal, type NotificationTemplates } from "@/components/notifications/notification-template-modal";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogAlert, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { FormField, FormGrid, FormSection } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { NOTIFICATION_CHANNEL_TYPES, getNotificationChannelTypeLabel, type NotificationChannelType } from "@/lib/notification-options";

type ReminderKind = "sim_validity" | "keep_alive" | "low_balance" | "sync_health";
type ReminderStatus = "upcoming" | "today" | "grace" | "overdue" | "unscheduled" | "condition";

type ChannelFilter = { kinds: ReminderKind[]; statuses: ReminderStatus[] };
type Channel = {
  id: number;
  name: string;
  type: NotificationChannelType;
  enabled: boolean;
  config: Record<string, unknown>;
  secrets: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
};
type Delivery = {
  id: number;
  channelId: number | null;
  channelName: string;
  kind: "test" | "reminder";
  reminderKey: string | null;
  reminderStatus: string | null;
  dueDate: string | null;
  deliveredOn: string;
  status: "success" | "failed";
  error: string | null;
  createdAt: string;
};
type NotificationSettings = NotificationTemplates & {
  enabled: boolean;
  dailyTime: string;
  dailyHour: number;
  milestoneDays: number[];
  catchUpEnabled: boolean;
  lastDispatchAt: string | null;
  lastScheduledDate: string | null;
  nextDispatchAt: string | null;
  timeZone: string;
  scheduleMode: "daily_exact";
};
type ScheduleDraft = { enabled: boolean; dailyTime: string; milestoneDays: number[]; catchUpEnabled: boolean };
type FormState = {
  id?: number;
  name: string;
  type: NotificationChannelType;
  enabled: boolean;
  config: Record<string, unknown>;
  secrets?: Record<string, boolean>;
};

const MILESTONE_OPTIONS = [30, 14, 7, 3, 1, 0];
const LEGACY_KINDS: ReminderKind[] = ["sim_validity", "keep_alive"];
const ALPHA38_KINDS: ReminderKind[] = ["sim_validity", "keep_alive", "low_balance"];
const LEGACY_STATUSES: ReminderStatus[] = ["upcoming", "today", "grace", "overdue", "unscheduled"];
const KIND_OPTIONS: Array<{ value: ReminderKind; label: string }> = [
  { value: "sim_validity", label: "号码有效期" },
  { value: "keep_alive", label: "保号规则" },
  { value: "low_balance", label: "低余额" },
  { value: "sync_health", label: "同步健康" },
];
const STATUS_OPTIONS: Array<{ value: ReminderStatus; label: string }> = [
  { value: "upcoming", label: "即将到期" },
  { value: "today", label: "今天到期" },
  { value: "grace", label: "宽限期" },
  { value: "overdue", label: "已逾期" },
  { value: "unscheduled", label: "待设置日期" },
  { value: "condition", label: "条件触发" },
];

function defaultFilters(): ChannelFilter {
  return { kinds: KIND_OPTIONS.map((item) => item.value), statuses: STATUS_OPTIONS.map((item) => item.value) };
}

function exactSelection<T extends string>(values: T[], expected: readonly T[]) {
  return values.length === expected.length && expected.every((value) => values.includes(value));
}

function expandLegacyFilters(kinds: ReminderKind[], statuses: ReminderStatus[]): ChannelFilter {
  const legacyKinds = exactSelection(kinds, LEGACY_KINDS) || exactSelection(kinds, ALPHA38_KINDS);
  const legacyStatuses = exactSelection(statuses, LEGACY_STATUSES);
  return {
    kinds: legacyKinds ? defaultFilters().kinds : kinds,
    statuses: legacyStatuses ? defaultFilters().statuses : statuses,
  };
}

function initialConfig(type: NotificationChannelType): Record<string, unknown> {
  const filters = defaultFilters();
  if (type === "webhook") return { url: "", method: "POST", bearerToken: "", filters };
  if (type === "bark") return { serverUrl: "https://api.day.app", deviceKey: "", group: "SIMKeeper", filters };
  if (type === "gotify") return { serverUrl: "", token: "", priority: 5, filters };
  return { apiBaseUrl: "https://api.telegram.org", botToken: "", chatId: "", filters };
}

function emptyForm(): FormState {
  return { name: "", type: "webhook", enabled: true, config: initialConfig("webhook") };
}

function pickSchedule(settings: NotificationSettings): ScheduleDraft {
  return { enabled: settings.enabled, dailyTime: settings.dailyTime, milestoneDays: [...settings.milestoneDays], catchUpEnabled: settings.catchUpEnabled };
}

function formatDateTime(value: string | null) {
  if (!value) return "尚未运行";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function statusLabel(value: string | null) {
  if (value === "overdue") return "已逾期";
  if (value === "grace") return "宽限期";
  if (value === "today") return "今天到期";
  if (value === "upcoming") return "即将到期";
  if (value === "unscheduled") return "待设置日期";
  if (value === "condition") return "条件提醒";
  return value || "";
}

function configString(channel: Channel, key: string) {
  const value = channel.config[key];
  return typeof value === "string" ? value : "";
}

function channelFilters(channel: Channel): ChannelFilter {
  const raw = channel.config.filters;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultFilters();
  const record = raw as Record<string, unknown>;
  const kinds = Array.isArray(record.kinds) ? record.kinds.filter((value): value is ReminderKind => KIND_OPTIONS.some((item) => item.value === value)) : [];
  const statuses = Array.isArray(record.statuses) ? record.statuses.filter((value): value is ReminderStatus => STATUS_OPTIONS.some((item) => item.value === value)) : [];
  return expandLegacyFilters(kinds.length ? kinds : defaultFilters().kinds, statuses.length ? statuses : defaultFilters().statuses);
}

function formFilters(form: FormState): ChannelFilter {
  const raw = form.config.filters;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultFilters();
  const record = raw as Record<string, unknown>;
  const kinds = Array.isArray(record.kinds) ? record.kinds.filter((value): value is ReminderKind => KIND_OPTIONS.some((item) => item.value === value)) : [];
  const statuses = Array.isArray(record.statuses) ? record.statuses.filter((value): value is ReminderStatus => STATUS_OPTIONS.some((item) => item.value === value)) : [];
  return expandLegacyFilters(kinds, statuses);
}

function channelSummary(channel: Channel) {
  if (channel.type === "webhook") return configString(channel, "url") || "未填写 Webhook URL";
  if (channel.type === "bark") {
    const server = configString(channel, "serverUrl") || "https://api.day.app";
    return `${server} · Device Key ${channel.secrets.deviceKey ? "已保存" : "未配置"}`;
  }
  if (channel.type === "gotify") return configString(channel, "serverUrl") || "未填写 Gotify 地址";
  return `Chat ID ${configString(channel, "chatId") || "未填写"}`;
}

function channelFilterSummary(channel: Channel) {
  const filters = channelFilters(channel);
  const sourceLabel = filters.kinds.length === KIND_OPTIONS.length
    ? "全部来源"
    : filters.kinds.map((kind) => KIND_OPTIONS.find((item) => item.value === kind)?.label).filter(Boolean).join("、");
  return `${sourceLabel} · ${filters.statuses.length} 种状态`;
}

function secretPlaceholder(form: FormState, key: string, fallback: string) {
  return form.id && form.secrets?.[key] ? "已保存；留空保持不变" : fallback;
}

function channelTypeIcon(type: NotificationChannelType) {
  if (type === "webhook") return Webhook;
  if (type === "telegram") return MessageSquareText;
  if (type === "bark") return BellRing;
  return Radio;
}

function ChannelFields({ form, setForm }: { form: FormState; setForm: (value: FormState) => void }) {
  function setConfig(key: string, value: unknown) {
    setForm({ ...form, config: { ...form.config, [key]: value } });
  }

  if (form.type === "webhook") {
    return (
      <div className="space-y-4">
        <FormField label="Webhook URL" required>
          <Input value={String(form.config.url ?? "")} onChange={(event) => setConfig("url", event.target.value)} placeholder="https://example.com/webhook" />
        </FormField>
        <FormGrid columns={2}>
          <FormField label="请求方式">
            <Select value={String(form.config.method ?? "POST")} onChange={(event) => setConfig("method", event.target.value)}>
              <option value="POST">POST · JSON</option>
              <option value="GET">GET · Query 参数</option>
            </Select>
          </FormField>
          <FormField label="Bearer Token" hint="可选；用于目标端鉴权。">
            <Input type="password" value={String(form.config.bearerToken ?? "")} onChange={(event) => setConfig("bearerToken", event.target.value)} placeholder={secretPlaceholder(form, "bearerToken", "可选鉴权令牌")} autoComplete="new-password" />
          </FormField>
        </FormGrid>
      </div>
    );
  }

  if (form.type === "bark") {
    return (
      <div className="space-y-4">
        <FormField label="Bark 服务器" required>
          <Input value={String(form.config.serverUrl ?? "")} onChange={(event) => setConfig("serverUrl", event.target.value)} placeholder="https://api.day.app" />
        </FormField>
        <FormGrid columns={2}>
          <FormField label="Device Key" required>
            <Input type="password" value={String(form.config.deviceKey ?? "")} onChange={(event) => setConfig("deviceKey", event.target.value)} placeholder={secretPlaceholder(form, "deviceKey", "Bark Device Key")} autoComplete="new-password" />
          </FormField>
          <FormField label="分组" hint="可选，默认建议使用 SIMKeeper。">
            <Input value={String(form.config.group ?? "")} onChange={(event) => setConfig("group", event.target.value)} placeholder="SIMKeeper" />
          </FormField>
        </FormGrid>
      </div>
    );
  }

  if (form.type === "gotify") {
    return (
      <div className="space-y-4">
        <FormField label="Gotify 服务器" required>
          <Input value={String(form.config.serverUrl ?? "")} onChange={(event) => setConfig("serverUrl", event.target.value)} placeholder="https://gotify.example.com" />
        </FormField>
        <FormGrid columns={2}>
          <FormField label="Application Token" required>
            <Input type="password" value={String(form.config.token ?? "")} onChange={(event) => setConfig("token", event.target.value)} placeholder={secretPlaceholder(form, "token", "Gotify Application Token")} autoComplete="new-password" />
          </FormField>
          <FormField label="优先级" hint="Gotify priority，范围 -10 到 10。">
            <Input type="number" min="-10" max="10" value={String(form.config.priority ?? 5)} onChange={(event) => setConfig("priority", Number(event.target.value))} />
          </FormField>
        </FormGrid>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FormField label="Telegram API 地址" required>
        <Input value={String(form.config.apiBaseUrl ?? "")} onChange={(event) => setConfig("apiBaseUrl", event.target.value)} placeholder="https://api.telegram.org" />
      </FormField>
      <FormGrid columns={2}>
        <FormField label="Bot Token" required>
          <Input type="password" value={String(form.config.botToken ?? "")} onChange={(event) => setConfig("botToken", event.target.value)} placeholder={secretPlaceholder(form, "botToken", "123456:ABC...")} autoComplete="new-password" />
        </FormField>
        <FormField label="Chat ID" required>
          <Input value={String(form.config.chatId ?? "")} onChange={(event) => setConfig("chatId", event.target.value)} placeholder="例如 123456789 或 -100..." />
        </FormField>
      </FormGrid>
    </div>
  );
}

function ChannelFilterFields({ form, setForm }: { form: FormState; setForm: (value: FormState) => void }) {
  const filters = formFilters(form);

  function toggleKind(value: ReminderKind) {
    const next = filters.kinds.includes(value) ? filters.kinds.filter((item) => item !== value) : [...filters.kinds, value];
    setForm({ ...form, config: { ...form.config, filters: { ...filters, kinds: next } } });
  }

  function toggleStatus(value: ReminderStatus) {
    const next = filters.statuses.includes(value) ? filters.statuses.filter((item) => item !== value) : [...filters.statuses, value];
    setForm({ ...form, config: { ...form.config, filters: { ...filters, statuses: next } } });
  }

  return (
    <div className="rounded-2xl border border-line bg-surface-subtle p-4">
      <div className="text-sm font-semibold text-ink">发送范围</div>
      <p className="mt-1 text-xs leading-5 text-ink-muted">到期类提醒按每日计划发送；低余额与同步健康 Condition 在触发后主动发送。两者都会遵守这里的来源和状态筛选。</p>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-medium text-ink-muted">提醒来源</div>
          <div className="space-y-2">
            {KIND_OPTIONS.map((item) => (
              <label key={item.value} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-ink-secondary transition hover:bg-surface">
                <input type="checkbox" checked={filters.kinds.includes(item.value)} onChange={() => toggleKind(item.value)} className="h-4 w-4 accent-brand" />
                {item.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-medium text-ink-muted">提醒状态</div>
          <div className="grid grid-cols-2 gap-1.5">
            {STATUS_OPTIONS.map((item) => (
              <label key={item.value} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink-secondary transition hover:bg-surface">
                <input type="checkbox" checked={filters.statuses.includes(item.value)} onChange={() => toggleStatus(item.value)} className="h-4 w-4 accent-brand" />
                {item.label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "通知数据加载失败");
      const loadedSettings = data.settings as NotificationSettings;
      setSettings(loadedSettings);
      setScheduleDraft(pickSchedule(loadedSettings));
      setChannels(data.channels || []);
      setDeliveries(data.deliveries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "通知数据加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const enabledChannels = useMemo(() => channels.filter((channel) => channel.enabled).length, [channels]);
  const recentFailures = useMemo(() => deliveries.filter((item) => item.status === "failed").slice(0, 10).length, [deliveries]);
  const recentSuccess = useMemo(() => deliveries.filter((item) => item.status === "success").slice(0, 10).length, [deliveries]);

  function applyChannelData(data: { channels?: Channel[]; deliveries?: Delivery[] }) {
    if (data.channels) setChannels(data.channels);
    if (data.deliveries) setDeliveries(data.deliveries);
  }

  function toggleMilestone(day: number) {
    if (!scheduleDraft) return;
    const next = scheduleDraft.milestoneDays.includes(day)
      ? scheduleDraft.milestoneDays.filter((value) => value !== day)
      : [...scheduleDraft.milestoneDays, day].sort((a, b) => b - a);
    if (next.length) setScheduleDraft({ ...scheduleDraft, milestoneDays: next });
  }

  async function saveSchedule() {
    if (!scheduleDraft) return;
    setBusy("schedule");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "schedule", schedule: scheduleDraft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "通知计划保存失败");
      const savedSettings = data.settings as NotificationSettings;
      setSettings(savedSettings);
      setScheduleDraft(pickSchedule(savedSettings));
      setNotice("通知计划已保存；Condition watcher 会同步使用这个总开关。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "通知计划保存失败");
    } finally {
      setBusy("");
    }
  }

  async function saveChannel() {
    if (!form) return;
    const filters = formFilters(form);
    if (!filters.kinds.length) return setError("至少选择一种提醒来源");
    if (!filters.statuses.length) return setError("至少选择一种提醒状态");
    setBusy("channel");
    setError("");
    setNotice("");
    try {
      const normalizedForm = { ...form, config: { ...form.config, filters } };
      const response = await fetch("/api/notifications", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form.id ? { action: "channel", channel: normalizedForm } : { action: "create", channel: normalizedForm }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "通知渠道保存失败");
      applyChannelData(data);
      setForm(null);
      setNotice(form.id ? "通知渠道已更新。" : "通知渠道已添加，建议先发送测试通知。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "通知渠道保存失败");
    } finally {
      setBusy("");
    }
  }

  async function testChannel(channel: Channel) {
    setBusy(`test:${channel.id}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", id: channel.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "测试通知发送失败");
      applyChannelData(data);
      setNotice(`${channel.name} 测试通知发送成功，测试消息使用当前已保存的通知模板。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "测试通知发送失败");
      await loadData();
    } finally {
      setBusy("");
    }
  }

  async function dispatchNow() {
    if (!window.confirm("立即把处理中心当前提醒按各渠道的发送范围合并发送吗？手动发送会忽略生命周期里程碑，并同时包含当前触发中的 Condition。")) return;
    setBusy("dispatch");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dispatch" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "发送当前提醒失败");
      applyChannelData(data);
      setNotice(`发送完成：发出 ${data.result.sent} 条渠道摘要，失败 ${data.result.failed} 条，共包含 ${data.result.deliveredReminders} 个提醒。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送当前提醒失败");
    } finally {
      setBusy("");
    }
  }

  async function removeChannel(channel: Channel) {
    if (!window.confirm(`确定删除通知渠道“${channel.name}”吗？历史发送记录会保留渠道名称。`)) return;
    setBusy(`delete:${channel.id}`);
    setError("");
    try {
      const response = await fetch(`/api/notifications?id=${channel.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除通知渠道失败");
      applyChannelData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除通知渠道失败");
    } finally {
      setBusy("");
    }
  }

  const summaryCards = [
    {
      label: "自动通知",
      value: settings?.enabled ? "运行中" : "已关闭",
      detail: settings?.enabled ? `每日 ${settings.dailyTime}` : "不会自动推送",
      icon: BellRing,
      active: Boolean(settings?.enabled),
    },
    {
      label: "已启用渠道",
      value: `${enabledChannels} / ${channels.length}`,
      detail: channels.length ? "可接收外部通知" : "尚未添加渠道",
      icon: Radio,
      active: enabledChannels > 0,
    },
    {
      label: "下次每日发送",
      value: settings?.enabled ? (settings?.dailyTime || "—") : "—",
      detail: settings?.enabled ? formatDateTime(settings.nextDispatchAt) : "自动通知已关闭",
      icon: CalendarClock,
      active: Boolean(settings?.enabled),
    },
    {
      label: "近期投递",
      value: `${recentSuccess} 成功`,
      detail: recentFailures ? `${recentFailures} 条失败需要检查` : "暂无近期失败",
      icon: Activity,
      active: recentFailures === 0,
    },
  ];

  return (
    <div className="space-y-6" data-notification-polish="alpha.51.8">
      <SettingsPageHeader
        icon={BellRing}
        eyebrow="Notifications"
        title="通知渠道"
        description="统一管理每日生命周期摘要、Condition 主动提醒、外部通知渠道和消息模板，并在同一处检查发送结果。"
        actions={(
          <>
            <Button type="button" variant="secondary" onClick={() => setTemplateOpen(true)} disabled={!settings || Boolean(busy)}>
              <Braces className="mr-2 h-4 w-4" />通知模板
            </Button>
            <Button type="button" onClick={() => setForm(emptyForm())}>
              <Plus className="mr-2 h-4 w-4" />添加渠道
            </Button>
          </>
        )}
      />

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="通知状态概览">
        {summaryCards.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-ink-muted">{item.label}</div>
                  <div className="mt-2 text-xl font-semibold tracking-tight text-ink">{item.value}</div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-ink-muted">{item.detail}</div>
                </div>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.active ? "bg-brand-soft text-brand" : "bg-surface-subtle text-ink-muted"}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <Card className="p-5 sm:p-6" data-notification-section="schedule">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-ink"><CalendarClock className="h-4 w-4 text-brand" />自动通知总开关与每日摘要</div>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-muted">总开关同时控制每日生命周期摘要和 Condition 主动提醒；每日时间只影响到期类提醒。</p>
            </div>
            <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-medium ${settings?.enabled ? "bg-emerald-50 text-emerald-700" : "bg-surface-subtle text-ink-muted"}`}>
              {settings?.enabled ? "自动通知已启用" : "自动通知已关闭"}
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-[1fr_180px_1fr]">
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-surface-subtle px-3.5 text-sm text-ink-secondary">
              <input type="checkbox" checked={scheduleDraft?.enabled ?? false} onChange={(event) => scheduleDraft && setScheduleDraft({ ...scheduleDraft, enabled: event.target.checked })} className="h-4 w-4 accent-brand" />
              <span>启用外部自动通知</span>
            </label>
            <FormField label="每日通知时间">
              <Input type="time" step="60" value={scheduleDraft?.dailyTime ?? "09:00"} onChange={(event) => scheduleDraft && setScheduleDraft({ ...scheduleDraft, dailyTime: event.target.value })} />
            </FormField>
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-surface-subtle px-3.5 text-sm text-ink-secondary md:mt-[25px]">
              <input type="checkbox" checked={scheduleDraft?.catchUpEnabled ?? true} onChange={(event) => scheduleDraft && setScheduleDraft({ ...scheduleDraft, catchUpEnabled: event.target.checked })} className="h-4 w-4 accent-brand" />
              <span>错过计划时间后补发</span>
            </label>
          </div>

          <div className="mt-5 border-t border-line pt-5">
            <div className="text-xs font-semibold text-ink-secondary">到期前提醒里程碑</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {MILESTONE_OPTIONS.map((day) => {
                const active = scheduleDraft?.milestoneDays.includes(day) ?? false;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleMilestone(day)}
                    disabled={!scheduleDraft}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${active ? "border-brand bg-brand text-brand-foreground" : "border-line bg-surface text-ink-muted hover:border-line-strong hover:bg-surface-hover"}`}
                  >
                    {day === 0 ? "当天" : `${day} 天`}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs leading-5 text-ink-muted">到期类提醒只在这些剩余天数发送；逾期后第 1、3、7 天提醒，此后每 7 天一次。“待设置日期”每 7 天一次。Condition 不使用里程碑：后台约每分钟检查，首次触发尽快发送，同一未恢复 episode 每 3 天最多重复一次。</p>
          </div>

          <div className="mt-5 grid gap-3 border-t border-line pt-5 sm:grid-cols-2 xl:grid-cols-4">
            <div><div className="text-[11px] text-ink-muted">时区</div><div className="mt-1 text-xs font-medium text-ink-secondary">{settings?.timeZone ?? "Asia/Shanghai"}</div></div>
            <div><div className="text-[11px] text-ink-muted">已保存补发策略</div><div className="mt-1 text-xs font-medium text-ink-secondary">{settings?.catchUpEnabled ? "开启" : "关闭"}</div></div>
            <div><div className="text-[11px] text-ink-muted">最近自动调度日期</div><div className="mt-1 text-xs font-medium text-ink-secondary">{settings?.lastScheduledDate ?? "尚未运行"}</div></div>
            <div><div className="text-[11px] text-ink-muted">下次每日发送</div><div className="mt-1 text-xs font-medium text-ink-secondary">{settings?.enabled ? formatDateTime(settings?.nextDispatchAt ?? null) : "已关闭"}</div></div>
          </div>

          <div className="mt-5 flex justify-end border-t border-line pt-4">
            <Button type="button" onClick={() => void saveSchedule()} disabled={!scheduleDraft || Boolean(busy)}>
              {busy === "schedule" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}保存通知计划
            </Button>
          </div>
        </Card>

        <Card className="flex flex-col p-5 sm:p-6" data-notification-section="dispatch">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Send className="h-4 w-4 text-brand" />当前状态</div>
          <p className="mt-1 text-xs leading-5 text-ink-muted">手动发送不会修改每日计划，用于立即验证当前提醒是否能通过已启用渠道送达。</p>

          <div className="mt-5 grid grid-cols-3 gap-2.5 text-center">
            <div className="rounded-xl border border-line bg-surface-subtle p-3"><div className="text-xl font-semibold text-ink">{channels.length}</div><div className="mt-1 text-[11px] text-ink-muted">渠道总数</div></div>
            <div className="rounded-xl border border-line bg-surface-subtle p-3"><div className="text-xl font-semibold text-ink">{enabledChannels}</div><div className="mt-1 text-[11px] text-ink-muted">已启用</div></div>
            <div className="rounded-xl border border-line bg-surface-subtle p-3"><div className={`text-xl font-semibold ${recentFailures ? "text-rose-600" : "text-ink"}`}>{recentFailures}</div><div className="mt-1 text-[11px] text-ink-muted">近期失败</div></div>
          </div>

          <div className="mt-4 rounded-xl border border-line bg-surface-subtle px-3.5 py-3 text-xs leading-5 text-ink-muted">
            最近发送：<span className="font-medium text-ink-secondary">{formatDateTime(settings?.lastDispatchAt ?? null)}</span>
          </div>

          <div className="mt-auto pt-5">
            <Button type="button" onClick={() => void dispatchNow()} disabled={Boolean(busy) || enabledChannels === 0} className="w-full">
              {busy === "dispatch" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}立即发送当前提醒
            </Button>
            <p className="mt-2 text-center text-[11px] leading-5 text-ink-muted">手动发送会包含当前生命周期提醒与 Condition，但仍遵守渠道发送范围。</p>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden" data-notification-section="channels">
        <div className="flex flex-col gap-3 border-b border-line p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div>
            <div className="flex items-center gap-2 font-semibold text-ink"><Radio className="h-4 w-4 text-brand" />通知渠道</div>
            <p className="mt-1 text-xs leading-5 text-ink-muted">旧版本中选择“全部来源 / 全部状态”的渠道会自动扩展为包含低余额与同步健康 Condition，无需重新配置。</p>
          </div>
          <span className="w-fit rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">{enabledChannels} 个启用</span>
        </div>

        {loading ? (
          <div className="flex min-h-48 items-center justify-center text-sm text-ink-muted"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载通知渠道…</div>
        ) : channels.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center px-5 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand"><MessageSquareText className="h-5 w-5" /></div>
            <div className="mt-4 text-sm font-semibold text-ink">还没有通知渠道</div>
            <div className="mt-1 max-w-lg text-xs leading-5 text-ink-muted">添加 Bark、Gotify、Telegram Bot 或通用 Webhook 后，先发送测试通知确认配置。</div>
            <Button type="button" size="sm" onClick={() => setForm(emptyForm())} className="mt-4"><Plus className="mr-2 h-3.5 w-3.5" />添加第一个渠道</Button>
          </div>
        ) : (
          <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-2">
            {channels.map((channel) => {
              const ChannelIcon = channelTypeIcon(channel.type);
              return (
                <div key={channel.id} className="rounded-2xl border border-line bg-surface p-4 transition hover:border-line-strong hover:shadow-card">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${channel.enabled ? "bg-brand-soft text-brand" : "bg-surface-subtle text-ink-muted"}`}>
                      <ChannelIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{channel.name}</span>
                        <span className="rounded-md border border-line bg-surface-subtle px-2 py-0.5 text-[10px] text-ink-muted">{getNotificationChannelTypeLabel(channel.type)}</span>
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${channel.enabled ? "bg-emerald-50 text-emerald-700" : "bg-surface-subtle text-ink-muted"}`}>{channel.enabled ? "已启用" : "已停用"}</span>
                      </div>
                      <div className="mt-1.5 truncate text-xs text-ink-muted">{channelSummary(channel)}</div>
                      <div className="mt-1 text-[11px] text-ink-muted">{channelFilterSummary(channel)}</div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-line pt-3">
                    <Button type="button" variant="secondary" size="sm" onClick={() => void testChannel(channel)} disabled={Boolean(busy)}>
                      {busy === `test:${channel.id}` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Radio className="mr-1.5 h-3.5 w-3.5" />}测试
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setForm({ id: channel.id, name: channel.name, type: channel.type, enabled: channel.enabled, config: { ...initialConfig(channel.type), ...channel.config }, secrets: channel.secrets })}>
                      <Edit3 className="mr-1.5 h-3.5 w-3.5" />编辑
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => void removeChannel(channel)} disabled={Boolean(busy)} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />删除
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden" data-notification-section="history">
        <div className="flex items-start justify-between gap-4 border-b border-line p-5 sm:p-6">
          <div>
            <div className="flex items-center gap-2 font-semibold text-ink"><Clock3 className="h-4 w-4 text-brand" />最近发送记录</div>
            <p className="mt-1 text-xs text-ink-muted">Condition 与每日摘要都使用同一发送记录和去重机制。</p>
          </div>
          <div className="hidden text-right sm:block"><div className="text-xs font-medium text-ink-secondary">最近 10 条</div><div className="mt-1 text-[11px] text-ink-muted">成功 {recentSuccess} · 失败 {recentFailures}</div></div>
        </div>
        {deliveries.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center text-sm text-ink-muted">还没有发送记录。</div>
        ) : (
          <div className="divide-y divide-line">
            {deliveries.slice(0, 50).map((item) => (
              <div key={item.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {item.status === "success" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-rose-500" />}
                    <span className="font-medium text-ink-secondary">{item.channelName}</span>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${item.status === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{item.status === "success" ? "成功" : "失败"}</span>
                    <span className="text-xs text-ink-muted">{item.kind === "test" ? "测试通知" : statusLabel(item.reminderStatus)}</span>
                  </div>
                  {item.error ? <div className="mt-1 truncate text-xs text-rose-500">{item.error}</div> : item.reminderKey ? <div className="mt-1 truncate text-xs text-ink-muted">{item.reminderKey}{item.dueDate ? ` · ${item.dueDate}` : ""}</div> : null}
                </div>
                <div className="shrink-0 text-xs text-ink-muted">{formatDateTime(item.createdAt)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {templateOpen && settings ? (
        <NotificationTemplateModal
          templates={{ titleTemplate: settings.titleTemplate, bodyTemplate: settings.bodyTemplate, itemTemplate: settings.itemTemplate }}
          onClose={() => setTemplateOpen(false)}
          onSaved={(templates) => {
            setSettings({ ...settings, ...templates });
            setNotice("通知模板已单独保存。每日通知计划没有被修改。");
            setError("");
          }}
        />
      ) : null}

      {form ? (
        <Dialog size="lg" onClose={() => setForm(null)} busy={busy === "channel"} dataAttribute="notification-channel-editor">
          <DialogHeader
            eyebrow="通知渠道"
            icon={<Webhook className="h-3.5 w-3.5" />}
            title={form.id ? "编辑通知渠道" : "新增通知渠道"}
            description="配置推送目标、发送范围和敏感凭据。保存后建议先执行一次测试发送。"
            onClose={() => setForm(null)}
            busy={busy === "channel"}
          />
          <DialogBody className="space-y-5">
            <FormSection title="基本信息" description="用于区分不同设备、机器人或自托管通知端点。">
              <FormGrid columns={2}>
                <FormField label="渠道名称" required>
                  <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如 Telegram" />
                </FormField>
                <FormField label="渠道类型" required>
                  <Select value={form.type} onChange={(event) => {
                    const type = event.target.value as NotificationChannelType;
                    setForm({ ...form, type, config: initialConfig(type), secrets: undefined });
                  }}>
                    {NOTIFICATION_CHANNEL_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </Select>
                </FormField>
              </FormGrid>
              <label className="flex items-center gap-3 rounded-xl border border-line bg-surface-subtle px-4 py-3 text-sm text-ink-secondary">
                <input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} className="h-4 w-4 accent-brand" />
                <span><span className="font-medium text-ink">启用这个渠道</span><span className="ml-2 text-xs text-ink-muted">关闭后保留配置但不会参与自动或手动发送。</span></span>
              </label>
            </FormSection>

            <FormSection title="连接配置" description="敏感 Token / Key 编辑时留空会继续保留现有值。">
              <ChannelFields form={form} setForm={setForm} />
            </FormSection>

            <FormSection title="发送范围" description="只把你关心的提醒来源和状态发送到这个渠道。">
              <ChannelFilterFields form={form} setForm={setForm} />
            </FormSection>

            <FormSection title="凭据安全">
              <div className="grid gap-3 sm:grid-cols-2">
                <DialogAlert tone="success"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />已有敏感凭据不会回传到浏览器。编辑渠道时密码框留空会继续保留原 Token / Key。</DialogAlert>
                <DialogAlert tone="warning">完整备份仍包含通知凭据，因此导出的备份文件必须按敏感数据管理。</DialogAlert>
              </div>
            </FormSection>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setForm(null)} disabled={busy === "channel"}>取消</Button>
            <Button type="button" onClick={() => void saveChannel()} disabled={Boolean(busy)}>
              {busy === "channel" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Webhook className="mr-2 h-4 w-4" />}{form.id ? "保存渠道" : "添加渠道"}
            </Button>
          </DialogFooter>
        </Dialog>
      ) : null}

      <div className="rounded-xl border border-line bg-surface px-4 py-3 text-xs leading-5 text-ink-muted">
        <Clock3 className="mr-1 inline h-3.5 w-3.5" />每日到期提醒与实时 Condition 共用通知渠道、模板和发送历史；同步健康恢复时可以发送一次恢复通知，恢复后不会继续发送异常提醒。
      </div>
    </div>
  );
}
