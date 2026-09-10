"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Archive,
  Box,
  CreditCard,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Router,
  Search,
  Smartphone,
  Tablet,
  Trash2,
} from "lucide-react";
import { DeviceEditorModal } from "@/components/devices/device-editor-modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getDeviceTypeLabel, type DeviceRecord, type DeviceType } from "@/lib/device-types";
import type { SimRecord } from "@/lib/sim-types";

type IconComponent = ComponentType<{ className?: string }>;
type UsageFilter = "all" | "in_use" | "idle";

function deviceIcon(type: DeviceType): IconComponent {
  if (type === "phone") return Smartphone;
  if (type === "tablet") return Tablet;
  if (type === "esim_adapter") return CreditCard;
  if (type === "router") return Router;
  if (type === "storage") return Archive;
  return Box;
}

function deviceMeta(device: DeviceRecord) {
  return [device.brand, device.model].filter(Boolean).join(" · ");
}

function MetricCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card className="px-4 py-3.5">
      <div className="text-xs font-medium text-ink-muted">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-ink">{value}</div>
      <div className="mt-1 text-[11px] text-ink-faint">{hint}</div>
    </Card>
  );
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [sims, setSims] = useState<SimRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<DeviceRecord | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [devicesResponse, simsResponse] = await Promise.all([
        fetch("/api/devices", { cache: "no-store" }),
        fetch("/api/sims", { cache: "no-store" }),
      ]);
      const [devicesData, simsData] = await Promise.all([devicesResponse.json(), simsResponse.json()]);
      if (!devicesResponse.ok) throw new Error(devicesData.error || "设备数据加载失败");
      if (!simsResponse.ok) throw new Error(simsData.error || "号码数据加载失败");
      setDevices(devicesData.devices || []);
      setSims(simsData.sims || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "设备数据加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const simsByDevice = useMemo(() => {
    const groups = new Map<number, SimRecord[]>();
    for (const sim of sims) {
      if (sim.deviceId === null) continue;
      const current = groups.get(sim.deviceId) ?? [];
      current.push(sim);
      groups.set(sim.deviceId, current);
    }
    for (const group of groups.values()) group.sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
    return groups;
  }, [sims]);

  const usageSummary = useMemo(() => {
    const inUse = devices.filter((device) => (simsByDevice.get(device.id)?.length ?? 0) > 0).length;
    const unassigned = sims.filter((sim) => sim.deviceId === null).length;
    return {
      inUse,
      idle: devices.length - inUse,
      assignedSims: sims.length - unassigned,
      unassignedSims: unassigned,
    };
  }, [devices, sims, simsByDevice]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return devices.filter((device) => {
      const assigned = simsByDevice.get(device.id) ?? [];
      const hasAssigned = assigned.length > 0;
      const matchesUsage = usageFilter === "all" || (usageFilter === "in_use" ? hasAssigned : !hasAssigned);
      if (!matchesUsage) return false;
      if (!value) return true;
      return [
        device.name,
        getDeviceTypeLabel(device.type),
        device.brand || "",
        device.model || "",
        device.notes || "",
        ...assigned.flatMap((sim) => [sim.label, sim.phoneNumber || "", sim.carrierName]),
      ].some((field) => field.toLowerCase().includes(value));
    });
  }, [devices, query, simsByDevice, usageFilter]);

  const hasFilters = Boolean(query.trim()) || usageFilter !== "all";

  function clearFilters() {
    setQuery("");
    setUsageFilter("all");
  }

  function openCreate() {
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(device: DeviceRecord) {
    setEditing(device);
    setEditorOpen(true);
  }

  async function remove(device: DeviceRecord) {
    const message = device.simCount
      ? `确定删除“${device.name}”吗？当前有 ${device.simCount} 个号码存放在该设备。删除后这些号码的存放位置会自动变为“未分配”，号码本身及其他资料不会删除。`
      : `确定删除“${device.name}”吗？`;
    if (!window.confirm(message)) return;

    setError("");
    try {
      const response = await fetch(`/api/devices?id=${device.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除失败");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5" data-devices-polish="alpha.57.0">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">设备管理</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary">维护 SIM / eSIM 的实际存放位置，让设备、号码与日常保管关系一眼可见。</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" />新增设备</Button>
      </header>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      {!loading && devices.length ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="设备概览">
          <MetricCard label="设备总数" value={devices.length} hint="已录入的存放位置" />
          <MetricCard label="使用中" value={usageSummary.inUse} hint="至少存放 1 个号码" />
          <MetricCard label="空闲设备" value={usageSummary.idle} hint="当前未关联号码" />
          <MetricCard label="未分配号码" value={usageSummary.unassignedSims} hint={`已分配 ${usageSummary.assignedSims} 个`} />
        </section>
      ) : null}

      <Card className="p-4 sm:p-5" data-device-toolbar="alpha.57.0">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="font-medium text-ink">全部设备</div>
            <div className="mt-0.5 text-xs text-ink-muted">显示 <span className="tabular-nums">{filtered.length}</span> / {devices.length} 个设备</div>
          </div>
          <div className="flex w-full gap-2 lg:w-auto">
            <div className="relative min-w-0 flex-1 lg:w-96">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索设备、型号或其中的号码" className="pl-9" />
            </div>
            {hasFilters ? (
              <Button type="button" variant="ghost" size="icon" onClick={clearFilters} title="清除筛选" aria-label="清除设备筛选"><RotateCcw className="h-4 w-4" /></Button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3" aria-label="设备使用状态筛选">
          {([
            ["all", `全部 · ${devices.length}`],
            ["in_use", `使用中 · ${usageSummary.inUse}`],
            ["idle", `空闲 · ${usageSummary.idle}`],
          ] as Array<[UsageFilter, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setUsageFilter(value)}
              className={`h-9 rounded-lg border px-3 text-xs font-medium transition ${usageFilter === value ? "border-brand bg-brand-soft text-brand ring-2 ring-brand-soft-strong" : "border-line bg-surface text-ink-secondary hover:border-line-strong hover:bg-surface-hover"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      {loading ? (
        <Card className="flex min-h-72 items-center justify-center text-sm text-ink-secondary"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载设备…</Card>
      ) : devices.length === 0 ? (
        <Card className="flex min-h-72 flex-col items-center justify-center border-dashed px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand"><Box className="h-5 w-5" /></div>
          <p className="mt-4 text-sm font-medium text-ink">还没有添加设备</p>
          <p className="mt-1 max-w-lg text-xs leading-5 text-ink-muted">添加手机、平板、eSIM 适配器、路由器或收纳位置后，号码详情里即可直接看到它放在哪里。</p>
          <Button onClick={openCreate} variant="secondary" size="sm" className="mt-4 gap-1.5"><Plus className="h-3.5 w-3.5" />添加第一个设备</Button>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex min-h-64 flex-col items-center justify-center border-dashed px-6 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-subtle text-ink-muted"><Search className="h-5 w-5" /></div>
          <p className="mt-4 text-sm font-medium text-ink">没有匹配的设备</p>
          <p className="mt-1 text-xs text-ink-muted">尝试调整搜索关键词或使用状态。</p>
          <Button variant="secondary" size="sm" className="mt-4 gap-1.5" onClick={clearFilters}><RotateCcw className="h-3.5 w-3.5" />清除筛选</Button>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((device) => {
            const Icon = deviceIcon(device.type);
            const assigned = simsByDevice.get(device.id) ?? [];
            const meta = deviceMeta(device);
            return (
              <Card key={device.id} variant="interactive" className="group flex min-h-72 flex-col overflow-hidden p-0">
                <div className="flex items-start justify-between gap-3 p-5 pb-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-ink">{device.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-surface-subtle px-2 py-0.5 text-[10px] font-medium text-ink-secondary ring-1 ring-inset ring-line">{getDeviceTypeLabel(device.type)}</span>
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${assigned.length ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-surface-subtle text-ink-muted ring-line"}`}>{assigned.length ? `使用中 · ${assigned.length}` : "空闲"}</span>
                      </div>
                      {meta ? <div className="mt-2 truncate text-xs text-ink-muted">{meta}</div> : null}
                    </div>
                  </div>
                </div>

                <div className="mx-5 flex items-center justify-between border-b border-line-subtle pb-2.5">
                  <span className="text-xs font-medium text-ink-secondary">存放号码</span>
                  <span className="text-[11px] tabular-nums text-ink-muted">{assigned.length} 个</span>
                </div>

                <div className="flex-1 min-h-0 px-5 py-3">
                  {assigned.length ? (
                    <div className="max-h-[13.5rem] space-y-2 overflow-y-auto overscroll-contain pr-1" data-device-sim-scroll={device.id}>
                      {assigned.map((sim) => (
                        <div key={sim.id} className="flex items-center justify-between gap-3 rounded-xl border border-line-subtle bg-surface-subtle px-3 py-2.5">
                          <div className="min-w-0">
                            <div className="truncate text-xs font-medium text-ink">{sim.label}</div>
                            <div className="mt-0.5 truncate text-[10px] text-ink-muted">{sim.carrierName} · {sim.phoneNumber || "未填写手机号"}</div>
                          </div>
                          <span className="shrink-0 rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-medium text-ink-muted ring-1 ring-line">{sim.simType === "esim" ? "eSIM" : "SIM"}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-line px-3 text-center text-xs text-ink-muted">暂时没有号码存放在这里</div>
                  )}
                  {device.notes ? <div className="line-clamp-2 pt-2 text-xs leading-5 text-ink-muted">{device.notes}</div> : null}
                </div>

                <div className="flex items-center justify-end gap-1 border-t border-line-subtle bg-surface-subtle px-3 py-2.5">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(device)} className="gap-1.5"><Pencil className="h-3.5 w-3.5" />编辑</Button>
                  <Button variant="ghost" size="sm" onClick={() => void remove(device)} className="gap-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-3.5 w-3.5" />删除</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editorOpen ? (
        <DeviceEditorModal
          editing={editing}
          onClose={() => {
            setEditorOpen(false);
            setEditing(null);
          }}
          onSaved={loadData}
        />
      ) : null}
    </div>
  );
}
