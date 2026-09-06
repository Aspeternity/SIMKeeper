"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Cable,
  CheckCircle2,
  Clock3,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModalPortal } from "@/components/ui/modal-portal";
import {
  CONNECTOR_SYNC_INTERVAL_OPTIONS,
  getConnectorAccountStatusLabel,
  getConnectorSyncIntervalLabel,
} from "@/lib/carrier-connectors/types";

type SyncSnapshot = {
  id: number;
  simId: number;
  connectorId: number | null;
  sourceName: string;
  sourceProvider: string;
  balance: number | null;
  currencyCode: string | null;
  balanceValidUntil: string | null;
  accountStatus: string;
  syncedAt: string;
  stale: boolean;
};

type LinkedSim = {
  id: number;
  label: string;
  phoneNumber: string | null;
  carrierName: string;
  countryCode: string;
  latestSnapshot: SyncSnapshot | null;
};

type ConnectorRecord = {
  id: number;
  name: string;
  provider: string;
  providerLabel: string;
  status: "connected" | "error";
  syncIntervalMinutes: number;
  providerConfig: Record<string, unknown>;
  hasCredentials: boolean;
  lastSyncedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  nextSyncAt: string | null;
  stale: boolean;
  linkedSims: LinkedSim[];
  createdAt: string;
  updatedAt: string;
};

type ProviderConfigField = {
  key: string;
  label: string;
  description?: string;
  required?: boolean;
  type?: "text" | "url" | "number" | "date" | "select" | "checkbox" | "textarea";
  placeholder?: string;
  defaultValue?: string | number | boolean;
  options?: Array<{ value: string; label: string }>;
};

type ProviderCredentialField = {
  key: string;
  label: string;
  description?: string;
  required?: boolean;
  placeholder?: string;
};

type ProviderRecord = {
  id: string;
  label: string;
  description: string;
  configFields: ProviderConfigField[];
  credentialFields: ProviderCredentialField[];
};

type SimRecord = {
  id: number;
  label: string;
  phoneNumber: string | null;
  carrierName: string;
  countryCode: string;
};

type EditorState = {
  id: number | null;
  name: string;
  provider: string;
  syncIntervalMinutes: number;
  simIds: number[];
  config: Record<string, string | boolean>;
  credentials: Record<string, string>;
  clearCredentials: boolean;
};

