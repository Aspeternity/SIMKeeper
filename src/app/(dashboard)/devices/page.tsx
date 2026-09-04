"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Archive,
  Box,
  CreditCard,
  Loader2,
  Pencil,
  Plus,
  Router,
  Search,
  Smartphone,
  Tablet,
  Trash2,
} from "lucide-react";
import { DeviceEditorModal } from "@/components/devices/device-editor-modal";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getDeviceTypeLabel, type DeviceRecord, type DeviceType } from "@/lib/device-types";
import type { SimRecord } from "@/lib/sim-types";

type IconComponent = ComponentType<{ className?: string }>;

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

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [sims, setSims] = useState<SimRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
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

  const unassignedCount = useMemo(() => sims.filter((sim) => sim.deviceId === null).length, [sims]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return devices;
    return devices.filter((device) => {
      const assigned = simsByDevice.get(device.id) ?? [];
      return [
        device.name,
        getDeviceTypeLabel(device.type),
        device.brand || "",
        device.model || "",
        device.notes || "",
        ...assigned.flatMap((sim) => [sim.label, sim.phoneNumber || "", sim.carrierName]),
      ].some((field) => field.toLowerCase().includes(value));
    });
  }, [devices, query, simsByDevice]);

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
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <Box className="h-4 w-4" />
            存放位置
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">设备管理</h2>
          <p className="mt-1 text-sm text-slate-500">维护号码可选择的存放设备；不追踪卡槽、设备启停或 eSIM Profile 的实时切换。</p>
        </div>
        <button onClick={openCreate} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800">
          <Plus className="h-4 w-4" />
          新增设备
        </button>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="font-medium">设备概览</div>
            <div className="mt-1 text-xs text-slate-400">共 {devices.length} 个设备 · 已分配号码 {sims.length - unassignedCount} 个 · 未分配 {unassignedCount} 个</div>
          </div>
          <div className="relative w-full lg:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索设备或其中的号码" className="pl-9" />
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="flex min-h-72 items-center justify-center text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载设备…
        </Card>
      ) : devices.length === 0 ? (
        <Card className="flex min-h-72 flex-col items-center justify-center border-dashed px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><Box className="h-5 w-5" /></div>
          <p className="mt-4 text-sm font-medium">还没有添加设备</p>
          <p className="mt-1 max-w-lg text-xs leading-5 text-slate-400">添加后即可在新增或编辑号码时选择为“存放位置”；暂时没有安装到设备上的号码继续保持“未分配”。</p>
          <button onClick={openCreate} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50">
            <Plus className="h-3.5 w-3.5" />添加第一个设备
          </button>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex min-h-64 flex-col items-center justify-center border-dashed px-6 text-center">
          <Search className="h-5 w-5 text-slate-300" />
          <p className="mt-3 text-sm font-medium">没有匹配的设备</p>
          <p className="mt-1 text-xs text-slate-400">尝试调整搜索关键词。</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((device) => {
            const Icon = deviceIcon(device.type);
            const assigned = simsByDevice.get(device.id) ?? [];
            const meta = deviceMeta(device);
            return (
              <Card key={device.id} className="flex min-h-64 flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-900">{device.name}</div>
                      <div className="mt-1 text-xs text-slate-400">{getDeviceTypeLabel(device.type)}</div>
                      {meta ? <div className="mt-1 truncate text-xs text-slate-500">{meta}</div> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => openEdit(device)} title="编辑设备" className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => void remove(device)} title="删除设备" className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <span className="text-xs font-medium text-slate-600">存放号码</span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{assigned.length}</span>
                </div>

                <div className="mt-3 flex-1 space-y-2">
                  {assigned.length ? assigned.slice(0, 4).map((sim) => (
                    <div key={sim.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-slate-700">{sim.label}</div>
                        <div className="mt-0.5 truncate text-[10px] text-slate-400">{sim.carrierName} · {sim.phoneNumber || "未填写手机号"}</div>
                      </div>
                      <span className="shrink-0 text-[10px] text-slate-400">{sim.simType === "esim" ? "eSIM" : "SIM"}</span>
                    </div>
                  )) : (
                    <div className="rounded-lg border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-slate-400">暂时没有号码存放在这里</div>
                  )}
                  {assigned.length > 4 ? <div className="px-1 text-[11px] text-slate-400">还有 {assigned.length - 4} 个号码</div> : null}
                </div>

                {device.notes ? <div className="mt-4 line-clamp-2 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-400">{device.notes}</div> : null}
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
