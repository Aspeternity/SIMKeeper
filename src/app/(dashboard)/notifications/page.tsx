"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  Braces,
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
  X,
  XCircle,
} from "lucide-react";
import { NotificationTemplateModal, type NotificationTemplates } from "@/components/notifications/notification-template-modal";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModalPortal } from "@/components/ui/modal-portal";
import { NOTIFICATION_CHANNEL_TYPES, getNotificationChannelTypeLabel, type NotificationChannelType } from "@/lib/notification-options";

type ReminderKind = "sim_validity" | "keep_alive";
type ReminderStatus = "upcoming" | "today" | "grace" | "overdue" | "unscheduled";

type ChannelFilter = {
  kinds: ReminderKind[];
  statuses: ReminderStatus[];
};

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

type ScheduleDraft = {
  enabled: boolean;
  dailyTime: string;
  milestoneDays: number[];
  catchUpEnabled: boolean;
};

type FormState = {
  id?: number;
  name: string;
  type: NotificationChannelType;
  enabled: boolean;
  config: Record<string, unknown>;
  secrets?: Record<string, boolean>;
};

const MILESTONE_OPTIONS = [30, 14, 7, 3, 1, 0];
const KIND_OPTIONS: Array<{ value: ReminderKind; label: string }> = [
  { value: "sim_validity", label: "号码有效期" },
  { value: "keep_alive", label: "保号规则" },
];
const STATUS_OPTIONS: Array<{ value: ReminderStatus; label: string }> = [
  { value: "upcoming", label: "即将到期" },
  { value: "today", label: "今天到期" },
  { value: "grace", label: "宽限期" },
  { value: "overdue", label: "已逾期" },
  { value: "unscheduled", label: "待设置日期" },
];