function formatDateTime(value: string | null) {
  if (!value) return "尚未同步";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatBalance(snapshot: SyncSnapshot | null) {
  if (!snapshot || snapshot.balance === null) return "余额未知";
  return `${snapshot.balance} ${snapshot.currencyCode || ""}`.trim();
}

function configValues(provider: ProviderRecord | undefined, source?: Record<string, unknown>) {
  const values: Record<string, string | boolean> = {};
  for (const field of provider?.configFields ?? []) {
    const existing = source?.[field.key];
    if (field.type === "checkbox") {
      values[field.key] = typeof existing === "boolean"
        ? existing
        : typeof field.defaultValue === "boolean"
          ? field.defaultValue
          : false;
      continue;
    }
    if (existing !== null && existing !== undefined) {
      values[field.key] = String(existing);
    } else if (field.defaultValue !== null && field.defaultValue !== undefined) {
      values[field.key] = String(field.defaultValue);
    } else {
      values[field.key] = "";
    }
  }
  return values;
}

function editorForProvider(provider: ProviderRecord | undefined): EditorState {
  const providerId = provider?.id || "mock";
  return {
    id: null,
    name: providerId === "dito" ? "我的 DITO" : "",
    provider: providerId,
    syncIntervalMinutes: providerId === "dito" ? 0 : 720,
    simIds: [],
    config: configValues(provider),
    credentials: {},
    clearCredentials: false,
  };
}

function providerSupportsSim(providerId: string, sim: SimRecord) {
  if (providerId !== "dito") return true;
  return sim.countryCode.toUpperCase() === "PH" && sim.carrierName.toLowerCase().includes("dito");
}

export default function CarrierConnectorsPage() {
  const [connectors, setConnectors] = useState<ConnectorRecord[]>([]);
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [sims, setSims] = useState<SimRecord[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [connectorsResponse, simsResponse] = await Promise.all([
        fetch("/api/carrier-connectors", { cache: "no-store" }),
        fetch("/api/sims", { cache: "no-store" }),
      ]);
      const [connectorData, simData] = await Promise.all([
        connectorsResponse.json(),
        simsResponse.json(),
      ]);
      if (!connectorsResponse.ok) throw new Error(connectorData.error || "运营商连接加载失败");
      if (!simsResponse.ok) throw new Error(simData.error || "号码数据加载失败");
      setConnectors(connectorData.connectors || []);
      setProviders(connectorData.providers || []);
      setSims(simData.sims || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "运营商连接加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const assignedBySim = useMemo(() => {
    const result = new Map<number, number>();
    for (const connector of connectors) {
      for (const sim of connector.linkedSims) result.set(sim.id, connector.id);
    }
    return result;
  }, [connectors]);

  const currentProvider = editor
    ? providers.find((provider) => provider.id === editor.provider)
    : undefined;
  const editingConnector = editor?.id
    ? connectors.find((connector) => connector.id === editor.id)
    : undefined;

  function openCreate() {
    const preferred = providers.find((provider) => provider.id === "dito") || providers[0];
    setError("");
    setNotice("");
    setEditor(editorForProvider(preferred));
  }

  function openEdit(connector: ConnectorRecord) {
    const provider = providers.find((item) => item.id === connector.provider);
    setError("");
    setNotice("");
    setEditor({
      id: connector.id,
      name: connector.name,
      provider: connector.provider,
      syncIntervalMinutes: connector.syncIntervalMinutes,
      simIds: connector.linkedSims.map((sim) => sim.id),
      config: configValues(provider, connector.providerConfig),
      credentials: {},
      clearCredentials: false,
    });
  }

  function changeProvider(providerId: string) {
    const provider = providers.find((item) => item.id === providerId);
    setEditor((current) => current ? {
      ...current,
      provider: providerId,
      name: current.name || (providerId === "dito" ? "我的 DITO" : ""),
      syncIntervalMinutes: providerId === "dito" ? 0 : current.syncIntervalMinutes,
      simIds: current.simIds.filter((id) => {
        const sim = sims.find((item) => item.id === id);
        return sim ? providerSupportsSim(providerId, sim) : false;
      }),
      config: configValues(provider),
      credentials: {},
      clearCredentials: false,
    } : current);
  }

  function toggleSim(id: number) {
    setEditor((current) => {
      if (!current) return current;
      return {
        ...current,
        simIds: current.simIds.includes(id)
          ? current.simIds.filter((simId) => simId !== id)
          : [...current.simIds, id],
      };
    });
  }

  function setConfig(key: string, value: string | boolean) {
    setEditor((current) => current ? {
      ...current,
      config: { ...current.config, [key]: value },
    } : current);
  }

  function setCredential(key: string, value: string) {
    setEditor((current) => current ? {
      ...current,
      credentials: { ...current.credentials, [key]: value },
      clearCredentials: value ? false : current.clearCredentials,
    } : current);
  }

  function buildProviderConfig(provider: ProviderRecord, state: EditorState) {
    const result: Record<string, unknown> = {};
    for (const field of provider.configFields ?? []) {
      const value = state.config[field.key];
      if (field.type === "checkbox") {
        result[field.key] = Boolean(value);
        continue;
      }
      const text = typeof value === "string" ? value.trim() : "";
      if (field.required && !text) throw new Error(`请填写${field.label}`);
      if (field.type === "number") {
        if (!text) {
          result[field.key] = null;
          continue;
        }
        const number = Number(text);
        if (!Number.isFinite(number)) throw new Error(`${field.label}必须是有效数字`);
        result[field.key] = number;
        continue;
      }
      result[field.key] = text;
    }
    return result;
  }

  async function saveEditor() {
    if (!editor || !currentProvider) return;

    try {
      const providerConfig = buildProviderConfig(currentProvider, editor);
      if (editor.provider === "mock") {
        const balance = providerConfig.balance;
        if (typeof balance === "number" && balance < 0) throw new Error("模拟余额不能小于 0");
        if (typeof balance === "number") {
          const currency = String(providerConfig.currencyCode || "").toUpperCase();
          if (!/^[A-Z]{3}$/.test(currency)) throw new Error("填写模拟余额时请输入 3 位币种代码");
          providerConfig.currencyCode = currency;
        }
      }
      if (editor.provider === "dito") {
        const requestUrl = String(providerConfig.requestUrl || "");
        if (!requestUrl.startsWith("https://")) throw new Error("DITO 请求 URL 必须使用 HTTPS");
        if (!editor.simIds.length) throw new Error("DITO 连接至少需要关联一张 DITO 号码");
      }

      const credentials = Object.fromEntries(
        Object.entries(editor.credentials)
          .map(([key, value]) => [key, value.trim()] as const)
          .filter(([, value]) => Boolean(value)),
      );
      for (const field of currentProvider.credentialFields ?? []) {
        if (field.required && !editingConnector?.hasCredentials && !credentials[field.key]) {
          throw new Error(`请填写${field.label}`);
        }
      }

      setBusy(editor.id ? `save:${editor.id}` : "create");
      setError("");
      setNotice("");
      const body: Record<string, unknown> = {
        name: editor.name,
        provider: editor.provider,
        syncIntervalMinutes: editor.syncIntervalMinutes,
        simIds: editor.simIds,
        providerConfig,
        clearCredentials: editor.clearCredentials,
      };
      if (editor.id) body.id = editor.id;
      if (Object.keys(credentials).length) body.credentials = credentials;

      const response = await fetch("/api/carrier-connectors", {
        method: editor.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存运营商连接失败");
      setEditor(null);
      setNotice(editor.id ? "运营商连接已更新。" : "运营商连接已创建，可以执行首次同步。");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存运营商连接失败");
    } finally {
      setBusy("");
    }
  }

  async function syncConnector(connector: ConnectorRecord) {
    setBusy(`sync:${connector.id}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/carrier-connectors/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorId: connector.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "同步失败");
      setNotice(`${connector.name} 已同步 ${data.result?.synced ?? 0} 个号码。`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步失败");
      await loadData();
    } finally {
      setBusy("");
    }
  }

  async function deleteConnector(connector: ConnectorRecord) {
    if (!window.confirm(`确定删除“${connector.name}”吗？\n\n号码不会被删除；已有同步快照会作为历史记录保留。`)) return;
    setBusy(`delete:${connector.id}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/carrier-connectors?id=${connector.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除运营商连接失败");
      setNotice("运营商连接已删除，号码本身未受影响。");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除运营商连接失败");
    } finally {
      setBusy("");
    }
  }

  function renderConfigField(field: ProviderConfigField) {
    const value = editor?.config[field.key];
    if (field.type === "checkbox") {
      return (
        <label key={field.key} className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3 text-xs text-slate-600">
          <input type="checkbox" checked={Boolean(value)} onChange={(event) => setConfig(field.key, event.target.checked)} className="mt-0.5" />
          <span>
            <span className="font-medium text-slate-700">{field.label}</span>
            {field.description ? <span className="mt-0.5 block text-[11px] leading-5 text-slate-400">{field.description}</span> : null}
          </span>
        </label>
      );
    }

    if (field.type === "select") {
      return (
        <label key={field.key} className="space-y-1.5">
          <span className="text-xs font-medium text-slate-600">{field.label}{field.required ? " *" : ""}</span>
          <select value={typeof value === "string" ? value : ""} onChange={(event) => setConfig(field.key, event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none">
            {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {field.description ? <div className="text-[11px] leading-5 text-slate-400">{field.description}</div> : null}
        </label>
      );
    }

    if (field.type === "textarea") {
      return (
        <label key={field.key} className="space-y-1.5 sm:col-span-2">
          <span className="text-xs font-medium text-slate-600">{field.label}{field.required ? " *" : ""}</span>
          <textarea value={typeof value === "string" ? value : ""} onChange={(event) => setConfig(field.key, event.target.value)} placeholder={field.placeholder} rows={4} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
          {field.description ? <div className="text-[11px] leading-5 text-slate-400">{field.description}</div> : null}
        </label>
      );
    }

    return (
      <label key={field.key} className="space-y-1.5">
        <span className="text-xs font-medium text-slate-600">{field.label}{field.required ? " *" : ""}</span>
        <Input
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "url" ? "url" : "text"}
          min={field.type === "number" ? "0" : undefined}
          step={field.type === "number" ? "any" : undefined}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => setConfig(field.key, event.target.value)}
          placeholder={field.placeholder}
        />
        {field.description ? <div className="text-[11px] leading-5 text-slate-400">{field.description}</div> : null}
      </label>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500"><Cable className="h-4 w-4" />自动数据源</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">运营商连接</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">一个连接可以关联多张 SIM。自动数据保存在独立快照中，不覆盖号码里手工维护的余额和号码有效期。</p>
        </div>
        <button type="button" onClick={openCreate} disabled={!providers.length && loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"><Plus className="h-4 w-4" />添加连接</button>
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm leading-6 text-indigo-800">
        <span className="font-medium">alpha.21：</span>已加入首个真实运营商适配器 <span className="font-medium">DITO MyDITO（实验）</span>。由于 DITO 没有公开稳定的账户余额 API，当前采用“导入已登录 MyDITO 余额请求”的方式，不硬编码猜测的私有接口；会话失效时只需要更新加密请求头。
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      {loading ? (
        <Card className="flex min-h-64 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载运营商连接…</Card>
      ) : connectors.length === 0 ? (
        <Card className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
          <Cable className="h-7 w-7 text-slate-300" />
          <div className="mt-3 text-sm font-medium text-slate-700">还没有运营商连接</div>
          <p className="mt-1 max-w-xl text-xs leading-5 text-slate-400">如果你使用 DITO，可以直接添加“DITO MyDITO（实验）”；也可以继续用模拟数据源验证同步流程。</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {connectors.map((connector) => (
            <Card key={connector.id} className="overflow-hidden">
              <div className="flex flex-col gap-4 border-b p-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{connector.name}</h3>
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${connector.status === "error" ? "bg-rose-50 text-rose-700 ring-rose-100" : connector.lastSuccessAt ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-slate-100 text-slate-600 ring-slate-200"}`}>
                      {connector.status === "error" ? "同步失败" : connector.lastSuccessAt ? "已连接" : "等待首次同步"}
                    </span>
                    {connector.provider === "dito" ? <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">实验 Provider</span> : null}
                    {connector.stale && connector.lastSuccessAt ? <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">数据已过期</span> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                    <span>{connector.providerLabel}</span>
                    <span>{getConnectorSyncIntervalLabel(connector.syncIntervalMinutes)}</span>
                    <span>{connector.linkedSims.length} 个号码</span>
                    <span>{connector.hasCredentials ? "凭据已加密保存" : "未保存凭据"}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400"><Clock3 className="h-3.5 w-3.5" />最后成功：{formatDateTime(connector.lastSuccessAt)}{connector.nextSyncAt ? ` · 下次计划：${formatDateTime(connector.nextSyncAt)}` : ""}</div>
                  {connector.lastError ? <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{connector.lastError}</div> : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button type="button" onClick={() => void syncConnector(connector)} disabled={Boolean(busy) || !connector.linkedSims.length} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{busy === `sync:${connector.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}立即同步</button>
                  <button type="button" onClick={() => openEdit(connector)} disabled={Boolean(busy)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Pencil className="h-3.5 w-3.5" />编辑</button>
                  <button type="button" onClick={() => void deleteConnector(connector)} disabled={Boolean(busy)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />删除</button>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {connector.linkedSims.length ? connector.linkedSims.map((sim) => (
                  <div key={sim.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1.4fr)_1fr_1fr_1fr_auto] md:items-center">
                    <div className="min-w-0"><div className="truncate text-sm font-medium text-slate-700">{sim.label}</div><div className="mt-0.5 truncate text-[11px] text-slate-400">{sim.phoneNumber || "未记录号码"} · {sim.carrierName}</div></div>
                    <div><div className="text-[10px] text-slate-400">自动余额</div><div className="mt-0.5 text-xs font-medium text-slate-700">{formatBalance(sim.latestSnapshot)}</div></div>
                    <div><div className="text-[10px] text-slate-400">余额有效期</div><div className="mt-0.5 text-xs font-medium text-slate-700">{sim.latestSnapshot?.balanceValidUntil || "未知"}</div></div>
                    <div><div className="text-[10px] text-slate-400">账户状态</div><div className="mt-0.5 text-xs font-medium text-slate-700">{getConnectorAccountStatusLabel(sim.latestSnapshot?.accountStatus)}</div></div>
                    <div className="text-right text-[11px] text-slate-400">{sim.latestSnapshot ? (sim.latestSnapshot.stale ? "已过期" : formatDateTime(sim.latestSnapshot.syncedAt)) : "尚未同步"}</div>
                  </div>
                )) : <div className="px-5 py-7 text-center text-xs text-slate-400">当前没有关联号码。</div>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {editor ? (
        <ModalPortal onBackdropClick={() => !busy && setEditor(null)}>
          <Card className="flex w-full max-w-4xl flex-col overflow-hidden shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
            <div className="flex items-start justify-between border-b px-5 py-4">
              <div><div className="text-sm font-medium text-slate-500">运营商连接</div><h3 className="mt-1 text-lg font-semibold">{editor.id ? "编辑连接" : "添加连接"}</h3></div>
              <button type="button" onClick={() => setEditor(null)} disabled={Boolean(busy)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5"><span className="text-xs font-medium text-slate-600">连接名称</span><Input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder="例如：我的 DITO" /></label>
                <label className="space-y-1.5"><span className="text-xs font-medium text-slate-600">Provider</span><select value={editor.provider} disabled={Boolean(editor.id)} onChange={(event) => changeProvider(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none disabled:bg-slate-50">{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select><div className="text-[11px] leading-5 text-slate-400">{currentProvider?.description}</div></label>
                <label className="space-y-1.5"><span className="text-xs font-medium text-slate-600">同步频率</span><select value={editor.syncIntervalMinutes} onChange={(event) => setEditor({ ...editor, syncIntervalMinutes: Number(event.target.value) })} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none">{CONNECTOR_SYNC_INTERVAL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              </div>

              {editor.provider === "dito" ? (
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs leading-5 text-indigo-900">
                  <div className="font-medium">如何获取 MyDITO 请求信息</div>
                  <ol className="mt-2 list-decimal space-y-1 pl-4 text-indigo-800">
                    <li>在浏览器打开 <span className="font-medium">my.dito.ph</span> 并正常登录。</li>
                    <li>按 F12 打开开发者工具 → Network，刷新账户首页，找到返回实时 Load Balance 的 JSON 请求。</li>
                    <li>把该请求的最终 Request URL 填入下方；鉴权相关 Header（例如 Authorization / Cookie / x-*）整理成 JSON，填入“鉴权请求头”。</li>
                    <li>首次先保持 JSON 路径为空并点“立即同步”；如果自动识别失败，再按实际响应填写类似 <span className="font-mono">data.balance</span> 的路径。</li>
                  </ol>
                  <div className="mt-2 text-[11px] text-indigo-700">不要把密码或 OTP 填入配置。会话 Token / Cookie 只放在加密凭据字段中；SIMKeeper 只允许该 Provider 访问 HTTPS 的 dito.ph 官方域名，并禁止跟随重定向。</div>
                </div>
              ) : null}

              {(currentProvider?.configFields?.length ?? 0) > 0 ? (
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-sm font-medium text-slate-800">Provider 配置</div>
                  <p className="mt-1 text-xs leading-5 text-slate-400">非敏感请求参数会随连接保存；密码、Token、Cookie 等请只放在下面的加密凭据区。</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">{currentProvider?.configFields.map(renderConfigField)}</div>
                </div>
              ) : null}

              {(currentProvider?.credentialFields?.length ?? 0) > 0 ? (
                <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-800"><KeyRound className="h-4 w-4 text-amber-600" />加密凭据</div>
                  <p className="mt-1 text-xs leading-5 text-slate-400">仅在服务端同步时解密；普通 API、号码列表和连接列表都不会返回明文。</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {currentProvider?.credentialFields.map((field) => (
                      <label key={field.key} className="space-y-1.5 sm:col-span-2">
                        <span className="text-xs font-medium text-slate-600">{field.label}{field.required ? " *" : ""}</span>
                        <Input type="password" value={editor.credentials[field.key] || ""} onChange={(event) => setCredential(field.key, event.target.value)} placeholder={editor.id && editingConnector?.hasCredentials ? "留空保持现有加密凭据" : field.placeholder || "可选"} autoComplete="new-password" />
                        {field.description ? <div className="text-[11px] leading-5 text-slate-400">{field.description}</div> : null}
                      </label>
                    ))}
                  </div>
                  {editor.id && editingConnector?.hasCredentials ? <label className="mt-3 flex items-center gap-2 text-[11px] text-slate-500"><input type="checkbox" checked={editor.clearCredentials} onChange={(event) => setEditor({ ...editor, clearCredentials: event.target.checked, credentials: event.target.checked ? {} : editor.credentials })} />清除当前已保存的全部连接凭据</label> : null}
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-sm font-medium text-slate-800">关联号码</div>
                <p className="mt-1 text-xs leading-5 text-slate-400">一个连接可以关联多张 SIM；一张 SIM 同一时间只允许一个自动数据源。DITO Provider 只允许选择菲律宾 DITO 号码。</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {sims.length ? sims.map((sim) => {
                    const assigned = assignedBySim.get(sim.id);
                    const occupied = assigned !== undefined && assigned !== editor.id;
                    const unsupported = !providerSupportsSim(editor.provider, sim);
                    const disabled = occupied || unsupported;
                    return (
                      <label key={sim.id} className={`flex items-start gap-3 rounded-xl border px-3 py-3 ${disabled ? "cursor-not-allowed bg-slate-50 opacity-60" : "cursor-pointer hover:bg-slate-50"}`}>
                        <input type="checkbox" checked={editor.simIds.includes(sim.id)} disabled={disabled} onChange={() => toggleSim(sim.id)} className="mt-0.5" />
                        <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-700">{sim.label}</span><span className="mt-0.5 block truncate text-[11px] text-slate-400">{sim.phoneNumber || "未记录号码"} · {sim.carrierName}{occupied ? " · 已关联其他连接" : unsupported ? " · 不适用于当前 Provider" : ""}</span></span>
                      </label>
                    );
                  }) : <div className="col-span-full py-4 text-center text-xs text-slate-400">还没有可关联的号码。</div>}
                </div>
              </div>

              <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />自动同步值始终保存在独立快照中。即使 MyDITO 返回余额有效期，也不会覆盖号码管理里的“号码有效期”。</div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t px-5 py-4">
              <div className="text-xs text-slate-400">{editor.id && editingConnector?.hasCredentials ? "现有凭据不会回显；留空即保持不变。" : "敏感凭据使用 AES-256-GCM 加密保存。"}</div>
              <div className="flex gap-2"><button type="button" onClick={() => setEditor(null)} disabled={Boolean(busy)} className="h-9 rounded-lg border px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">取消</button><button type="button" onClick={() => void saveEditor()} disabled={Boolean(busy) || !editor.name.trim() || !currentProvider} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-4 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50">{busy.startsWith("save:") || busy === "create" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}保存</button></div>
            </div>
          </Card>
        </ModalPortal>
      ) : null}
    </div>
  );
}
