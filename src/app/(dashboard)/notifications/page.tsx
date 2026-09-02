"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  CheckCircle2,
  Clock3,
  Edit3,
  Loader2,
  MessageSquareText,
  Plus,
  Radio,
  Save,
  Send,
  Trash2,
  Webhook,
  X,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModalPortal } from "@/components/ui/modal-portal";
import { NOTIFICATION_CHANNEL_TYPES, getNotificationChannelTypeLabel, type NotificationChannelType } from "@/lib/notification-options";

type Channel = {
  id: number;
  name: string;
  type: NotificationChannelType;
  enabled: boolean;
  config: Record<string, unknown>;
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

type NotificationSettings = {
  enabled: boolean;
  dailyHour: number;
  lastDispatchAt: string | null;
  timeZone: string;
  checkIntervalMinutes: number;
};

type FormState = {
  id?: number;
  name: string;
  type: NotificationChannelType;
  enabled: boolean;
  config: Record<string, string | number>;
};

function initialConfig(type: NotificationChannelType): Record<string, string | number> {
  if (type === "webhook") return { url: "", method: "POST", bearerToken: "" };
  if (type === "bark") return { serverUrl: "https://api.day.app", deviceKey: "", group: "SIMKeeper" };
  if (type === "gotify") return { serverUrl: "", token: "", priority: 5 };
  return { apiBaseUrl: "https://api.telegram.org", botToken: "", chatId: "" };
}

function emptyForm(): FormState {
  return { name: "", type: "webhook", enabled: true, config: initialConfig("webhook") };
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

function channelSummary(channel: Channel) {
  if (channel.type === "webhook") {
    const value = configString(channel, "url");
    return value || "未填写 Webhook URL";
  }
  if (channel.type === "bark") {
    const server = configString(channel, "serverUrl") || "https://api.day.app";
    return `${server} · Device Key 已配置`;
  }
  if (channel.type === "gotify") return configString(channel, "serverUrl") || "未填写 Gotify 地址";
  return `Chat ID ${configString(channel, "chatId") || "未填写"}`;
}

function ChannelFields({ form, setForm }: { form: FormState; setForm: (value: FormState) => void }) {
  function setConfig(key: string, value: string | number) {
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
            <Input type="password" value={String(form.config.bearerToken ?? "")} onChange={(event) => setConfig("bearerToken", event.target.value)} placeholder="可选鉴权令牌" autoComplete="off" />
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
            <Input type="password" value={String(form.config.deviceKey ?? "")} onChange={(event) => setConfig("deviceKey", event.target.value)} placeholder="Bark Device Key" autoComplete="off" />
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
            <Input type="password" value={String(form.config.token ?? "")} onChange={(event) => setConfig("token", event.target.value)} placeholder="Gotify Application Token" autoComplete="off" />
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
          <Input type="password" value={String(form.config.botToken ?? "")} onChange={(event) => setConfig("botToken", event.target.value)} placeholder="123456:ABC..." autoComplete="off" />
        </label>
        <label className="grid gap-2 text-sm text-slate-600">
          Chat ID
          <Input value={String(form.config.chatId ?? "")} onChange={(event) => setConfig("chatId", event.target.value)} placeholder="例如 123456789 或 -100..." />
        </label>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<FormState | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "通知数据加载失败");
      setSettings(data.settings);
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

  function applyData(data: { settings?: NotificationSettings; channels?: Channel[]; deliveries?: Delivery[] }) {
    if (data.settings) setSettings(data.settings);
    if (data.channels) setChannels(data.channels);
    if (data.deliveries) setDeliveries(data.deliveries);
  }

  async function saveSettings() {
    if (!settings) return;
    setBusy("settings");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settings", settings: { enabled: settings.enabled, dailyHour: settings.dailyHour } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "通知设置保存失败");
      applyData(data);
      setNotice("通知计划已保存。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "通知设置保存失败");
    } finally {
      setBusy("");
    }
  }

  async function saveChannel() {
    if (!form) return;
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
      applyData(data);
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
      applyData(data);
      setNotice(`${channel.name} 测试通知发送成功。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "测试通知发送失败");
      await loadData();
    } finally {
      setBusy("");
    }
  }

  async function dispatchNow() {
    if (!window.confirm("立即把提醒中心当前的所有提醒发送到全部已启用渠道吗？手动发送会忽略今日自动去重。")) return;
    setBusy("dispatch");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dispatch" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "发送当前提醒失败");
      applyData(data);
      setNotice(`发送完成：成功 ${data.result.sent}，失败 ${data.result.failed}。当前提醒 ${data.result.reminders} 条，启用渠道 ${data.result.channels} 个。`);
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
      applyData(data);
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
          <p className="mt-1 text-sm text-slate-500">把提醒中心的号码有效期和保号提醒主动发送到你的设备或自托管服务。</p>
        </div>
        <button type="button" onClick={() => setForm(emptyForm())} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800"><Plus className="h-4 w-4" />添加渠道</button>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="font-medium text-slate-900">自动通知计划</div>
              <p className="mt-1 text-xs leading-5 text-slate-400">容器内每 15 分钟检查一次；每天到达设定时间后，只对同一提醒/渠道自动尝试一次。</p>
            </div>
            <div className={`rounded-lg px-2.5 py-1 text-xs font-medium ${settings?.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{settings?.enabled ? "自动通知已启用" : "自动通知已关闭"}</div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
            <label className="flex h-10 items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm text-slate-600">
              <input type="checkbox" checked={settings?.enabled ?? false} onChange={(event) => settings && setSettings({ ...settings, enabled: event.target.checked })} className="h-4 w-4 rounded border-slate-300" />
              启用自动通知总开关
            </label>
            <label className="grid gap-1.5 text-xs text-slate-500">
              每日开始发送时间
              <select value={settings?.dailyHour ?? 9} onChange={(event) => settings && setSettings({ ...settings, dailyHour: Number(event.target.value) })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400">
                {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}
              </select>
            </label>
            <button type="button" onClick={() => void saveSettings()} disabled={!settings || Boolean(busy)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">{busy === "settings" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}保存计划</button>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t pt-4 text-xs text-slate-400">
            <span>时区：{settings?.timeZone ?? "Asia/Shanghai"}</span>
            <span>检查间隔：{settings?.checkIntervalMinutes ?? 15} 分钟</span>
            <span>最近调度：{formatDateTime(settings?.lastDispatchAt ?? null)}</span>
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
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b p-5">
          <div className="font-medium text-slate-900">通知渠道</div>
          <p className="mt-1 text-xs text-slate-400">渠道凭据会保存在 SIMKeeper 数据库和完整备份中，请把备份文件按敏感数据管理。</p>
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
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button type="button" onClick={() => void testChannel(channel)} disabled={Boolean(busy)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">{busy === `test:${channel.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}测试</button>
                  <button type="button" onClick={() => setForm({ id: channel.id, name: channel.name, type: channel.type, enabled: channel.enabled, config: { ...initialConfig(channel.type), ...channel.config } as Record<string, string | number> })} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50"><Edit3 className="h-3.5 w-3.5" />编辑</button>
                  <button type="button" onClick={() => void removeChannel(channel)} disabled={Boolean(busy)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />删除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b p-5"><div className="font-medium text-slate-900">最近发送记录</div><p className="mt-1 text-xs text-slate-400">记录测试通知和提醒发送结果；自动通知失败后当天不会反复重试，次日会再次尝试。</p></div>
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

      {form ? (
        <ModalPortal onBackdropClick={() => !busy && setForm(null)}>
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
            <div className="flex items-start justify-between border-b px-6 py-5">
              <div><div className="text-xs font-medium text-slate-400">通知渠道</div><h3 className="mt-1 text-xl font-semibold text-slate-950">{form.id ? "编辑通知渠道" : "新增通知渠道"}</h3></div>
              <button type="button" onClick={() => !busy && setForm(null)} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm text-slate-600">渠道名称<Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如 iPhone Bark" /></label>
                <label className="grid gap-2 text-sm text-slate-600">
                  渠道类型
                  <select value={form.type} onChange={(event) => { const type = event.target.value as NotificationChannelType; setForm({ ...form, type, config: initialConfig(type) }); }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400">
                    {NOTIFICATION_CHANNEL_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} className="h-4 w-4 rounded border-slate-300" />启用这个渠道</label>
              <ChannelFields form={form} setForm={setForm} />
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700">Bot Token、Device Key、Application Token 和 Bearer Token 都属于敏感凭据，会进入完整备份。请不要把导出的备份上传到公开位置。</div>
            </div>
            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <button type="button" onClick={() => !busy && setForm(null)} className="h-10 rounded-xl border px-4 text-sm text-slate-500 transition hover:bg-slate-50">取消</button>
              <button type="button" onClick={() => void saveChannel()} disabled={Boolean(busy)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50">{busy === "channel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Webhook className="h-4 w-4" />}{form.id ? "保存渠道" : "添加渠道"}</button>
            </div>
          </div>
        </ModalPortal>
      ) : null}

      <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-xs leading-5 text-slate-400"><Clock3 className="mr-1 inline h-3.5 w-3.5" />自动通知只发送提醒中心当前存在的生命周期提醒。完成充值、更新有效期或调整保号规则后，提醒从中心消失，也就不会继续发送。</div>
    </div>
  );
}
