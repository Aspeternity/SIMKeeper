"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Eye,
  EyeOff,
  LayoutDashboard,
  Loader2,
  PieChart,
  RotateCcw,
  Save,
  Search,
  Star,
} from "lucide-react";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
  const [savedPreferences, setSavedPreferences] = useState(initialPreferences);
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

  const visibleModuleCount = useMemo(
    () => preferences.modules.filter((module) => module.visible).length,
    [preferences.modules],
  );
  const hasChanges = useMemo(
    () => JSON.stringify(preferences) !== JSON.stringify(savedPreferences),
    [preferences, savedPreferences],
  );

  function clearFeedback() {
    setMessage("");
    setError("");
  }

  function moveModule(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= preferences.modules.length) return;
    setPreferences((current) => {
      const modules = current.modules.map((module) => ({ ...module }));
      [modules[index], modules[target]] = [modules[target], modules[index]];
      return { ...current, modules };
    });
    clearFeedback();
  }

  function toggleModule(id: DashboardModuleId) {
    setPreferences((current) => ({
      ...current,
      modules: current.modules.map((module) => module.id === id ? { ...module, visible: !module.visible } : module),
    }));
    clearFeedback();
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
    clearFeedback();
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
      setSavedPreferences(body.preferences);
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
      setSavedPreferences(body.preferences);
      setQuery("");
      setMessage("已恢复 Dashboard 默认布局");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "恢复默认设置失败");
    } finally {
      setBusy(false);
    }
  }

  const summaryCards = [
    {
      label: "首页模块",
      value: `${visibleModuleCount} / ${preferences.modules.length}`,
      detail: "当前显示",
      icon: LayoutDashboard,
    },
    {
      label: "未来安排",
      value: `${preferences.horizonDays} 天`,
      detail: "统计周期",
      icon: CalendarDays,
    },
    {
      label: "分布范围",
      value: `Top ${preferences.distributionLimit}`,
      detail: "地区 / 运营商",
      icon: PieChart,
    },
    {
      label: "重点号码",
      value: `${preferences.focusedSimIds.length} / 6`,
      detail: preferences.focusedSimIds.length ? "已固定到概览" : "尚未选择",
      icon: Star,
    },
  ];

  return (
    <div
      className="space-y-6"
      data-dashboard-customizer="alpha.44"
      data-settings-dashboard-polish="alpha.51.9"
    >
      <SettingsPageHeader
        icon={LayoutDashboard}
        eyebrow="Dashboard personalization"
        title="概览个性化"
        description="Dashboard 个性化用于控制首页模块顺序与显示状态，并设置统计周期、分布数量和重点号码。所有调整只影响概览展示，不会删除任何号码或生命周期数据。"
        actions={(
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink shadow-sm transition hover:border-line-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus"
          >
            返回概览
          </Link>
        )}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-dashboard-layout-summary="alpha.51.9">
        {summaryCards.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} variant="subtle" className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-ink-muted">{item.label}</div>
                  <div className="mt-1 text-xl font-semibold tracking-tight text-ink">{item.value}</div>
                  <div className="mt-1 text-[11px] leading-5 text-ink-muted">{item.detail}</div>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <Card className="overflow-hidden" data-dashboard-module-workspace="alpha.51.9">
          <div className="flex flex-col gap-3 border-b border-line px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <LayoutDashboard className="h-4 w-4" />
                </div>
                <h3 className="font-semibold text-ink">模块布局</h3>
              </div>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-ink-muted">
                使用上下按钮调整首页顺序；关闭模块只会隐藏展示，不会删除任何数据。
              </p>
            </div>
            <span className="w-fit rounded-full border border-line bg-surface-subtle px-2.5 py-1 text-[11px] font-medium text-ink-muted">
              显示 {visibleModuleCount} 个
            </span>
          </div>

          <div className="divide-y divide-line">
            {preferences.modules.map((module, index) => {
              const meta = moduleMeta.get(module.id);
              return (
                <div
                  key={module.id}
                  className="flex flex-col gap-3 px-4 py-4 transition hover:bg-surface-subtle sm:flex-row sm:items-center sm:px-5"
                  data-dashboard-module-setting={module.id}
                >
                  <div className="flex items-center gap-3 sm:contents">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-xs font-semibold tabular-nums text-ink-muted ring-1 ring-inset ring-line">
                      {index + 1}
                    </div>
                    <div className="flex shrink-0 gap-1 sm:flex-col">
                      <button
                        type="button"
                        onClick={() => moveModule(index, -1)}
                        disabled={index === 0 || busy}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted transition hover:border-line-strong hover:bg-surface-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label="上移"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveModule(index, 1)}
                        disabled={index === preferences.modules.length - 1 || busy}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted transition hover:border-line-strong hover:bg-surface-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label="下移"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink">{meta?.label || module.id}</div>
                    <div className="mt-1 text-xs leading-5 text-ink-muted">{meta?.description}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleModule(module.id)}
                    disabled={busy}
                    aria-pressed={module.visible}
                    className={`inline-flex h-9 w-full shrink-0 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-medium transition sm:w-auto ${
                      module.visible
                        ? "border-brand bg-brand text-brand-foreground shadow-sm hover:bg-brand-hover"
                        : "border-line bg-surface text-ink-muted hover:border-line-strong hover:bg-surface-hover hover:text-ink"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {module.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    {module.visible ? "显示" : "隐藏"}
                  </button>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <PieChart className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-semibold text-ink">统计显示</h3>
                <p className="mt-1 text-xs leading-5 text-ink-muted">控制概览里的未来安排范围，以及地区和运营商分布展示数量。</p>
              </div>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
              <FormField label="未来安排统计周期" hint="影响概览中即将到期与保号安排的观察窗口。">
                <Select
                  value={preferences.horizonDays}
                  onChange={(event) => {
                    setPreferences((current) => ({ ...current, horizonDays: Number(event.target.value) as 7 | 30 | 60 }));
                    clearFeedback();
                  }}
                  disabled={busy}
                >
                  <option value={7}>未来 7 天</option>
                  <option value={30}>未来 30 天</option>
                  <option value={60}>未来 60 天</option>
                </Select>
              </FormField>

              <FormField label="地区 / 运营商分布" hint="限制概览分布图中显示的主要项目数量。">
                <Select
                  value={preferences.distributionLimit}
                  onChange={(event) => {
                    setPreferences((current) => ({ ...current, distributionLimit: Number(event.target.value) as 3 | 6 | 10 }));
                    clearFeedback();
                  }}
                  disabled={busy}
                >
                  <option value={3}>Top 3</option>
                  <option value={6}>Top 6</option>
                  <option value={10}>Top 10</option>
                </Select>
              </FormField>
            </div>
          </Card>

          <Card className="overflow-hidden" data-dashboard-focus-workspace="alpha.51.9">
            <div className="border-b border-line px-5 py-5 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
                      <Star className="h-4 w-4" />
                    </div>
                    <h3 className="font-semibold text-ink">重点号码</h3>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-ink-muted">最多固定 6 张。未选择时，“重点号码”模块不会占用 Dashboard 空间。</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
                  preferences.focusedSimIds.length ? "bg-brand-soft text-brand" : "bg-surface-subtle text-ink-muted"
                }`}>
                  {preferences.focusedSimIds.length}/6
                </span>
              </div>

              <div className="relative mt-4">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索号码、运营商或地区"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="max-h-[360px] divide-y divide-line overflow-y-auto">
              {filteredSims.length ? filteredSims.map((sim) => {
                const selected = preferences.focusedSimIds.includes(sim.id);
                const disabled = !selected && preferences.focusedSimIds.length >= 6;
                return (
                  <button
                    key={sim.id}
                    type="button"
                    disabled={disabled || busy}
                    onClick={() => toggleFocusedSim(sim.id)}
                    className={`flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition sm:px-6 ${
                      selected ? "bg-brand-soft" : "hover:bg-surface-subtle"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink">{sim.label}</div>
                      <div className="mt-1 truncate text-xs text-ink-muted">
                        {sim.phoneNumber || "未填写手机号"} · {sim.carrierName} · {sim.country}
                      </div>
                    </div>
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${
                      selected
                        ? "border-brand bg-brand text-brand-foreground"
                        : "border-line bg-surface text-transparent"
                    }`}>
                      <Star className="h-3.5 w-3.5" />
                    </div>
                  </button>
                );
              }) : (
                <div className="flex min-h-40 flex-col items-center justify-center px-6 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-subtle text-ink-muted">
                    <Search className="h-4 w-4" />
                  </div>
                  <div className="mt-3 text-sm font-medium text-ink-secondary">
                    {simOptions.length ? "没有符合筛选的号码" : "暂无可选择的号码"}
                  </div>
                  <div className="mt-1 max-w-xs text-xs leading-5 text-ink-muted">
                    {simOptions.length ? "尝试使用手机号、运营商或地区中的其他关键词。" : "添加号码后，可以在这里把常用 SIM / eSIM 固定到概览。"}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>
      ) : null}

      <div
        className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-floating sm:flex-row sm:items-center sm:justify-between"
        data-dashboard-action-bar="alpha.51.9"
      >
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink">{hasChanges ? "有尚未保存的概览调整" : "概览设置已同步"}</div>
          <div className="mt-1 text-xs leading-5 text-ink-muted">恢复默认会立即写入默认布局；其他调整请点击“保存设置”。</div>
        </div>
        <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="secondary" onClick={reset} disabled={busy}>
            <RotateCcw className="mr-2 h-4 w-4" />恢复默认
          </Button>
          <Button type="button" onClick={save} disabled={busy || !hasChanges}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {busy ? "保存中…" : "保存设置"}
          </Button>
        </div>
      </div>
    </div>
  );
}
