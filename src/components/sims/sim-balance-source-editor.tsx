"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import {
  CheckCircle2,
  Cloud,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { CONNECTOR_SYNC_INTERVAL_OPTIONS } from "@/lib/carrier-connectors/types";
import { CURRENCIES } from "@/lib/sim-options";
import type { CarrierRecord, SimRecord } from "@/lib/sim-types";

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

type BalanceProvider = {
  id: string;
  label: string;
  description: string;
  configFields: ProviderConfigField[];
  credentialFields: ProviderCredentialField[];
  supportedCountryCodes: string[];
  carrierNameKeywords: string[];
  runtimeReady?: boolean;
  runtimeMessage?: string | null;
};

type SourceConnector = {
  id: number;
  provider: string;
  providerLabel: string;
  status: "connected" | "error";
  syncIntervalMinutes: number;
  hasCredentials: boolean;
  lastSyncedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  nextSyncAt: string | null;
  stale: boolean;
};

type SourceSnapshot = {
  balance: number | null;
  currencyCode: string | null;
  balanceValidUntil: string | null;
  accountStatus: string;
  syncedAt: string;
  stale: boolean;
};

type BalanceSource = {
  connector: SourceConnector | null;
  latest: SourceSnapshot | null;
  stale: boolean;
  sourceDeleted: boolean;
};

export type SimBalanceSourceEditorHandle = {
  validate: () => void;
  saveForSim: (simId: number) => Promise<void>;
};

function providerSupportsCarrier(provider: BalanceProvider, carrier: CarrierRecord | null) {
  if (!carrier) return false;
  const country = carrier.countryCode.toUpperCase();
  const name = carrier.name.toLowerCase();
  const countryMatches = provider.supportedCountryCodes.length === 0
    || provider.supportedCountryCodes.some((code) => code.toUpperCase() === country);
  const nameMatches = provider.carrierNameKeywords.length === 0
    || provider.carrierNameKeywords.some((keyword) => name.includes(keyword.toLowerCase()));
  return countryMatches && nameMatches;
}

