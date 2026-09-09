"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw, Save, Search, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  DASHBOARD_MODULES,
  type DashboardModuleId,
  type DashboardPreferences,
  type DashboardSimOption,
} from "@/lib/dashboard-preferences-shared";

const moduleMeta = new Map(DASHBOARD_MODULES.map((module) => [module.id, module]));

export function DashboardCustomizer({
  initialPreferences,
  simOptions,
}: {
  initialPreferences: DashboardPreferences;
  simOptions: DashboardSimOption[];
}) {
  const router = useRouter();
  const [preferences, setPreferences] = useState(initialPreferences);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const filteredSims = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return simOptions;
    return simOptions.filter((sim) =>
      [sim.label, sim.phoneNumber ?? "", sim.carrierName, sim.country].some((value) => value.toLowerCase().includes(keyword)),
    );
  }, [query, simOptions]);

  function moveModule(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= preferences.modules.length) return;
    setPreferences((current) => {
      const modules = current.modules.map((module) => ({ ...module }));
      [modules[index], modules[target]] = [modules[target], modules[index]];
      return { ...current, modules };
    });
    setMessage("");
  }

  function toggleModule(id: DashboardModuleId) {
    setPreferences((current) => ({
      ...current,
      modules: current.modules.map((module) => module.id === id ? { ...module, visible: !module.visible } : module),
    }));
    setMessage("");
  }

  function toggleFocusedSim(id: number) {
    setPreferences((current) => {
      const selected = current.focusedSimIds.includes(id);
      if (!selected && current.focusedSimIds.length >= 6) return current;
      return {
        ...current,
        focusedSimIds: selected ? current.focusedSimIds.filter((candidate) => candidate !== id) : [...current.focusedSimIds, id],
      };
    });
    setMessage("");
  }

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/dashboard-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      });
      const body = await response.json().catch(() => null) as { preferences?: DashboardPreferences; error?: string } | null;
      if (!response.ok || !body?.preferences) throw new Error(body?.error || "Dashboard 设置保存失败");
      setPreferences(body.preferences);
      setMessage("Dashboard 个性化设置已保存");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dashboard 设置保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!window.confirm("恢复 Dashboard 默认布局？重点号码和自定义顺序也会被清除。")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/dashboard-preferences", { method: "DELETE" });
      const body = await response.json().catch(() => null) as { preferences?: DashboardPreferences; error?: string } | null;
      if (!response.ok || !body?.preferences) throw new Error(body?.error || "恢复默认设置失败");
      setPreferences(body.preferences);
      setQuery("");
      setMessage("已恢复 Dashboard 默认布局");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "恢复默认设置失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6" data-dashboard-customizer="alpha.44">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Dashboard personalization</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Dashboard 个性化</h2>
          <p className="mt-1 text-sm text-slate-500">控制首页模块顺序与显示状态，并设置统计周期、分布数量和重点号码。</p>
        </div>
        <Link href="/" className="inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-medium text-slate-700 transition hover:bg-white">返回 Dashboard</Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden">
          <div className="border-b px-6 py-5">
            <h3 className="font-semibold">模块布局</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">使用上下按钮调整首页顺序；关闭模块只会隐藏展示，不会删除任何数据。</p>
          </div>
          <div className="divide-y divide-slate-100">
            {preferences.modules.map((module, index) => {
              const meta = moduleMeta.get(module.id);
              return (
                <div key={module.id} className="flex items-center gap-3 px-5 py-4" data-dashboard-module-setting={module.id}>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button type="button" onClick={() => moveModule(index, -1)} disabled={index === 0} className="flex h-7 w-7 items-center justify-center rounded-lg border text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30" aria-label="上移"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => moveModule(index, 1)} disabled={index === preferences.modules.length - 1} className="flex h-7 w-7 items-center justify-center rounded-lg border text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30" aria-label="下移"><ArrowDown className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-700">{meta?.label || module.id}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-400">{meta?.description}</div>
                  </div>
                  <button type="button" onClick={() => toggleModule(module.id)} className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition ${module.visible ? "bg-slate-950 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                    {module.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}{module.visible ? "显示" : "隐藏"}
                  </button>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="font-semibold">统计显示</h3>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
              <label className="block">
                <span className="text-sm font-medium text-slate-600">未来安排统计周期</span>
                <select value={preferences.horizonDays} onChange={(event) => setPreferences((current) => ({ ...current, horizonDays: Number(event.target.value) as 7 | 30 | 60 }))} className="mt-2 h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-slate-400">
                  <option value={7}>7 天</option><option value={30}>30 天</option><option value={60}>60 天</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-600">地区 / 运营商分布</span>
                <select value={preferences.distributionLimit} onChange={(event) => setPreferences((current) => ({ ...current, distributionLimit: Number(event.target.value) as 3 | 6 | 10 }))} className="mt-2 h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-slate-400">
                  <option value={3}>Top 3</option><option value={6}>Top 6</option><option value={10}>Top 10</option>
                </select>
              </label>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b px-6 py-5">
              <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Star className="h-4 w-4 text-slate-400" /><h3 className="font-semibold">重点号码</h3></div><p className="mt-1 text-xs leading-5 text-slate-400">最多固定 6 张。未选择时，“重点号码”模块不会占用 Dashboard 空间。</p></div><span className="shrink-0 text-xs font-medium text-slate-400">{preferences.focusedSimIds.length}/6</span></div>
              <div className="relative mt-4"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索号码、运营商或地区" className="h-10 w-full rounded-xl border bg-white pl-9 pr-3 text-sm outline-none placeholder:text-slate-300 focus:border-slate-400" /></div>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {filteredSims.length ? filteredSims.map((sim) => {
                const selected = preferences.focusedSimIds.includes(sim.id);
                const disabled = !selected && preferences.focusedSimIds.length >= 6;
                return (
                  <button key={sim.id} type="button" disabled={disabled} onClick={() => toggleFocusedSim(sim.id)} className="flex w-full items-center justify-between gap-4 px-6 py-3.5 text-left transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                    <div className="min-w-0"><div className="truncate text-sm font-medium text-slate-700">{sim.label}</div><div className="mt-1 truncate text-xs text-slate-400">{sim.phoneNumber || "未填写手机号"} · {sim.carrierName} · {sim.country}</div></div>
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${selected ? "border-slate-950 bg-slate-950 text-white" : "text-transparent"}`}><Star className="h-3.5 w-3.5" /></div>
                  </button>
                );
              }) : <div className="px-6 py-10 text-center text-xs text-slate-400">没有符合搜索条件的号码</div>}
            </div>
          </Card>
        </div>
      </div>

      {(message || error) ? <div className={`rounded-xl border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{error || message}</div> : null}

      <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-end">
        <button type="button" onClick={reset} disabled={busy} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium text-slate-600 transition hover:bg-white disabled:opacity-50"><RotateCcw className="h-4 w-4" />恢复默认</button>
        <button type="button" onClick={save} disabled={busy} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"><Save className="h-4 w-4" />{busy ? "保存中…" : "保存设置"}</button>
      </div>
    </div>
  );
}
