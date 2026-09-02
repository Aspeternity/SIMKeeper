"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Link2, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { ServiceBindingModal } from "@/components/services/service-binding-modal";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getServiceBindingStatusLabel,
  getServiceBindingTypeLabel,
  getServiceCategoryLabel,
  getServiceImportanceLabel,
  SERVICE_BINDING_STATUSES,
  SERVICE_CATEGORIES,
  SERVICE_IMPORTANCE_LEVELS,
} from "@/lib/service-bindings";
import type { BoundServiceRecord, BoundServiceSimSummary } from "@/lib/service-binding-types";

function importanceClass(value: string) {
  if (value === "critical") return "bg-rose-50 text-rose-700 ring-rose-100";
  if (value === "high") return "bg-amber-50 text-amber-700 ring-amber-100";
  if (value === "low") return "bg-slate-100 text-slate-500 ring-slate-200";
  return "bg-sky-50 text-sky-700 ring-sky-100";
}

function statusClass(value: string) {
  if (value === "active") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (value === "migrated") return "bg-indigo-50 text-indigo-700 ring-indigo-100";
  return "bg-slate-100 text-slate-500 ring-slate-200";
}

export default function ServicesPage() {
  const [bindings, setBindings] = useState<BoundServiceRecord[]>([]);
  const [sims, setSims] = useState<BoundServiceSimSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [simFilter, setSimFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [importanceFilter, setImportanceFilter] = useState("all");
  const [editing, setEditing] = useState<BoundServiceRecord | null | undefined>(undefined);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/services", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "绑定服务加载失败");
      setBindings(data.bindings || []);
      setSims(data.sims || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "绑定服务加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return bindings.filter((binding) => {
      const matchesSim = simFilter === "all" || binding.simId === Number(simFilter);
      const matchesStatus = statusFilter === "all" || binding.status === statusFilter;
      const matchesCategory = categoryFilter === "all" || binding.category === categoryFilter;
      const matchesImportance = importanceFilter === "all" || binding.importance === importanceFilter;
      const matchesSearch = !search || [
        binding.serviceName,
        binding.accountIdentifier || "",
        binding.simLabel,
        binding.phoneNumber || "",
        binding.carrierName,
        binding.notes || "",
      ].some((value) => value.toLowerCase().includes(search));
      return matchesSim && matchesStatus && matchesCategory && matchesImportance && matchesSearch;
    });
  }, [bindings, categoryFilter, importanceFilter, query, simFilter, statusFilter]);

  const selectedSim = useMemo(
    () => (simFilter === "all" ? null : sims.find((sim) => sim.id === Number(simFilter)) ?? null),
    [simFilter, sims],
  );

  async function deleteBinding(binding: BoundServiceRecord) {
    if (!window.confirm(`确定删除“${binding.serviceName}”的绑定记录吗？如果只是已经换绑，建议改为“已迁移”以保留历史。`)) return;
    setError("");
    try {
      const response = await fetch(`/api/services?id=${binding.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除绑定记录失败");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除绑定记录失败");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500"><Link2 className="h-4 w-4" />号码关系</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">绑定服务</h2>
          <p className="mt-1 text-sm text-slate-500">记录每个号码绑定的账号和业务。可以按号码快速查看某张卡当前和历史上的全部绑定关系。</p>
        </div>
        <button type="button" onClick={() => setEditing(null)} disabled={!sims.length} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" />新增绑定</button>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="font-medium">绑定关系</div>
            <div className="mt-1 text-xs text-slate-400">
              显示 {filtered.length} / {bindings.length} 条记录
              {selectedSim ? ` · 当前号码：${selectedSim.label}${selectedSim.phoneNumber ? ` · ${selectedSim.phoneNumber}` : ""}` : ""}
            </div>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap xl:justify-end">
            <select value={simFilter} onChange={(event) => setSimFilter(event.target.value)} className="h-10 max-w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-slate-400 md:max-w-64">
              <option value="all">全部号码</option>
              {sims.map((sim) => (
                <option key={sim.id} value={sim.id}>
                  {sim.label}{sim.phoneNumber ? ` · ${sim.phoneNumber}` : ""}
                </option>
              ))}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-slate-400">
              <option value="all">全部状态</option>
              {SERVICE_BINDING_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-slate-400">
              <option value="all">全部分类</option>
              {SERVICE_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select value={importanceFilter} onChange={(event) => setImportanceFilter(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-slate-400">
              <option value="all">全部重要程度</option>
              {SERVICE_IMPORTANCE_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索服务、账号、号码或运营商" className="pl-9" />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载绑定服务…</div>
        ) : !sims.length ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <Link2 className="h-6 w-6 text-slate-300" />
            <div className="mt-3 text-sm font-medium text-slate-600">还没有号码</div>
            <p className="mt-1 text-xs text-slate-400">先录入号码，再维护它绑定的账号和业务。</p>
          </div>
        ) : !filtered.length ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <Link2 className="h-6 w-6 text-slate-300" />
            <div className="mt-3 text-sm font-medium text-slate-600">{bindings.length ? "没有匹配的绑定记录" : "还没有绑定服务"}</div>
            <p className="mt-1 text-xs text-slate-400">{selectedSim ? `“${selectedSim.label}”在当前筛选条件下没有绑定记录。` : "添加后，可以在号码详情和这里统一查看。"}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((binding) => (
              <div key={binding.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{binding.serviceName}</span>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${importanceClass(binding.importance)}`}>{getServiceImportanceLabel(binding.importance)}</span>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${statusClass(binding.status)}`}>{getServiceBindingStatusLabel(binding.status)}</span>
                    <span className="rounded-md bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500 ring-1 ring-inset ring-slate-100">{getServiceCategoryLabel(binding.category)}</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-500">{binding.simLabel} · {binding.phoneNumber || "未填写号码"} · {binding.carrierName} · {binding.country}</div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400">
                    <span>用途：{getServiceBindingTypeLabel(binding.bindingType)}</span>
                    <span>账号：{binding.accountIdentifier || "未记录"}</span>
                    <span>最后确认：{binding.verifiedAt || "未记录"}</span>
                  </div>
                  {binding.notes ? <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{binding.notes}</div> : null}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {binding.website ? <a href={binding.website} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" title="打开服务网站"><ExternalLink className="h-4 w-4" /></a> : null}
                  <button type="button" onClick={() => setEditing(binding)} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" title="编辑绑定"><Pencil className="h-4 w-4" /></button>
                  <button type="button" onClick={() => void deleteBinding(binding)} className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" title="删除记录"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {editing !== undefined ? (
        <ServiceBindingModal
          binding={editing}
          sims={sims}
          onClose={() => setEditing(undefined)}
          onSaved={loadData}
        />
      ) : null}
    </div>
  );
}