function formatDateTime(value: string | null | undefined) {
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

function initialConfig(provider: BalanceProvider | undefined) {
  const result: Record<string, string | boolean> = {};
  for (const field of provider?.configFields ?? []) {
    if (field.type === "checkbox") {
      result[field.key] = typeof field.defaultValue === "boolean" ? field.defaultValue : false;
    } else {
      result[field.key] = field.defaultValue === null || field.defaultValue === undefined
        ? ""
        : String(field.defaultValue);
    }
  }
  return result;
}

function globeOtpRequired(connector: SourceConnector | null | undefined) {
  if (connector?.provider !== "globe" || connector.status !== "error") return false;
  return /短信验证码重新认证|reauthentication\s+needed|device\s+not\s+recognized/i.test(
    connector.lastError ?? "",
  );
}

export const SimBalanceSourceEditor = forwardRef<
  SimBalanceSourceEditorHandle,
  {
    carrier: CarrierRecord | null;
    editing: SimRecord | null;
    balance: string;
    currencyCode: string;
    onBalanceChange: (value: string) => void;
    onCurrencyChange: (value: string) => void;
    disabled?: boolean;
  }
>(function SimBalanceSourceEditor(
  {
    carrier,
    editing,
    balance,
    currencyCode,
    onBalanceChange,
    onCurrencyChange,
    disabled = false,
  },
  ref,
) {
  const [providers, setProviders] = useState<BalanceProvider[]>([]);
  const [source, setSource] = useState<BalanceSource | null>(null);
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [providerId, setProviderId] = useState("");
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState(1440);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [providerConfig, setProviderConfig] = useState<Record<string, string | boolean>>({});
  const [loading, setLoading] = useState(true);
  const [metadataError, setMetadataError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setMetadataError("");
      setActionError("");
      setNotice("");
      setOtpSent(false);
      setOtpCode("");
      try {
        const query = editing ? `?simId=${editing.id}` : "";
        const response = await fetch(`/api/sims/balance-source${query}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "自动余额同步信息加载失败");
        if (!active) return;

        const nextProviders = (data.providers || []) as BalanceProvider[];
        const nextSource = (data.source || null) as BalanceSource | null;
        setProviders(nextProviders);
        setSource(nextSource);

        if (nextSource?.connector) {
          const provider = nextProviders.find((item) => item.id === nextSource.connector?.provider);
          setMode("auto");
          setProviderId(nextSource.connector.provider);
          setSyncIntervalMinutes(nextSource.connector.syncIntervalMinutes);
          setProviderConfig(initialConfig(provider));
        } else {
          setMode("manual");
        }
      } catch (error) {
        if (active) setMetadataError(error instanceof Error ? error.message : "自动余额同步信息加载失败");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [editing?.id]);

  const supportedProviders = useMemo(
    () => providers.filter((provider) => providerSupportsCarrier(provider, carrier)),
    [carrier, providers],
  );

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === providerId),
    [providerId, providers],
  );

  useEffect(() => {
    if (!supportedProviders.length) {
      if (mode === "auto" && !loading) setMode("manual");
      return;
    }

    if (!supportedProviders.some((provider) => provider.id === providerId)) {
      const next = supportedProviders[0];
      setProviderId(next.id);
      setProviderConfig(initialConfig(next));
      setCredentials({});
    }
  }, [loading, mode, providerId, supportedProviders]);

  function chooseProvider(id: string) {
    const provider = providers.find((item) => item.id === id);
    setProviderId(id);
    setProviderConfig(initialConfig(provider));
    setCredentials({});
    setActionError("");
    setNotice("");
    setOtpSent(false);
    setOtpCode("");
  }

  function validate() {
    if (mode !== "auto") return;
    if (!selectedProvider || !supportedProviders.some((item) => item.id === selectedProvider.id)) {
      throw new Error("当前运营商暂不支持自动余额同步");
    }

    const canReuseStoredCredentials = Boolean(
      source?.connector
      && source.connector.provider === selectedProvider.id
      && source.connector.hasCredentials,
    );
    for (const field of selectedProvider.credentialFields) {
      if (field.required && !canReuseStoredCredentials && !credentials[field.key]?.trim()) {
        throw new Error(`请填写${field.label}`);
      }
    }

    for (const field of selectedProvider.configFields) {
      if (!field.required) continue;
      const value = providerConfig[field.key];
      if (value === null || value === undefined || value === "") {
        throw new Error(`请填写${field.label}`);
      }
    }
  }

  function cleanCredentials() {
    return Object.fromEntries(
      Object.entries(credentials)
        .map(([key, value]) => [key, value.trim()] as const)
        .filter(([, value]) => Boolean(value)),
    );
  }

  async function persistAutoSource(simId: number) {
    if (!selectedProvider) throw new Error("请选择自动同步来源");
    const response = await fetch("/api/sims/balance-source", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        simId,
        provider: selectedProvider.id,
        syncIntervalMinutes,
        providerConfig,
        credentials: cleanCredentials(),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "自动余额同步配置失败");
    const nextSource = (data.source || null) as BalanceSource | null;
    setSource(nextSource);
    setCredentials({});
    return nextSource;
  }

  async function reloadSource(simId: number) {
    const response = await fetch(`/api/sims/balance-source?simId=${simId}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "余额同步状态加载失败");
    const nextSource = (data.source || null) as BalanceSource | null;
    setSource(nextSource);
    return nextSource;
  }

  async function syncSource(simId: number) {
    const response = await fetch("/api/sims/balance-source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ simId }),
    });
    const data = await response.json();
    if (data.source) setSource(data.source as BalanceSource);
    if (!response.ok) throw new Error(data.error || "余额同步失败");
    return data;
  }

  async function saveForSim(simId: number) {
    validate();

    if (mode === "manual") {
      if (!source?.connector) return;
      const response = await fetch(`/api/sims/balance-source?simId=${simId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "关闭自动余额同步失败");
      setSource(data.source || null);
      return;
    }

    const hadExistingSource = Boolean(source?.connector);
    const credentialChanged = Object.keys(cleanCredentials()).length > 0;
    await persistAutoSource(simId);

    if (!hadExistingSource || credentialChanged) {
      try {
        await syncSource(simId);
      } catch {
        // Configuration is already safely stored. The regular scheduler remains
        // responsible for recovery; interactive reconnect is also available in
        // the editor for an existing SIM.
      }
    }
  }

  async function connectNow() {
    if (actionBusy || disabled) return;
    setActionError("");
    setNotice("");
    setOtpSent(false);
    setOtpCode("");

    if (!editing?.id) {
      setActionError("新号码需要先保存一次，SIMKeeper 才能建立运营商连接。保存后可直接在号码详情或再次编辑时立即同步。");
      return;
    }

    try {
      validate();
      if (selectedProvider?.runtimeReady === false) {
        throw new Error(selectedProvider.runtimeMessage || "运营商服务端认证尚未配置");
      }
      setActionBusy(true);
      await persistAutoSource(editing.id);
      await syncSource(editing.id);
      setNotice(`${selectedProvider?.label || "运营商"} 已连接并同步`);
      window.dispatchEvent(new CustomEvent("simkeeper:balance-synced", { detail: { simId: editing.id } }));
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : "运营商连接失败";
      setActionError(nextMessage);
      try {
        await reloadSource(editing.id);
      } catch {
        // Keep the original connection error visible.
      }
    } finally {
      setActionBusy(false);
    }
  }

  async function startGlobeOtp() {
    if (!editing?.id || authBusy) return;
    setActionError("");
    setNotice("");
    if (selectedProvider?.runtimeReady === false) {
      setActionError(selectedProvider.runtimeMessage || "GlobeOne 服务端认证尚未配置");
      return;
    }

    setAuthBusy(true);
    try {
      const response = await fetch("/api/sims/balance-source/globe-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simId: editing.id, action: "start" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "GlobeOne 验证码发送失败");
      setOtpSent(true);
      setNotice(data.message || "GlobeOne 验证码已发送");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "GlobeOne 验证码发送失败");
    } finally {
      setAuthBusy(false);
    }
  }

  async function verifyGlobeOtp() {
    if (!editing?.id || authBusy) return;
    const code = otpCode.trim();
    if (!/^\d{4,8}$/.test(code)) {
      setActionError("请输入短信中的 GlobeOne 验证码");
      return;
    }

    setAuthBusy(true);
    setActionError("");
    setNotice("");
    try {
      const response = await fetch("/api/sims/balance-source/globe-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simId: editing.id, action: "verify", code }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "GlobeOne 验证失败");
      setOtpSent(false);
      setOtpCode("");
      await reloadSource(editing.id);
      setNotice(data.message || "GlobeOne 验证完成，余额已同步");
      window.dispatchEvent(new CustomEvent("simkeeper:balance-synced", { detail: { simId: editing.id } }));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "GlobeOne 验证失败");
    } finally {
      setAuthBusy(false);
    }
  }

  useImperativeHandle(ref, () => ({ validate, saveForSim }), [
    credentials,
    mode,
    providerConfig,
    selectedProvider,
    source,
    supportedProviders,
    syncIntervalMinutes,
  ]);

  const sourceForSelectedProvider = source?.connector?.provider === selectedProvider?.id
    ? source?.connector ?? null
    : null;
  const latestForSelectedProvider = sourceForSelectedProvider ? source?.latest ?? null : null;
  const currentAutoBalance = latestForSelectedProvider
    ? latestForSelectedProvider.balance === null
      ? "余额未知"
      : `${latestForSelectedProvider.balance} ${latestForSelectedProvider.currencyCode || ""}`.trim()
    : balance
      ? `${balance} ${currencyCode}`.trim()
      : "首次同步后自动填入";
  const runtimeReady = selectedProvider?.runtimeReady !== false;
  const needsGlobeOtp = runtimeReady && globeOtpRequired(sourceForSelectedProvider);

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <Cloud className="h-4 w-4 text-slate-400" />余额来源
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            手动维护适合暂未支持的运营商；支持的运营商可以直接由 SIMKeeper 定时读取官方余额。
          </p>
        </div>
        {loading ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />检查自动同步支持…
          </span>
        ) : null}
      </div>

      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setMode("manual")}
          className={`h-8 rounded-lg px-3 text-xs font-medium transition ${mode === "manual" ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50"}`}
        >
          手动维护
        </button>
        <button
          type="button"
          disabled={disabled || loading || supportedProviders.length === 0}
          onClick={() => {
            if (!providerId && supportedProviders[0]) chooseProvider(supportedProviders[0].id);
            setMode("auto");
          }}
          className={`h-8 rounded-lg px-3 text-xs font-medium transition ${mode === "auto" ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"}`}
        >
          自动同步{supportedProviders.length ? ` · ${supportedProviders[0].label}` : "（暂不支持）"}
        </button>
      </div>

      {metadataError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
          {metadataError}。手动余额仍可正常保存。
        </div>
      ) : null}

      {mode === "manual" ? (
        <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">余额</span>
            <Input
              value={balance}
              onChange={(event) => onBalanceChange(event.target.value)}
              placeholder="可选"
              inputMode="decimal"
              type="number"
              min="0"
              step="any"
              disabled={disabled}
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">币种</span>
            <select
              value={currencyCode}
              onChange={(event) => onCurrencyChange(event.target.value)}
              disabled={disabled}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-50 disabled:text-slate-400"
            >
              {CURRENCIES.map((currency) => (
                <option key={currency.code} value={currency.code}>{currency.code} · {currency.label}</option>
              ))}
            </select>
          </label>
        </div>
      ) : selectedProvider ? (
        <div className="space-y-4 rounded-xl border border-indigo-100 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-800">{selectedProvider.label}</span>
                <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                  <CheckCircle2 className="h-3 w-3" />自动余额
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">{selectedProvider.description}</p>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-400">当前余额</div>
              <div className="mt-1 text-sm font-semibold text-slate-800">{currentAutoBalance}</div>
            </div>
          </div>

          {!runtimeReady && selectedProvider.runtimeMessage ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
              <div className="font-medium">{selectedProvider.label} 暂时不能建立连接</div>
              <div className="mt-0.5 text-amber-700">{selectedProvider.runtimeMessage}</div>
            </div>
          ) : null}

          {supportedProviders.length > 1 ? (
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">同步来源</span>
              <select
                value={providerId}
                onChange={(event) => chooseProvider(event.target.value)}
                disabled={disabled}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
              >
                {supportedProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.label}</option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">自动同步频率</span>
            <select
              value={syncIntervalMinutes}
              onChange={(event) => setSyncIntervalMinutes(Number(event.target.value))}
              disabled={disabled}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
            >
              {CONNECTOR_SYNC_INTERVAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          {selectedProvider.configFields.map((field) => (
            field.type === "checkbox" ? (
              <label key={field.key} className="flex items-start gap-2 rounded-xl border border-slate-100 px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(providerConfig[field.key])}
                  onChange={(event) => setProviderConfig((current) => ({ ...current, [field.key]: event.target.checked }))}
                  disabled={disabled}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  <span className="font-medium text-slate-700">{field.label}</span>
                  {field.description ? <span className="mt-0.5 block text-xs text-slate-400">{field.description}</span> : null}
                </span>
              </label>
            ) : (
              <label key={field.key} className="block space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">{field.label}</span>
                {field.type === "textarea" ? (
                  <textarea
                    value={String(providerConfig[field.key] ?? "")}
                    onChange={(event) => setProviderConfig((current) => ({ ...current, [field.key]: event.target.value }))}
                    rows={3}
                    disabled={disabled}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                  />
                ) : field.type === "select" ? (
                  <select
                    value={String(providerConfig[field.key] ?? "")}
                    onChange={(event) => setProviderConfig((current) => ({ ...current, [field.key]: event.target.value }))}
                    disabled={disabled}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                  >
                    {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                ) : (
                  <Input
                    value={String(providerConfig[field.key] ?? "")}
                    onChange={(event) => setProviderConfig((current) => ({ ...current, [field.key]: event.target.value }))}
                    type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                    placeholder={field.placeholder}
                    disabled={disabled}
                  />
                )}
                {field.description ? <span className="block text-xs text-slate-400">{field.description}</span> : null}
              </label>
            )
          ))}

          <div className="grid gap-4 sm:grid-cols-2">
            {selectedProvider.credentialFields.map((field) => {
              const stored = Boolean(sourceForSelectedProvider?.hasCredentials);
              return (
                <label key={field.key} className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">{field.label}</span>
                  <Input
                    value={credentials[field.key] || ""}
                    onChange={(event) => setCredentials((current) => ({ ...current, [field.key]: event.target.value }))}
                    type="password"
                    autoComplete="new-password"
                    placeholder={stored ? "已加密保存；留空保持不变" : field.placeholder || "请输入凭据"}
                    disabled={disabled}
                  />
                  {field.description ? <span className="block text-xs leading-5 text-slate-400">{field.description}</span> : null}
                </label>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <button
                type="button"
                onClick={() => void connectNow()}
                disabled={disabled || actionBusy || authBusy || !runtimeReady}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {actionBusy
                  ? "连接中…"
                  : sourceForSelectedProvider
                    ? "保存配置并立即同步"
                    : `连接 ${selectedProvider.label}`}
              </button>
            ) : (
              <span className="text-xs leading-5 text-slate-400">
                新号码保存后会自动建立连接并尝试首次同步。
              </span>
            )}
            {notice ? <span className="text-xs font-medium text-emerald-600">{notice}</span> : null}
          </div>

          {needsGlobeOtp ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
              <div className="flex items-start gap-2">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="flex-1">
                  <div className="font-medium">GlobeOne 需要一次短信验证</div>
                  <div className="mt-0.5 text-amber-700">验证成功后会保存加密会话，后续定时同步不需要反复输入验证码。</div>
                </div>
              </div>

              {!otpSent ? (
                <button
                  type="button"
                  onClick={() => void startGlobeOtp()}
                  disabled={disabled || authBusy || !runtimeReady}
                  className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                >
                  {authBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {authBusy ? "发送中…" : "发送验证码"}
                </button>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="短信验证码"
                    className="h-8 w-32 rounded-lg border border-amber-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-amber-400"
                  />
                  <button
                    type="button"
                    onClick={() => void verifyGlobeOtp()}
                    disabled={disabled || authBusy || !otpCode.trim()}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                  >
                    {authBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {authBusy ? "验证中…" : "验证并同步"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void startGlobeOtp()}
                    disabled={disabled || authBusy}
                    className="h-8 px-1 text-xs text-amber-700 hover:text-amber-900 disabled:opacity-50"
                  >
                    重新发送
                  </button>
                </div>
              )}
            </div>
          ) : runtimeReady && sourceForSelectedProvider ? (
            <div className={`rounded-xl px-3 py-2.5 text-xs leading-5 ${sourceForSelectedProvider.status === "error" ? "border border-rose-100 bg-rose-50 text-rose-700" : "border border-emerald-100 bg-emerald-50 text-emerald-700"}`}>
              {sourceForSelectedProvider.status === "error"
                ? sourceForSelectedProvider.lastError || "最近一次同步失败"
                : `已启用 · 上次成功 ${formatDateTime(sourceForSelectedProvider.lastSuccessAt)} · 下次计划 ${formatDateTime(sourceForSelectedProvider.nextSyncAt)}`}
            </div>
          ) : null}

          {actionError ? (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-700">
              {actionError}
            </div>
          ) : null}

          <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-500">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>登录凭据只会加密保存在 SIMKeeper 中。启用后，运营商返回的余额会成为号码管理、号码详情和其他页面统一使用的当前余额；运营商余额有效期不会覆盖 SIM 卡本身的有效期。</span>
          </div>
        </div>
      ) : null}
    </section>
  );
});
