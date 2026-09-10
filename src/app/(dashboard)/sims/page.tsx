"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";
import { SimKeepAliveRulesModal } from "@/components/keep-alive/sim-keep-alive-rules-modal";
import { SimDeleteModal } from "@/components/sims/sim-delete-modal";
import { SimEditorModal } from "@/components/sims/sim-editor-modal";
import { SimHealthBadge } from "@/components/sims/sim-health-badge";
import { SimOverviewModal } from "@/components/sims/sim-overview-modal";
import { TariffModal } from "@/components/sims/tariff-modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { DeviceRecord } from "@/lib/device-types";
import type { KeepAliveSimSummary } from "@/lib/keep-alive-types";
import { formatPhoneNumber } from "@/lib/phone-format";
import type { SimHealthItem } from "@/lib/sim-health-types";
import { getSimStatusLabel, getSimTypeLabel, SIM_STATUSES } from "@/lib/sim-options";
import type { CarrierRecord, SimRecord } from "@/lib/sim-types";
import { getRoamingAvailabilityLabel, getSmsReceivePolicyLabel } from "@/lib/tariff-options";

function todayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysUntil(date: string) {
  const today = new Date(`${todayDate()}T00:00:00`);
  const target = new Date(`${date}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function dateHint(sim: SimRecord) {
  if (!sim.validUntil) return null;
  const days = daysUntil(sim.validUntil);
  if (days < 0) return `已过期 ${Math.abs(days)} 天`;
  if (days === 0) return "今天到期";
  if (days <= 30) return `剩余 ${days} 天`;
  return null;
}

function statusClass(status: string) {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-700 ring-emerald-100";
    case "paused":
      return "bg-amber-50 text-amber-700 ring-amber-100";
    case "expired":
      return "bg-rose-50 text-rose-700 ring-rose-100";
    default:
      return "bg-slate-100 text-slate-500 ring-slate-200";
  }
}

function smsPolicyClass(value: string | null) {
  switch (value) {
    case "free":
      return "text-emerald-700";
    case "charged":
      return "text-amber-700";
    case "unavailable":
      return "text-rose-700";
    default:
      return "text-ink-muted";
  }
}

function planTypeLabel(value: string | null) {
  if (value === "prepaid") return "预付费";
  if (value === "postpaid") return "后付费";
  return null;
}

function periodLabel(value: number | null, unit: string | null) {
  if (value === null || !unit) return null;
  if (unit === "day") return `${value} 天`;
  if (unit === "month") return `${value} 个月`;
  if (unit === "year") return `${value} 年`;
  return null;
}

function planFeeLabel(sim: SimRecord) {
  if (sim.tariffRecurringFee === null) return null;
  const currency = sim.tariffCurrencyCode || "";
  const period = periodLabel(sim.tariffRecurringPeriodValue, sim.tariffRecurringPeriodUnit);
  return `${currency} ${sim.tariffRecurringFee}${period ? ` / ${period}` : ""}`.trim();
}

function countryFlag(countryCode: string) {
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🌐";
  return String.fromCodePoint(...Array.from(code).map((char) => 127397 + char.charCodeAt(0)));
}

function healthMatchesFilter(health: SimHealthItem | undefined, filter: string) {
  if (filter === "all") return true;
  if (!health) return false;
  if (filter === "needs_attention") return health.healthStatus === "attention" || health.healthStatus === "setup";
  if (filter === "paused_inactive") return health.healthStatus === "paused" || health.healthStatus === "inactive";
  return health.healthStatus === filter;
}

function keepAliveSummaryFromSim(sim: SimRecord): KeepAliveSimSummary {
  return {
    id: sim.id,
    label: sim.label,
    phoneNumber: sim.phoneNumber,
    status: sim.status,
    balance: sim.balance,
    currencyCode: sim.currencyCode,
    validUntil: sim.validUntil,
    carrierName: sim.carrierName,
    country: sim.country,
    countryCode: sim.countryCode,
    rules: [],
    latestEvent: null,
  };
}

function SummaryFilter({
  label,
  value,
  active,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  tone: "success" | "warning" | "danger" | "neutral";
  onClick: () => void;
}) {
  const numberClass = tone === "success"
    ? "text-emerald-700"
    : tone === "warning"
      ? "text-amber-700"
      : tone === "danger"
        ? "text-rose-700"
        : "text-ink-secondary";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-3 text-left shadow-card transition-[border-color,background-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-floating ${active ? "border-brand bg-brand-soft ring-2 ring-brand-soft-strong" : "border-line bg-surface"}`}
    >
      <div className="text-xs font-medium text-ink-muted">{label}</div>
      <div className={`mt-1.5 text-2xl font-semibold tabular-nums tracking-tight ${numberClass}`}>{value}</div>
    </button>
  );
}

