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
  ShieldCheck,
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
  minLinkedSims?: number;
  maxLinkedSims?: number;
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
    syncIntervalMinutes: providerId === "dito" ? 720 : 720,
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

function connectorIsLegacyDito(connector: ConnectorRecord | undefined) {
  return Boolean(
    connector
    && connector.provider === "dito"
    && Object.keys(connector.providerConfig ?? {}).length > 0,
  );
}

function connectorNeedsReauth(connector: ConnectorRecord) {
  return Boolean(connector.lastError?.startsWith("需要重新认证"));
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
  const editingLegacyDito = connectorIsLegacyDito(editingConnector);

  const selectableSims = useMemo(() => {
    if (!editor) return [];
    return sims.filter((sim) => {
      if (!providerSupportsSim(editor.provider, sim)) return false;
      const assigned = assignedBySim.get(sim.id);
      return !assigned || assigned === editor.id;
    });
  }, [assignedBySim, editor, sims]);

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
      syncIntervalMinutes: providerId === "dito" ? 720 : current.syncIntervalMinutes,
      simIds: current.simIds.filter((id) => {
        const sim = sims.find((item) => item.id === id);
        return sim ? providerSupportsSim(providerId, sim) : false;
      }).slice(0, provider?.maxLinkedSims ?? Number.POSITIVE_INFINITY),
      config: configValues(provider),
      credentials: {},
      clearCredentials: false,
    } : current);
  }

  function toggleSim(id: number) {
    setEditor((current) => {
      if (!current) return current;
      const provider = providers.find((item) => item.id === current.provider);
      if (current.simIds.includes(id)) {
        return { ...current, simIds: current.simIds.filter((simId) => simId !== id) };
      }
      if (provider?.maxLinkedSims === 1) {
        return { ...current, simIds: [id] };
      }
      if (provider?.maxLinkedSims !== undefined && current.simIds.length >= provider.maxLinkedSims) {
        return current;
      }
      return { ...current, simIds: [...current.simIds, id] };
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

      const minLinked = currentProvider.minLinkedSims ?? 0;
      const maxLinked = currentProvider.maxLinkedSims;
      if (editor.simIds.length < minLinked) {
        throw new Error(`${currentProvider.label} 至少需要关联 ${minLinked} 张 SIM`);
      }
      if (maxLinked !== undefined && editor.simIds.length > maxLinked) {
        throw new Error(`${currentProvider.label} 每个连接最多关联 ${maxLinked} 张 SIM`);
      }

      const credentials = Object.fromEntries(
        Object.entries(editor.credentials)
          .map(([key, value]) => [key, value.trim()] as const)
          .filter(([, value]) => Boolean(value)),
      );
      const storedCredentialsUsable = Boolean(
        editingConnector?.hasCredentials
        && !editor.clearCredentials
        && !(editor.provider === "dito" && editingLegacyDito),
      );
      for (const field of currentProvider.credentialFields ?? []) {
        if (field.required && !storedCredentialsUsable && !credentials[field.key]) {
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
      const wasLegacyMigration = editingLegacyDito;
      setEditor(null);
      setNotice(
        wasLegacyMigration
          ? "DITO 连接已迁移到 alpha.22 自动登录模式，请执行一次立即同步验证。"
          : editor.id
            ? "运营商连接已更新。"
            : "运营商连接已创建，可以执行首次同步。",
      );
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
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">连接会把运营商自动数据保存为独立快照，不覆盖号码里手工维护的余额和号码有效期。每个 Provider 可以定义自己的关联数量和认证方式。</p>
        </div>
        <button type="button" onClick={openCreate} disabled={!providers.length && loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"><Plus className="h-4 w-4" />添加连接</button>
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm leading-6 text-indigo-800">
        <span className="font-medium">alpha.22：</span><span className="font-medium">DITO MyDITO</span> 已升级为正式自动同步。SIMKeeper 使用关联号码与加密保存的 MyDITO 密码，在每次同步时临时登录官方 MyDITO，自动发现 Account ID 并读取 Load Balance；Auth-Token 不会持久化。
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      {loading ? (
        <Card className="flex min-h-64 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载运营商连接…</Card>
      ) : connectors.length === 0 ? (
        <Card className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
          <Cable className="h-7 w-7 text-slate-300" />
          <div className="mt-3 text-sm font-medium text-slate-700">还没有运营商连接</div>
          <p className="mt-1 max-w-xl text-xs leading-5 text-slate-400">如果你使用菲律宾 DITO，可以直接添加“DITO MyDITO”，关联一个 DITO 号码并保存 MyDITO 密码；也可以继续用模拟数据源验证同步流程。</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {connectors.map((connector) => {
            const legacyDito = connectorIsLegacyDito(connector);
            const needsReauth = connectorNeedsReauth(connector);
            return (
              <Card key={connector.id} className="overflow-hidden">
                <div className="flex flex-col gap-4 border-b p-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{connector.name}</h3>
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${connector.status === "error" ? "bg-rose-50 text-rose-700 ring-rose-100" : connector.lastSuccessAt ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-slate-100 text-slate-600 ring-slate-200"}`}>
                        {connector.status === "error" ? "同步失败" : connector.lastSuccessAt ? "已连接" : "等待首次同步"}
                      </span>
                      {connector.provider === "dito" ? <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">MyDITO 自动登录</span> : null}
                      {legacyDito ? <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">需要迁移凭据</span> : null}
                      {needsReauth ? <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">需要重新认证</span> : null}
                      {connector.stale && connector.lastSuccessAt ? <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">数据已过期</span> : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                      <span>{connector.providerLabel}</span>
                      <span>{getConnectorSyncIntervalLabel(connector.syncIntervalMinutes)}</span>
                      <span>{connector.linkedSims.length} 个号码</span>
                      <span>{connector.hasCredentials ? "凭据已加密保存" : "未保存凭据"}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400"><Clock3 className="h-3.5 w-3.5" />最后成功：{formatDateTime(connector.lastSuccessAt)}{connector.nextSyncAt ? ` · 下次计划：${formatDateTime(connector.nextSyncAt)}` : ""}</div>
                    {legacyDito ? <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">这是 alpha.21 的旧 DITO 会话导入连接。编辑连接并重新填写一次 MyDITO 密码，即可迁移到 alpha.22 自动登录模式。</div> : null}
                    {connector.lastError ? <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{connector.lastError}</div> : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" title={legacyDito ? "请先编辑并迁移旧 DITO 凭据" : undefined} onClick={() => void syncConnector(connector)} disabled={Boolean(busy) || !connector.linkedSims.length || legacyDito} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{busy === `sync:${connector.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}立即同步</button>
                    <button type="button" onClick={() => openEdit(connector)} disabled={Boolean(busy)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Pencil className="h-3.5 w-3.5" />编辑</button>
                    <button type="button" onClick={() => void deleteConnector(connector)} disabled={Boolean(busy)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-100 px-3 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">{busy === `delete:${connector.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}删除</button>
                  </div>
                </div>

                <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
                  {connector.linkedSims.length ? connector.linkedSims.map((sim) => {
                    const snapshot = sim.latestSnapshot;
                    return (
                      <div key={sim.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-slate-800">{sim.label}</div>
                            <div className="mt-0.5 text-xs text-slate-400">{sim.phoneNumber || "未填写号码"} · {sim.carrierName}</div>
                          </div>
                          {snapshot && !snapshot.stale ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                          <div><div className="text-slate-400">自动余额</div><div className="mt-1 font-medium text-slate-700">{formatBalance(snapshot)}</div></div>
                          <div><div className="text-slate-400">余额有效期</div><div className="mt-1 font-medium text-slate-700">{snapshot?.balanceValidUntil || "未知"}</div></div>
                          <div><div className="text-slate-400">账户状态</div><div className="mt-1 font-medium text-slate-700">{getConnectorAccountStatusLabel(snapshot?.accountStatus)}</div></div>
                          <div><div className="text-slate-400">同步时间</div><div className="mt-1 font-medium text-slate-700">{snapshot ? formatDateTime(snapshot.syncedAt) : "尚未同步"}</div></div>
                        </div>
                      </div>
                    );
                  }) : <div className="text-xs text-slate-400">当前没有关联号码。</div>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editor && currentProvider ? (
        <ModalPortal onBackdropClick={() => !busy && setEditor(null)}>
          <div className="my-4 w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">{editor.id ? "编辑运营商连接" : "添加运营商连接"}</div>
                <div className="mt-1 text-xs leading-5 text-slate-400">{currentProvider.description}</div>
              </div>
              <button type="button" onClick={() => setEditor(null)} disabled={Boolean(busy)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>

            <div className="max-h-[75dvh] space-y-5 overflow-y-auto p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-slate-600">连接名称 *</span>
                  <Input value={editor.name} onChange={(event) => setEditor((current) => current ? { ...current, name: event.target.value } : current)} placeholder="例如：我的 DITO" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-slate-600">Provider *</span>
                  <select value={editor.provider} disabled={Boolean(editor.id)} onChange={(event) => changeProvider(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none disabled:bg-slate-50 disabled:text-slate-400">
                    {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
                  </select>
                  {editor.id ? <div className="text-[11px] text-slate-400">已创建的连接不能切换 Provider。</div> : null}
                </label>
                <label className="space-y-1.5 sm:col-span-2">
                  <span className="text-xs font-medium text-slate-600">同步频率</span>
                  <select value={editor.syncIntervalMinutes} onChange={(event) => setEditor((current) => current ? { ...current, syncIntervalMinutes: Number(event.target.value) } : current)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none">
                    {CONNECTOR_SYNC_INTERVAL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>

              {editor.provider === "dito" ? (
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-xs leading-5 text-indigo-900">
                  <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" />DITO MyDITO 自动登录</div>
                  <div className="mt-2 space-y-1.5 text-indigo-800/90">
                    <p>登录号码直接取自下方关联的 DITO SIM，不需要重复填写 Account ID、User ID 或接口地址。</p>
                    <p>每次同步都会使用 MyDITO 密码临时登录，自动获取订阅信息与 Account ID，然后读取 Load Balance。Auth-Token 只存在于本次同步内存中。</p>
                    <p>如果 DITO 日后把密码登录改为强制短信验证码，SIMKeeper 会在登录前停止自动同步，不会绕过 OTP。</p>
                  </div>
                  {editingLegacyDito ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">检测到 alpha.21 旧会话导入配置。本次保存会清除旧 Request URL / Header 配置；请重新填写 MyDITO 密码完成一次性迁移。</div> : null}
                </div>
              ) : null}

              {currentProvider.configFields.length ? (
                <section className="space-y-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Provider 配置</div>
                    <div className="mt-0.5 text-xs text-slate-400">这些字段决定 Provider 如何读取运营商数据。</div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">{currentProvider.configFields.map(renderConfigField)}</div>
                </section>
              ) : null}

              {currentProvider.credentialFields.length ? (
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-slate-400" />
                    <div>
                      <div className="text-sm font-semibold text-slate-800">认证凭据</div>
                      <div className="mt-0.5 text-xs text-slate-400">凭据使用 SIMKeeper 的 AES-256-GCM 凭据存储加密保存，列表和 API 不回显明文。</div>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {currentProvider.credentialFields.map((field) => {
                      const hasReusableStored = Boolean(editingConnector?.hasCredentials && !editingLegacyDito && !editor.clearCredentials);
                      return (
                        <label key={field.key} className="space-y-1.5 sm:col-span-2">
                          <span className="text-xs font-medium text-slate-600">{field.label}{field.required ? " *" : ""}</span>
                          <Input
                            type="password"
                            autoComplete="new-password"
                            value={editor.credentials[field.key] || ""}
                            onChange={(event) => setCredential(field.key, event.target.value)}
                            placeholder={hasReusableStored ? "留空则保留当前已加密保存的凭据" : field.placeholder}
                          />
                          {field.description ? <div className="text-[11px] leading-5 text-slate-400">{field.description}</div> : null}
                        </label>
                      );
                    })}
                  </div>
                  {editingConnector?.hasCredentials && editor.provider !== "dito" ? (
                    <label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={editor.clearCredentials} onChange={(event) => setEditor((current) => current ? { ...current, clearCredentials: event.target.checked, credentials: event.target.checked ? {} : current.credentials } : current)} />清除当前已保存凭据</label>
                  ) : null}
                </section>
              ) : null}

              <section className="space-y-3">
                <div>
                  <div className="text-sm font-semibold text-slate-800">关联号码</div>
                  <div className="mt-0.5 text-xs leading-5 text-slate-400">
                    {currentProvider.maxLinkedSims === 1
                      ? `${currentProvider.label} 每个连接必须且只能关联 1 张 SIM；选择另一张会自动替换当前选择。`
                      : "每张 SIM 同一时间只能属于一个自动运营商连接。"}
                  </div>
                </div>
                {editor.provider === "dito" && !selectableSims.length ? (
                  <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">没有可关联的菲律宾 DITO SIM。请先在号码管理中把运营商设为 DITO、国家/地区设为菲律宾，并填写手机号。</div>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  {selectableSims.map((sim) => {
                    const selected = editor.simIds.includes(sim.id);
                    return (
                      <button key={sim.id} type="button" onClick={() => toggleSim(sim.id)} className={`flex items-center justify-between rounded-xl border px-3 py-3 text-left transition ${selected ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:bg-slate-50"}`}>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-800">{sim.label}</span>
                          <span className="mt-0.5 block truncate text-xs text-slate-400">{sim.phoneNumber || "未填写号码"} · {sim.carrierName}</span>
                        </span>
                        <span className={`ml-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-transparent"}`}><CheckCircle2 className="h-3.5 w-3.5" /></span>
                      </button>
                    );
                  })}
                </div>
                {!selectableSims.length && editor.provider !== "dito" ? <div className="text-xs text-slate-400">没有可关联号码。</div> : null}
              </section>
            </div>

            <div className="flex items-center justify-end gap-2 border-t bg-slate-50/70 px-5 py-4">
              <button type="button" onClick={() => setEditor(null)} disabled={Boolean(busy)} className="h-10 rounded-xl border bg-white px-4 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">取消</button>
              <button type="button" onClick={() => void saveEditor()} disabled={Boolean(busy) || !editor.name.trim()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">{busy.startsWith("save:") || busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{editingLegacyDito ? "迁移并保存" : editor.id ? "保存修改" : "创建连接"}</button>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </div>
  );
}
