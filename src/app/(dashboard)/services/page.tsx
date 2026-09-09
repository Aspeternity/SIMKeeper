"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Link2, Loader2, Pencil, Plus, RotateCcw, Search, Smartphone, Trash2 } from "lucide-react";
import { ServiceBindingModal } from "@/components/services/service-binding-modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getServiceBindingStatusLabel,
  getServiceBindingTypeLabel,
  getServiceCategoryLabel,
  getServiceImportanceLabel,
  SERVICE_CATEGORIES,
  SERVICE_IMPORTANCE_LEVELS,
} from "@/lib/service-bindings";
import type { BoundServiceRecord, BoundServiceSimSummary } from "@/lib/service-binding-types";

function importanceClass(value: string) {
  if (value === "critical") return "bg-rose-50 text-rose-700 ring-rose-100";
  if (value === "high") return "bg-amber-50 text-amber-700 ring-amber-100";
  if (value === "low") return "bg-surface-subtle text-ink-muted ring-line";
  return "bg-sky-50 text-sky-700 ring-sky-100";
}

function statusClass(value: string) {
  if (value === "active") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (value === "migrated") return "bg-indigo-50 text-indigo-700 ring-indigo-100";
  return "bg-surface-subtle text-ink-muted ring-line";
}

function countryFlag(countryCode: string) {
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🌐";
  return String.fromCodePoint(...Array.from(code).map((char) => 127397 + char.charCodeAt(0)));
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
  tone: "brand" | "success" | "neutral" | "muted";
  onClick: () => void;
}) {
  const numberClass = tone === "success"
    ? "text-emerald-700"
    : tone === "neutral"
      ? "text-indigo-700"
      : tone === "brand"
        ? "text-brand"
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

  const summary = useMemo(() => ({
    active: bindings.filter((binding) => binding.status === "active").length,
    migrated: bindings.filter((binding) => binding.status === "migrated").length,
    unbound: bindings.filter((binding) => binding.status === "unbound").length,
  }), [bindings]);

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
        binding.country,
        binding.notes || "",
      ].some((value) => value.toLowerCase().includes(search));
      return matchesSim && matchesStatus && matchesCategory && matchesImportance && matchesSearch;
    });
  }, [bindings, categoryFilter, importanceFilter, query, simFilter, statusFilter]);

  const selectedSim = useMemo(
    () => (simFilter === "all" ? null : sims.find((sim) => sim.id === Number(simFilter)) ?? null),
    [simFilter, sims],
  );

  const hasFilters = Boolean(query.trim()) || simFilter !== "all" || statusFilter !== "active" || categoryFilter !== "all" || importanceFilter !== "all";

  function resetFilters() {
    setQuery("");
    setSimFilter("all");
    setStatusFilter("active");
    setCategoryFilter("all");
    setImportanceFilter("all");
  }

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
    <div className="mx-auto max-w-7xl space-y-5" data-services-polish="alpha.51.2">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">绑定服务</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary">把号码与账号、金融、社交和验证服务的关系集中起来，换号前可以快速确认哪些绑定需要迁移。</p>
        </div>
        <Button type="button" onClick={() => setEditing(null)} disabled={!sims.length} className="gap-2"><Plus className="h-4 w-4" />新增绑定</Button>
      </header>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      {!loading && bindings.length ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="绑定服务状态快速筛选">
          <SummaryFilter label="全部记录" value={bindings.length} tone="brand" active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
          <SummaryFilter label="当前绑定" value={summary.active} tone="success" active={statusFilter === "active"} onClick={() => setStatusFilter("active")} />
          <SummaryFilter label="已迁移" value={summary.migrated} tone="neutral" active={statusFilter === "migrated"} onClick={() => setStatusFilter("migrated")} />
          <SummaryFilter label="已解绑" value={summary.unbound} tone="muted" active={statusFilter === "unbound"} onClick={() => setStatusFilter("unbound")} />
        </section>
      ) : null}

      <Card className="p-4 sm:p-5" data-service-toolbar="alpha.51.2">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="font-medium text-ink">绑定关系</div>
            <div className="mt-0.5 text-xs text-ink-muted">
              显示 <span className="tabular-nums">{filtered.length}</span> / {bindings.length} 条记录
              {selectedSim ? ` · 当前号码：${selectedSim.label}${selectedSim.phoneNumber ? ` · ${selectedSim.phoneNumber}` : ""}` : ""}
            </div>
          </div>
          <div className="flex w-full gap-2 lg:w-auto">
            <div className="relative min-w-0 flex-1 lg:w-96">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索服务、账号、号码或运营商" className="pl-9" />
            </div>
            {hasFilters ? (
              <Button type="button" variant="ghost" size="icon" onClick={resetFilters} title="恢复默认筛选" aria-label="恢复绑定服务默认筛选"><RotateCcw className="h-4 w-4" /></Button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
          <select value={simFilter} onChange={(event) => setSimFilter(event.target.value)} aria-label="按号码筛选绑定服务" className="h-9 max-w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink-secondary outline-none transition focus:border-brand focus:ring-4 focus:ring-focus sm:max-w-72">
            <option value="all">全部号码</option>
            {sims.map((sim) => <option key={sim.id} value={sim.id}>{sim.label}{sim.phoneNumber ? ` · ${sim.phoneNumber}` : ""}</option>)}
          </select>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="按分类筛选绑定服务" className="h-9 rounded-lg border border-line bg-surface px-3 text-xs text-ink-secondary outline-none transition focus:border-brand focus:ring-4 focus:ring-focus">
            <option value="all">全部分类</option>
            {SERVICE_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select value={importanceFilter} onChange={(event) => setImportanceFilter(event.target.value)} aria-label="按重要程度筛选绑定服务" className="h-9 rounded-lg border border-line bg-surface px-3 text-xs text-ink-secondary outline-none transition focus:border-brand focus:ring-4 focus:ring-focus">
            <option value="all">全部重要程度</option>
            {SERVICE_IMPORTANCE_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
      </Card>

      {loading ? (
        <Card className="flex min-h-72 items-center justify-center text-sm text-ink-secondary"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载绑定服务…</Card>
      ) : !sims.length ? (
        <Card className="flex min-h-72 flex-col items-center justify-center border-dashed px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand"><Link2 className="h-5 w-5" /></div>
          <p className="mt-4 text-sm font-medium text-ink">还没有号码</p>
          <p className="mt-1 max-w-md text-xs leading-5 text-ink-muted">先录入号码，再维护它绑定的账号、验证码和其他业务关系。</p>
        </Card>
      ) : !filtered.length ? (
        <Card className="flex min-h-72 flex-col items-center justify-center border-dashed px-6 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-subtle text-ink-muted"><Link2 className="h-5 w-5" /></div>
          <p className="mt-4 text-sm font-medium text-ink">{bindings.length ? "没有匹配的绑定记录" : "还没有绑定服务"}</p>
          <p className="mt-1 max-w-md text-xs leading-5 text-ink-muted">{selectedSim ? `“${selectedSim.label}”在当前筛选条件下没有绑定记录。` : bindings.length ? "尝试调整状态、号码、分类或搜索关键词。" : "添加后，可以在号码详情和这里统一查看。"}</p>
          {bindings.length && hasFilters ? <Button variant="secondary" size="sm" className="mt-4 gap-1.5" onClick={resetFilters}><RotateCcw className="h-3.5 w-3.5" />恢复默认筛选</Button> : null}
        </Card>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {filtered.map((binding) => (
            <Card key={binding.id} variant="interactive" className={`group flex flex-col overflow-hidden p-0 ${binding.importance === "critical" ? "border-l-[3px] border-l-rose-500" : ""}`}>
              <div className="flex items-start gap-3 p-5 pb-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><Link2 className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{binding.serviceName}</span>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${importanceClass(binding.importance)}`}>{getServiceImportanceLabel(binding.importance)}</span>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${statusClass(binding.status)}`}>{getServiceBindingStatusLabel(binding.status)}</span>
                    <span className="rounded-md bg-surface-subtle px-2 py-0.5 text-[10px] text-ink-muted ring-1 ring-inset ring-line">{getServiceCategoryLabel(binding.category)}</span>
                  </div>

                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-line-subtle bg-surface-subtle px-3 py-2.5">
                    <Smartphone className="h-4 w-4 shrink-0 text-ink-muted" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-ink">{binding.simLabel} · {binding.phoneNumber || "未填写号码"}</div>
                      <div className="mt-0.5 truncate text-[10px] text-ink-muted">{countryFlag(binding.countryCode)} {binding.carrierName} · {binding.country}</div>
                    </div>
                  </div>

                  <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                    <div className="min-w-0"><dt className="text-[10px] text-ink-faint">用途</dt><dd className="mt-0.5 truncate font-medium text-ink-secondary">{getServiceBindingTypeLabel(binding.bindingType)}</dd></div>
                    <div className="min-w-0"><dt className="text-[10px] text-ink-faint">账号标识</dt><dd className="mt-0.5 truncate font-medium text-ink-secondary">{binding.accountIdentifier || "未记录"}</dd></div>
                    <div className="min-w-0"><dt className="text-[10px] text-ink-faint">最后确认</dt><dd className="mt-0.5 truncate font-medium text-ink-secondary">{binding.verifiedAt || "未记录"}</dd></div>
                  </dl>

                  {binding.notes ? <div className="mt-3 line-clamp-2 text-xs leading-5 text-ink-muted">{binding.notes}</div> : null}
                </div>
              </div>

              <div className="mt-auto flex items-center justify-end gap-1 border-t border-line-subtle bg-surface-subtle px-3 py-2.5">
                {binding.website ? <a href={binding.website} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium text-ink-secondary transition hover:bg-surface-hover hover:text-ink"><ExternalLink className="h-3.5 w-3.5" />官网</a> : null}
                <Button variant="ghost" size="sm" onClick={() => setEditing(binding)} className="gap-1.5"><Pencil className="h-3.5 w-3.5" />编辑</Button>
                <Button variant="ghost" size="sm" onClick={() => void deleteBinding(binding)} className="gap-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-3.5 w-3.5" />删除</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing !== undefined ? (
        <ServiceBindingModal binding={editing} sims={sims} onClose={() => setEditing(undefined)} onSaved={loadData} />
      ) : null}
    </div>
  );
}