function SelectFilter({
  value,
  onChange,
  ariaLabel,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
      className="h-9 rounded-lg border border-line bg-surface px-3 text-xs text-ink-secondary outline-none transition focus:border-brand focus:ring-4 focus:ring-focus"
    >
      {children}
    </select>
  );
}

export default function SimsPage() {
  const [sims, setSims] = useState<SimRecord[]>([]);
  const [carriers, setCarriers] = useState<CarrierRecord[]>([]);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [healthItems, setHealthItems] = useState<SimHealthItem[]>([]);
  const [keepAliveSims, setKeepAliveSims] = useState<KeepAliveSimSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  const [carrierFilter, setCarrierFilter] = useState("all");
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SimRecord | null>(null);
  const [tariffSim, setTariffSim] = useState<SimRecord | null>(null);
  const [keepAliveSim, setKeepAliveSim] = useState<KeepAliveSimSummary | null>(null);
  const [overviewSim, setOverviewSim] = useState<SimRecord | null>(null);
  const [deletingSim, setDeletingSim] = useState<SimRecord | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [simsResponse, carriersResponse, devicesResponse, healthResponse, keepAliveResponse] = await Promise.all([
        fetch("/api/sims", { cache: "no-store" }),
        fetch("/api/carriers", { cache: "no-store" }),
        fetch("/api/devices", { cache: "no-store" }),
        fetch("/api/sim-health", { cache: "no-store" }),
        fetch("/api/keep-alive", { cache: "no-store" }),
      ]);
      const [simsData, carriersData, devicesData, healthData, keepAliveData] = await Promise.all([
        simsResponse.json(),
        carriersResponse.json(),
        devicesResponse.json(),
        healthResponse.json(),
        keepAliveResponse.json(),
      ]);
      if (!simsResponse.ok) throw new Error(simsData.error || "号码数据加载失败");
      if (!carriersResponse.ok) throw new Error(carriersData.error || "运营商数据加载失败");
      if (!devicesResponse.ok) throw new Error(devicesData.error || "设备数据加载失败");
      if (!healthResponse.ok) throw new Error(healthData.error || "号码健康状态加载失败");
      if (!keepAliveResponse.ok) throw new Error(keepAliveData.error || "保号规则加载失败");
      setSims(simsData.sims || []);
      setCarriers(carriersData.carriers || []);
      setDevices(devicesData.devices || []);
      setHealthItems(healthData.items || []);
      setKeepAliveSims(keepAliveData.sims || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "号码数据加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const healthBySim = useMemo(() => new Map(healthItems.map((item) => [item.simId, item])), [healthItems]);
  const keepAliveBySim = useMemo(() => new Map(keepAliveSims.map((item) => [item.id, item])), [keepAliveSims]);

  const healthSummary = useMemo(() => ({
    healthy: healthItems.filter((item) => item.healthStatus === "healthy").length,
    needsAttention: healthItems.filter((item) => item.healthStatus === "attention" || item.healthStatus === "setup").length,
    critical: healthItems.filter((item) => item.healthStatus === "critical").length,
    pausedInactive: healthItems.filter((item) => item.healthStatus === "paused" || item.healthStatus === "inactive").length,
  }), [healthItems]);

  const countryOptions = useMemo(() => {
    const countries = new Map<string, { code: string; name: string; count: number }>();
    sims.forEach((sim) => {
      const code = sim.countryCode.trim().toUpperCase();
      if (!code) return;
      const current = countries.get(code);
      if (current) {
        current.count += 1;
        return;
      }
      countries.set(code, { code, name: sim.country, count: 1 });
    });
    return Array.from(countries.values()).sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  }, [sims]);

  useEffect(() => {
    if (countryFilter !== "all" && !countryOptions.some((country) => country.code === countryFilter)) setCountryFilter("all");
  }, [countryFilter, countryOptions]);

  useEffect(() => {
    if (deviceFilter !== "all" && deviceFilter !== "unassigned" && !devices.some((device) => device.id === Number(deviceFilter))) {
      setDeviceFilter("all");
    }
  }, [deviceFilter, devices]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return sims.filter((sim) => {
      const health = healthBySim.get(sim.id);
      const matchesQuery = !value || [
        sim.label,
        sim.phoneNumber || "",
        sim.carrierName,
        sim.country,
        sim.countryCode,
        sim.iccid || "",
        sim.deviceName || "",
        sim.notes || "",
        sim.tariffPlanName || "",
        sim.tariffUsageSummary || "",
        health?.healthLabel || "",
        health?.summary || "",
        health?.primaryReason?.detail || "",
      ].some((field) => field.toLowerCase().includes(value));
      const matchesCountry = countryFilter === "all" || sim.countryCode.toUpperCase() === countryFilter;
      const matchesStatus = statusFilter === "all" || sim.status === statusFilter;
      const matchesHealth = healthMatchesFilter(health, healthFilter);
      const matchesCarrier = carrierFilter === "all" || sim.carrierId === Number(carrierFilter);
      const matchesDevice = deviceFilter === "all" || (deviceFilter === "unassigned" ? sim.deviceId === null : sim.deviceId === Number(deviceFilter));
      return matchesQuery && matchesCountry && matchesStatus && matchesHealth && matchesCarrier && matchesDevice;
    });
  }, [carrierFilter, countryFilter, deviceFilter, healthBySim, healthFilter, query, sims, statusFilter]);

  const tariffCount = useMemo(() => sims.filter((sim) => Boolean(sim.tariffId)).length, [sims]);
  const hasFilters = Boolean(query.trim()) || countryFilter !== "all" || statusFilter !== "all" || healthFilter !== "all" || carrierFilter !== "all" || deviceFilter !== "all";

  function clearFilters() {
    setQuery("");
    setCountryFilter("all");
    setStatusFilter("all");
    setHealthFilter("all");
    setCarrierFilter("all");
    setDeviceFilter("all");
  }

  function openCreate() {
    if (!carriers.length) return;
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(sim: SimRecord) {
    setEditing(sim);
    setEditorOpen(true);
  }

  async function handleKeepAliveChanged(next: KeepAliveSimSummary) {
    setKeepAliveSims((current) => {
      const exists = current.some((item) => item.id === next.id);
      return exists ? current.map((item) => item.id === next.id ? next : item) : [...current, next];
    });
    try {
      const response = await fetch("/api/sim-health", { cache: "no-store" });
      const data = await response.json();
      if (response.ok) setHealthItems(data.items || []);
    } catch {
      // 保号规则已经成功保存；Health 会在下次页面刷新时再次同步。
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5" data-sims-polish="alpha.57.0">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">号码管理</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary">集中管理实体 SIM 与 eSIM。正常状态保持克制，只有余额、有效期、保号或同步异常时才突出显示。</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/sims/deleted" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink-secondary shadow-sm transition hover:border-line-strong hover:bg-surface-hover hover:text-ink">
            <Archive className="h-4 w-4" />删除记录
          </Link>
          {carriers.length ? (
            <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" />新增号码</Button>
          ) : (
            <Link href="/carriers" className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground shadow-sm transition hover:bg-brand-hover">先添加运营商</Link>
          )}
        </div>
      </header>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      {!loading && carriers.length === 0 ? (
        <Card variant="subtle" className="border-dashed p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium text-ink">号码需要关联运营商</div>
              <p className="mt-1 text-sm text-ink-secondary">先建立至少一个运营商，再录入号码。国家 / 地区和国际区号都会自动从运营商继承。</p>
            </div>
            <Link href="/carriers" className="text-sm font-medium text-brand hover:underline hover:underline-offset-4">前往运营商管理</Link>
          </div>
        </Card>
      ) : null}

      {!loading && sims.length ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="号码健康快速筛选">
          <SummaryFilter label="Health 正常" value={healthSummary.healthy} tone="success" active={healthFilter === "healthy"} onClick={() => setHealthFilter(healthFilter === "healthy" ? "all" : "healthy")} />
          <SummaryFilter label="需要关注" value={healthSummary.needsAttention} tone="warning" active={healthFilter === "needs_attention"} onClick={() => setHealthFilter(healthFilter === "needs_attention" ? "all" : "needs_attention")} />
          <SummaryFilter label="紧急" value={healthSummary.critical} tone="danger" active={healthFilter === "critical"} onClick={() => setHealthFilter(healthFilter === "critical" ? "all" : "critical")} />
          <SummaryFilter label="暂停 / 停用" value={healthSummary.pausedInactive} tone="neutral" active={healthFilter === "paused_inactive"} onClick={() => setHealthFilter(healthFilter === "paused_inactive" ? "all" : "paused_inactive")} />
        </section>
      ) : null}

      <Card className="p-4 sm:p-5" data-sim-toolbar="alpha.57.0">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="font-medium text-ink">全部号码</div>
            <div className="mt-0.5 text-xs text-ink-muted">显示 <span className="tabular-nums">{filtered.length}</span> / {sims.length} · 已录入资费 {tariffCount} / {sims.length}</div>
          </div>
          <div className="flex w-full gap-2 lg:w-auto">
            <div className="relative min-w-0 flex-1 lg:w-96">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索号码、运营商、Health、套餐或 ICCID" className="pl-9" />
            </div>
            {hasFilters ? (
              <Button type="button" variant="ghost" size="icon" onClick={clearFilters} title="清除全部筛选" aria-label="清除全部筛选"><RotateCcw className="h-4 w-4" /></Button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
          <SelectFilter value={countryFilter} onChange={setCountryFilter} ariaLabel="按国家或地区筛选号码">
            <option value="all">全部国家/地区 · {sims.length}</option>
            {countryOptions.map((country) => <option key={country.code} value={country.code}>{countryFlag(country.code)} {country.name} · {country.count}</option>)}
          </SelectFilter>
          <SelectFilter value={healthFilter} onChange={setHealthFilter} ariaLabel="按号码健康状态筛选">
            <option value="all">全部 Health</option>
            <option value="healthy">正常 · {healthSummary.healthy}</option>
            <option value="needs_attention">需要关注 · {healthSummary.needsAttention}</option>
            <option value="critical">紧急 · {healthSummary.critical}</option>
            <option value="paused_inactive">暂停 / 停用 · {healthSummary.pausedInactive}</option>
          </SelectFilter>
          <SelectFilter value={statusFilter} onChange={setStatusFilter} ariaLabel="按号码状态筛选">
            <option value="all">全部号码状态</option>
            {SIM_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </SelectFilter>
          <SelectFilter value={carrierFilter} onChange={setCarrierFilter} ariaLabel="按运营商筛选">
            <option value="all">全部运营商</option>
            {carriers.map((carrier) => <option key={carrier.id} value={carrier.id}>{carrier.name} · {carrier.country}</option>)}
          </SelectFilter>
          <SelectFilter value={deviceFilter} onChange={setDeviceFilter} ariaLabel="按存放位置筛选">
            <option value="all">全部存放位置</option>
            <option value="unassigned">未分配</option>
            {devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
          </SelectFilter>
        </div>
      </Card>

      {loading ? (
        <Card className="flex min-h-72 items-center justify-center text-sm text-ink-secondary"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载号码…</Card>
      ) : filtered.length === 0 ? (
        <Card className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand"><Smartphone className="h-5 w-5" /></div>
          <p className="mt-4 text-sm font-medium text-ink">{sims.length ? "没有匹配的号码" : "还没有录入号码"}</p>
          <p className="mt-1 max-w-md text-xs leading-5 text-ink-muted">{sims.length ? "尝试调整搜索关键词、Health 或其他筛选条件。" : "录入第一张 SIM / eSIM 后，就可以继续维护资费和生命周期信息。"}</p>
          {sims.length && hasFilters ? <Button variant="secondary" size="sm" className="mt-4 gap-1.5" onClick={clearFilters}><RotateCcw className="h-3.5 w-3.5" />清除筛选</Button> : null}
        </Card>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {filtered.map((sim) => {
            const health = healthBySim.get(sim.id);
            const hint = dateHint(sim);
            const isDateOverdue = Boolean(sim.validUntil && sim.validUntil < todayDate());
            const feeLabel = planFeeLabel(sim);
            const typeLabel = planTypeLabel(sim.tariffPlanType);
            const phoneDisplay = formatPhoneNumber(sim.phoneNumber, "未填写手机号");
            const balanceDisplay = sim.balance === null ? "未记录" : `${sim.balance} ${sim.currencyCode || ""}`.trim();
            const keepAlive = keepAliveBySim.get(sim.id) ?? keepAliveSummaryFromSim(sim);
            const hasKeepAliveRules = keepAlive.rules.length > 0;

            return (
              <Card
                key={sim.id}
                role="button"
                tabIndex={0}
                data-sim-card={sim.id}
                aria-label={`查看 ${sim.label} 号码详情`}
                onClick={() => setOverviewSim(sim)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setOverviewSim(sim);
                  }
                }}
                className="group cursor-pointer overflow-hidden p-0 outline-none transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-floating focus-visible:ring-4 focus-visible:ring-focus"
              >
                <div className="p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-lg shadow-sm ring-1 ring-brand-soft-strong" aria-hidden="true">{countryFlag(sim.countryCode)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold text-ink">{sim.label}</span>
                        {health ? <SimHealthBadge status={health.healthStatus} /> : null}
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${statusClass(sim.status)}`}>{getSimStatusLabel(sim.status)}</span>
                        {isDateOverdue && sim.status !== "expired" && sim.status !== "closed" ? <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-inset ring-rose-100">有效期已过</span> : null}
                      </div>
                      <div className="mt-1 truncate text-base font-medium tabular-nums tracking-tight text-ink-secondary">{phoneDisplay}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                        <span>{sim.carrierName}</span>
                        <span aria-hidden="true">·</span>
                        <span>{sim.country}</span>
                        <span aria-hidden="true">·</span>
                        <span>{getSimTypeLabel(sim.simType)}</span>
                        <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{sim.deviceName || "未分配"}</span>
                      </div>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand" />
                  </div>

                  {health?.primaryReason ? (
                    <div className={`mt-3 rounded-xl px-3 py-2 text-xs leading-5 ${health.healthStatus === "critical" ? "bg-rose-50 text-rose-700" : health.healthStatus === "attention" ? "bg-amber-50 text-amber-800" : "bg-sky-50 text-sky-700"}`}>
                      <span className="font-medium">{health.primaryReason.title}</span>
                      <span className="opacity-75"> · {health.primaryReason.detail}</span>
                    </div>
                  ) : null}

                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <div className="rounded-xl bg-surface-subtle px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted"><CircleDollarSign className="h-3 w-3" />余额</div>
                      <div className="mt-1 truncate text-sm font-semibold tabular-nums text-ink">{balanceDisplay}</div>
                    </div>
                    <div className="rounded-xl bg-surface-subtle px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted"><CalendarDays className="h-3 w-3" />有效期</div>
                      <div className={`mt-1 truncate text-sm font-semibold tabular-nums ${hint ? "text-amber-700" : "text-ink"}`}>{sim.validUntil || "未设置"}</div>
                      {hint ? <div className="mt-0.5 text-[10px] text-amber-700">{hint}</div> : null}
                    </div>
                    <div className="col-span-2 rounded-xl bg-surface-subtle px-3 py-2.5 sm:col-span-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted"><ReceiptText className="h-3 w-3" />资费</div>
                      <div className={`mt-1 truncate text-sm font-semibold ${sim.tariffId ? "text-ink" : "text-amber-700"}`}>{sim.tariffPlanName || "未录入资费"}</div>
                      {sim.tariffId && (typeLabel || feeLabel) ? <div className="mt-0.5 truncate text-[10px] text-ink-muted">{[typeLabel, feeLabel].filter(Boolean).join(" · ")}</div> : null}
                    </div>
                  </div>

                  {sim.tariffId ? (
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
                      <span className={smsPolicyClass(sim.localIncomingSmsPolicy)}>本地短信 {getSmsReceivePolicyLabel(sim.localIncomingSmsPolicy)}</span>
                      <span className={smsPolicyClass(sim.roamingIncomingSmsPolicy)}>漫游短信 {getSmsReceivePolicyLabel(sim.roamingIncomingSmsPolicy)}</span>
                      <span>{getRoamingAvailabilityLabel(sim.roamingAvailable)}</span>
                      {sim.tariffAutoRenew === "yes" ? <span className="text-brand">自动续订</span> : null}
                    </div>
                  ) : null}

                  {sim.tariffUsageSummary ? <div className="mt-2 line-clamp-1 text-xs text-ink-secondary">{sim.tariffUsageSummary}</div> : sim.notes ? <div className="mt-2 line-clamp-1 text-xs text-ink-muted">{sim.notes}</div> : null}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-subtle/70 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0 truncate text-[11px] text-ink-muted">ICCID {sim.iccid || "未记录"}</div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={`gap-1.5 ${hasKeepAliveRules ? "" : "bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800"}`}
                      title={hasKeepAliveRules ? "管理保号规则" : "尚未配置保号规则"}
                      onClick={(event) => { event.stopPropagation(); setKeepAliveSim(keepAlive); }}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />保号规则
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={(event) => { event.stopPropagation(); setTariffSim(sim); }}><ReceiptText className="h-3.5 w-3.5" />资费</Button>
                    <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={(event) => { event.stopPropagation(); openEdit(sim); }}><Pencil className="h-3.5 w-3.5" />编辑</Button>
                    <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={(event) => { event.stopPropagation(); setDeletingSim(sim); }}><Trash2 className="h-3.5 w-3.5" />删除</Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editorOpen ? (
        <SimEditorModal
          carriers={carriers}
          editing={editing}
          onClose={() => {
            setEditorOpen(false);
            setEditing(null);
          }}
          onSaved={loadData}
        />
      ) : null}

      {overviewSim ? (
        <SimOverviewModal
          sim={overviewSim}
          health={healthBySim.get(overviewSim.id) ?? null}
          onClose={() => setOverviewSim(null)}
          onEdit={() => {
            const sim = overviewSim;
            setOverviewSim(null);
            openEdit(sim);
          }}
          onEditTariff={() => {
            const sim = overviewSim;
            setOverviewSim(null);
            setTariffSim(sim);
          }}
        />
      ) : null}

      {keepAliveSim ? (
        <SimKeepAliveRulesModal
          sim={keepAliveSim}
          onClose={() => setKeepAliveSim(null)}
          onChanged={handleKeepAliveChanged}
        />
      ) : null}

      {tariffSim ? <TariffModal sim={tariffSim} onClose={() => setTariffSim(null)} onSaved={loadData} /> : null}

      {deletingSim ? (
        <SimDeleteModal
          sim={deletingSim}
          sims={sims}
          onClose={() => setDeletingSim(null)}
          onDeleted={async () => {
            setDeletingSim(null);
            await loadData();
          }}
        />
      ) : null}
    </div>
  );
}