function defaultFilters(): ChannelFilter {
  return {
    kinds: KIND_OPTIONS.map((item) => item.value),
    statuses: STATUS_OPTIONS.map((item) => item.value),
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
  return {
    enabled: settings.enabled,
    dailyTime: settings.dailyTime,
    milestoneDays: [...settings.milestoneDays],
    catchUpEnabled: settings.catchUpEnabled,
  };
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
  return {
    kinds: kinds.length ? kinds : defaultFilters().kinds,
    statuses: statuses.length ? statuses : defaultFilters().statuses,
  };
}

function formFilters(form: FormState): ChannelFilter {
  const raw = form.config.filters;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultFilters();
  const record = raw as Record<string, unknown>;
  const kinds = Array.isArray(record.kinds) ? record.kinds.filter((value): value is ReminderKind => KIND_OPTIONS.some((item) => item.value === value)) : [];
  const statuses = Array.isArray(record.statuses) ? record.statuses.filter((value): value is ReminderStatus => STATUS_OPTIONS.some((item) => item.value === value)) : [];
  return { kinds, statuses };
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
  return `${filters.kinds.length === 2 ? "全部来源" : filters.kinds.map((kind) => KIND_OPTIONS.find((item) => item.value === kind)?.label).join("、")} · ${filters.statuses.length} 种状态`;
}

function secretPlaceholder(form: FormState, key: string, fallback: string) {
  return form.id && form.secrets?.[key] ? "已保存；留空保持不变" : fallback;
}

function ChannelFields({ form, setForm }: { form: FormState; setForm: (value: FormState) => void }) {
  function setConfig(key: string, value: unknown) {
    setForm({ ...form, config: { ...form.config, [key]: value } });
  }

  if (form.type === "webhook") {
    return (
      <div className="grid gap-4">
        <label className="grid gap-2 text-sm text-slate-600">
          Webhook URL
          <Input value={String(form.config.url ?? "")} onChange={(event) => setConfig("url", event.target.value)} placeholder="https://example.com/webhook" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm text-slate-600">
            请求方式
            <select value={String(form.config.method ?? "POST")} onChange={(event) => setConfig("method", event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400">
              <option value="POST">POST · JSON</option>
              <option value="GET">GET · Query 参数</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm text-slate-600">
            Bearer Token（可选）
            <Input type="password" value={String(form.config.bearerToken ?? "")} onChange={(event) => setConfig("bearerToken", event.target.value)} placeholder={secretPlaceholder(form, "bearerToken", "可选鉴权令牌")} autoComplete="new-password" />
          </label>
        </div>
      </div>
    );
  }

  if (form.type === "bark") {
    return (
      <div className="grid gap-4">
        <label className="grid gap-2 text-sm text-slate-600">
          Bark 服务器
          <Input value={String(form.config.serverUrl ?? "")} onChange={(event) => setConfig("serverUrl", event.target.value)} placeholder="https://api.day.app" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm text-slate-600">
            Device Key
            <Input type="password" value={String(form.config.deviceKey ?? "")} onChange={(event) => setConfig("deviceKey", event.target.value)} placeholder={secretPlaceholder(form, "deviceKey", "Bark Device Key")} autoComplete="new-password" />
          </label>
          <label className="grid gap-2 text-sm text-slate-600">
            分组（可选）
            <Input value={String(form.config.group ?? "")} onChange={(event) => setConfig("group", event.target.value)} placeholder="SIMKeeper" />
          </label>
        </div>
      </div>
    );
  }

  if (form.type === "gotify") {
    return (
      <div className="grid gap-4">
        <label className="grid gap-2 text-sm text-slate-600">
          Gotify 服务器
          <Input value={String(form.config.serverUrl ?? "")} onChange={(event) => setConfig("serverUrl", event.target.value)} placeholder="https://gotify.example.com" />
        </label>
        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <label className="grid gap-2 text-sm text-slate-600">
            Application Token
            <Input type="password" value={String(form.config.token ?? "")} onChange={(event) => setConfig("token", event.target.value)} placeholder={secretPlaceholder(form, "token", "Gotify Application Token")} autoComplete="new-password" />
          </label>
          <label className="grid gap-2 text-sm text-slate-600">
            优先级
            <Input type="number" min="-10" max="10" value={String(form.config.priority ?? 5)} onChange={(event) => setConfig("priority", Number(event.target.value))} />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <label className="grid gap-2 text-sm text-slate-600">
        Telegram API 地址
        <Input value={String(form.config.apiBaseUrl ?? "")} onChange={(event) => setConfig("apiBaseUrl", event.target.value)} placeholder="https://api.telegram.org" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm text-slate-600">
          Bot Token
          <Input type="password" value={String(form.config.botToken ?? "")} onChange={(event) => setConfig("botToken", event.target.value)} placeholder={secretPlaceholder(form, "botToken", "123456:ABC...")} autoComplete="new-password" />
        </label>
        <label className="grid gap-2 text-sm text-slate-600">
          Chat ID
          <Input value={String(form.config.chatId ?? "")} onChange={(event) => setConfig("chatId", event.target.value)} placeholder="例如 123456789 或 -100..." />
        </label>
      </div>
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
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="text-sm font-medium text-slate-700">发送范围</div>
      <p className="mt-1 text-xs leading-5 text-slate-400">只把选中的提醒来源和状态发送到这个渠道；测试通知不受这里限制。</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-medium text-slate-500">提醒来源</div>
          <div className="space-y-2">
            {KIND_OPTIONS.map((item) => (
              <label key={item.value} className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={filters.kinds.includes(item.value)} onChange={() => toggleKind(item.value)} className="h-4 w-4 rounded border-slate-300" />
                {item.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-medium text-slate-500">提醒状态</div>
          <div className="grid grid-cols-2 gap-2">
            {STATUS_OPTIONS.map((item) => (
              <label key={item.value} className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={filters.statuses.includes(item.value)} onChange={() => toggleStatus(item.value)} className="h-4 w-4 rounded border-slate-300" />
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

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const enabledChannels = useMemo(() => channels.filter((channel) => channel.enabled).length, [channels]);
  const recentFailures = useMemo(() => deliveries.filter((item) => item.status === "failed").slice(0, 10).length, [deliveries]);

  function applyChannelData(data: { channels?: Channel[]; deliveries?: Delivery[] }) {
    if (data.channels) setChannels(data.channels);
    if (data.deliveries) setDeliveries(data.deliveries);
  }

  function toggleMilestone(day: number) {
    if (!scheduleDraft) return;
    const exists = scheduleDraft.milestoneDays.includes(day);
    const next = exists ? scheduleDraft.milestoneDays.filter((value) => value !== day) : [...scheduleDraft.milestoneDays, day].sort((a, b) => b - a);
    if (!next.length) return;
    setScheduleDraft({ ...scheduleDraft, milestoneDays: next });
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
      setNotice("通知计划已保存，后台定时器已经按新计划重新预约。");
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
      const response = await fetch("/api/notifications", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form.id ? { action: "channel", channel: form } : { action: "create", channel: form }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "通知渠道保存失败");
      applyChannelData(data);
      setForm(null);
      setNotice(form.id ? "通知渠道已更新。" : "通知渠道已添加，建议先发送测试通知。 ");
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
    if (!window.confirm("立即把提醒中心当前提醒按各渠道的发送范围合并发送吗？手动发送会忽略里程碑和今日自动调度状态。")) return;
    setBusy("dispatch");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dispatch" }) });
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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500"><BellRing className="h-4 w-4" />主动通知</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">通知渠道</h2>
          <p className="mt-1 text-sm text-slate-500">在固定时间把真正值得处理的生命周期提醒合并发送到你的设备或自托管服务。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setTemplateOpen(true)} disabled={!settings || Boolean(busy)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"><Braces className="h-4 w-4" />通知模板</button>
          <button type="button" onClick={() => setForm(emptyForm())} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800"><Plus className="h-4 w-4" />添加渠道</button>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <Card className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="font-medium text-slate-900">每日自动通知</div>
              <p className="mt-1 text-xs leading-5 text-slate-400">这里仅管理什么时候发送。消息长什么样，请使用页面右上角的“通知模板”。</p>
            </div>
            <div className={`rounded-lg px-2.5 py-1 text-xs font-medium ${settings?.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{settings?.enabled ? "自动通知已启用" : "自动通知已关闭"}</div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[1fr_170px_1fr] md:items-end">
            <label className="flex h-10 items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm text-slate-600">
              <input type="checkbox" checked={scheduleDraft?.enabled ?? false} onChange={(event) => scheduleDraft && setScheduleDraft({ ...scheduleDraft, enabled: event.target.checked })} className="h-4 w-4 rounded border-slate-300" />
              启用自动通知总开关
            </label>
            <label className="grid gap-1.5 text-xs text-slate-500">
              每日通知时间
              <Input type="time" step="60" value={scheduleDraft?.dailyTime ?? "09:00"} onChange={(event) => scheduleDraft && setScheduleDraft({ ...scheduleDraft, dailyTime: event.target.value })} />
            </label>
            <label className="flex h-10 items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm text-slate-600">
              <input type="checkbox" checked={scheduleDraft?.catchUpEnabled ?? true} onChange={(event) => scheduleDraft && setScheduleDraft({ ...scheduleDraft, catchUpEnabled: event.target.checked })} className="h-4 w-4 rounded border-slate-300" />
              错过计划时间后补发
            </label>
          </div>

          <div className="mt-5 border-t pt-4">
            <div className="text-xs font-medium text-slate-500">到期前提醒里程碑</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {MILESTONE_OPTIONS.map((day) => {
                const active = scheduleDraft?.milestoneDays.includes(day) ?? false;
                return (
                  <button key={day} type="button" onClick={() => toggleMilestone(day)} disabled={!scheduleDraft} className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${active ? "border-slate-900 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
                    {day === 0 ? "当天" : `${day} 天`}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-400">自动通知只在这些剩余天数发送。逾期后固定在第 1、3、7 天提醒，此后每 7 天一次；“待设置日期”每 7 天提醒一次。</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t pt-4 text-xs text-slate-400">
            <span>时区：{settings?.timeZone ?? "Asia/Shanghai"}</span>
            <span>已保存补发策略：{settings?.catchUpEnabled ? "开启" : "关闭"}</span>
            <span>最近自动调度日期：{settings?.lastScheduledDate ?? "尚未运行"}</span>
            <span>下次自动发送：{settings?.enabled ? formatDateTime(settings?.nextDispatchAt ?? null) : "已关闭"}</span>
          </div>

          <div className="mt-5 flex justify-end border-t pt-4">
            <button type="button" onClick={() => void saveSchedule()} disabled={!scheduleDraft || Boolean(busy)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50">{busy === "schedule" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}保存通知计划</button>
          </div>
        </Card>

        <Card className="p-5">
          <div className="font-medium text-slate-900">当前状态</div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-xl font-semibold text-slate-900">{channels.length}</div><div className="mt-1 text-[11px] text-slate-400">渠道总数</div></div>
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-xl font-semibold text-slate-900">{enabledChannels}</div><div className="mt-1 text-[11px] text-slate-400">已启用</div></div>
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-xl font-semibold text-slate-900">{recentFailures}</div><div className="mt-1 text-[11px] text-slate-400">近期失败</div></div>
          </div>
          <button type="button" onClick={() => void dispatchNow()} disabled={Boolean(busy) || enabledChannels === 0} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-40">{busy === "dispatch" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}立即发送当前提醒</button>
          <p className="mt-2 text-center text-[11px] leading-5 text-slate-400">手动发送忽略里程碑，但仍遵守渠道发送范围并使用当前已保存的通知模板。</p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b p-5">
          <div className="font-medium text-slate-900">通知渠道</div>
          <p className="mt-1 text-xs text-slate-400">敏感凭据只保存在服务端数据库中，读取这个页面时不会把完整 Token / Key 返回到浏览器。</p>
        </div>
        {loading ? (
          <div className="flex min-h-48 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载通知渠道…</div>
        ) : channels.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center text-center"><MessageSquareText className="h-7 w-7 text-slate-300" /><div className="mt-3 text-sm font-medium text-slate-600">还没有通知渠道</div><div className="mt-1 text-xs text-slate-400">添加 Bark、Gotify、Telegram Bot 或通用 Webhook 后，先发送测试通知确认配置。</div></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {channels.map((channel) => (
              <div key={channel.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{channel.name}</span>
                    <span className="rounded-md bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500 ring-1 ring-inset ring-slate-100">{getNotificationChannelTypeLabel(channel.type)}</span>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${channel.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{channel.enabled ? "已启用" : "已停用"}</span>
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-400">{channelSummary(channel)}</div>
                  <div className="mt-1 text-[11px] text-slate-400">{channelFilterSummary(channel)}</div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button type="button" onClick={() => void testChannel(channel)} disabled={Boolean(busy)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">{busy === `test:${channel.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}测试</button>
                  <button type="button" onClick={() => setForm({ id: channel.id, name: channel.name, type: channel.type, enabled: channel.enabled, config: { ...initialConfig(channel.type), ...channel.config }, secrets: channel.secrets })} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50"><Edit3 className="h-3.5 w-3.5" />编辑</button>
                  <button type="button" onClick={() => void removeChannel(channel)} disabled={Boolean(busy)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />删除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b p-5"><div className="font-medium text-slate-900">最近发送记录</div><p className="mt-1 text-xs text-slate-400">一条渠道摘要可能包含多个提醒，因此同一次摘要会留下多条对应的提醒记录，便于追踪和去重。</p></div>
        {deliveries.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center text-sm text-slate-400">还没有发送记录。</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {deliveries.slice(0, 50).map((item) => (
              <div key={item.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {item.status === "success" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-rose-500" />}
                    <span className="font-medium text-slate-700">{item.channelName}</span>
                    <span className="text-xs text-slate-400">{item.kind === "test" ? "测试通知" : statusLabel(item.reminderStatus)}</span>
                  </div>
                  {item.error ? <div className="mt-1 truncate text-xs text-rose-500">{item.error}</div> : item.reminderKey ? <div className="mt-1 truncate text-xs text-slate-400">{item.reminderKey}{item.dueDate ? ` · ${item.dueDate}` : ""}</div> : null}
                </div>
                <div className="shrink-0 text-xs text-slate-400">{formatDateTime(item.createdAt)}</div>
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
        <ModalPortal onBackdropClick={() => !busy && setForm(null)}>
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
            <div className="flex items-start justify-between border-b px-6 py-5">
              <div><div className="text-xs font-medium text-slate-400">通知渠道</div><h3 className="mt-1 text-xl font-semibold text-slate-950">{form.id ? "编辑通知渠道" : "新增通知渠道"}</h3></div>
              <button type="button" onClick={() => !busy && setForm(null)} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm text-slate-600">渠道名称<Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如 Telegram" /></label>
                <label className="grid gap-2 text-sm text-slate-600">
                  渠道类型
                  <select value={form.type} onChange={(event) => { const type = event.target.value as NotificationChannelType; setForm({ ...form, type, config: initialConfig(type), secrets: undefined }); }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400">
                    {NOTIFICATION_CHANNEL_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} className="h-4 w-4 rounded border-slate-300" />启用这个渠道</label>
              <ChannelFields form={form} setForm={setForm} />
              <ChannelFilterFields form={form} setForm={setForm} />
              <div className="rounded-xl bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-700"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />已有敏感凭据不会回传到浏览器。编辑渠道时密码框留空会继续保留原 Token / Key；只有输入新值才会替换。</div>
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700">完整备份仍包含通知凭据，因此导出的备份文件必须按敏感数据管理，不要上传公开仓库或公开网盘。</div>
            </div>
            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <button type="button" onClick={() => !busy && setForm(null)} className="h-10 rounded-xl border px-4 text-sm text-slate-500 transition hover:bg-slate-50">取消</button>
              <button type="button" onClick={() => void saveChannel()} disabled={Boolean(busy)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50">{busy === "channel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Webhook className="h-4 w-4" />}{form.id ? "保存渠道" : "添加渠道"}</button>
            </div>
          </div>
        </ModalPortal>
      ) : null}

      <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-xs leading-5 text-slate-400"><Clock3 className="mr-1 inline h-3.5 w-3.5" />自动通知只在里程碑日的设定时间运行一次；通知计划与通知模板现在分别保存，修改其中一个不会覆盖另一个。</div>
    </div>
  );
}
