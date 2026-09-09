"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Globe2, Loader2, Pencil, Plus, RadioTower, RotateCcw, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountryRegionSelect } from "@/components/ui/country-region-select";
import { Input } from "@/components/ui/input";
import { ModalPortal } from "@/components/ui/modal-portal";
import { getCommonCarriers } from "@/lib/carrier-catalog";
import { getCountryRegion } from "@/lib/countries";

type Carrier = {
  id: number;
  name: string;
  country: string;
  countryCode: string;
  website: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  name: string;
  countryCode: string;
  website: string;
  notes: string;
};

const emptyForm: FormState = {
  name: "",
  countryCode: "",
  website: "",
  notes: "",
};

function countryFlag(countryCode: string) {
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🌐";
  return String.fromCodePoint(...Array.from(code).map((char) => 127397 + char.charCodeAt(0)));
}

function websiteHost(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
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

export default function CarriersPage() {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Carrier | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const selectedRegion = useMemo(() => getCountryRegion(form.countryCode), [form.countryCode]);
  const commonCarriers = useMemo(() => getCommonCarriers(form.countryCode), [form.countryCode]);

  const loadCarriers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/carriers", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "运营商数据加载失败");
      setCarriers(data.carriers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "运营商数据加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCarriers();
  }, [loadCarriers]);

  const countryOptions = useMemo(() => {
    const countries = new Map<string, { code: string; name: string; count: number }>();
    carriers.forEach((carrier) => {
      const code = carrier.countryCode.toUpperCase();
      const current = countries.get(code);
      if (current) current.count += 1;
      else countries.set(code, { code, name: carrier.country, count: 1 });
    });
    return Array.from(countries.values()).sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  }, [carriers]);

  useEffect(() => {
    if (countryFilter !== "all" && !countryOptions.some((country) => country.code === countryFilter)) setCountryFilter("all");
  }, [countryFilter, countryOptions]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return carriers.filter((carrier) => {
      const matchesCountry = countryFilter === "all" || carrier.countryCode.toUpperCase() === countryFilter;
      const matchesSearch = !value || [carrier.name, carrier.country, carrier.countryCode, carrier.website || "", carrier.notes || ""].some((field) => field.toLowerCase().includes(value));
      return matchesCountry && matchesSearch;
    });
  }, [carriers, countryFilter, query]);

  const websiteCount = useMemo(() => carriers.filter((carrier) => Boolean(carrier.website)).length, [carriers]);
  const hasFilters = Boolean(query.trim()) || countryFilter !== "all";

  function clearFilters() {
    setQuery("");
    setCountryFilter("all");
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setFormOpen(true);
  }

  function openEdit(carrier: Carrier) {
    setEditing(carrier);
    setForm({
      name: carrier.name,
      countryCode: carrier.countryCode,
      website: carrier.website || "",
      notes: carrier.notes || "",
    });
    setError("");
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setError("");
  }

  function changeCountry(countryCode: string) {
    const currentPreset = getCommonCarriers(form.countryCode).some(
      (carrier) => carrier.name === form.name && carrier.website === form.website,
    );

    setForm({
      ...form,
      countryCode,
      ...(currentPreset ? { name: "", website: "" } : {}),
    });
  }

  function useCarrierPreset(name: string, website: string) {
    setForm({ ...form, name, website });
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (!form.countryCode) {
      setError("请选择国家 / 地区");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/carriers", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, ...form } : form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败");

      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await loadCarriers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(carrier: Carrier) {
    if (!window.confirm(`确定删除运营商“${carrier.name}”吗？`)) return;
    setError("");

    try {
      const response = await fetch(`/api/carriers?id=${carrier.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除失败");
      setCarriers((current) => current.filter((item) => item.id !== carrier.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5" data-carriers-polish="alpha.51.2">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">运营商</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary">集中维护国家 / 地区与运营商基础资料，录入号码时可直接复用，不再重复填写。</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" />新增运营商</Button>
      </header>

      {error && !formOpen ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {!loading && carriers.length ? (
        <section className="grid gap-3 sm:grid-cols-3" aria-label="运营商概览">
          <MetricCard label="运营商总数" value={carriers.length} hint="当前已录入资料" />
          <MetricCard label="国家 / 地区" value={countryOptions.length} hint="按运营商所在地区统计" />
          <MetricCard label="已录入官网" value={websiteCount} hint={`${carriers.length - websiteCount} 个尚未记录官网`} />
        </section>
      ) : null}

      <Card className="p-4 sm:p-5" data-carrier-toolbar="alpha.51.2">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="font-medium text-ink">运营商资料</div>
            <div className="mt-0.5 text-xs text-ink-muted">显示 <span className="tabular-nums">{filtered.length}</span> / {carriers.length} 个运营商</div>
          </div>
          <div className="flex w-full gap-2 lg:w-auto">
            <div className="relative min-w-0 flex-1 lg:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索运营商、国家或代码" className="pl-9" />
            </div>
            {hasFilters ? (
              <Button type="button" variant="ghost" size="icon" onClick={clearFilters} title="清除筛选" aria-label="清除运营商筛选"><RotateCcw className="h-4 w-4" /></Button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
          <select
            value={countryFilter}
            onChange={(event) => setCountryFilter(event.target.value)}
            aria-label="按国家或地区筛选运营商"
            className="h-9 rounded-lg border border-line bg-surface px-3 text-xs text-ink-secondary outline-none transition focus:border-brand focus:ring-4 focus:ring-focus"
          >
            <option value="all">全部国家 / 地区 · {carriers.length}</option>
            {countryOptions.map((country) => <option key={country.code} value={country.code}>{countryFlag(country.code)} {country.name} · {country.count}</option>)}
          </select>
        </div>
      </Card>

      {loading ? (
        <Card className="flex min-h-64 items-center justify-center text-sm text-ink-secondary"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载运营商…</Card>
      ) : carriers.length === 0 ? (
        <Card className="flex min-h-72 flex-col items-center justify-center border-dashed px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand"><RadioTower className="h-5 w-5" /></div>
          <p className="mt-4 text-sm font-medium text-ink">还没有运营商资料</p>
          <p className="mt-1 max-w-md text-xs leading-5 text-ink-muted">从正在使用的运营商开始添加。选择国家 / 地区后，可以直接套用内置的常用运营商资料。</p>
          <Button onClick={openCreate} variant="secondary" size="sm" className="mt-4 gap-1.5"><Plus className="h-3.5 w-3.5" />添加第一个运营商</Button>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex min-h-64 flex-col items-center justify-center border-dashed px-6 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-subtle text-ink-muted"><Search className="h-5 w-5" /></div>
          <p className="mt-4 text-sm font-medium text-ink">没有匹配的运营商</p>
          <p className="mt-1 text-xs text-ink-muted">尝试调整搜索关键词或国家 / 地区筛选。</p>
          <Button variant="secondary" size="sm" className="mt-4 gap-1.5" onClick={clearFilters}><RotateCcw className="h-3.5 w-3.5" />清除筛选</Button>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((carrier) => {
            const host = websiteHost(carrier.website);
            return (
              <Card key={carrier.id} variant="interactive" className="group flex min-h-56 flex-col overflow-hidden p-0">
                <div className="flex flex-1 items-start gap-3 p-5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-xl" aria-hidden="true">{countryFlag(carrier.countryCode)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-ink">{carrier.name}</span>
                      <span className="rounded-md bg-surface-subtle px-2 py-0.5 text-[10px] font-semibold text-ink-muted ring-1 ring-inset ring-line">{carrier.countryCode}</span>
                    </div>
                    <div className="mt-1 text-sm text-ink-secondary">{carrier.country}</div>
                    {host ? (
                      <div className="mt-3 flex min-w-0 items-center gap-1.5 text-xs text-ink-muted"><Globe2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{host}</span></div>
                    ) : (
                      <div className="mt-3 text-xs text-ink-faint">尚未录入官方网站</div>
                    )}
                    {carrier.notes ? <div className="mt-3 line-clamp-2 text-xs leading-5 text-ink-muted">{carrier.notes}</div> : null}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1 border-t border-line-subtle bg-surface-subtle px-3 py-2.5">
                  {carrier.website ? (
                    <a href={carrier.website} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium text-ink-secondary transition hover:bg-surface-hover hover:text-ink">
                      <ExternalLink className="h-3.5 w-3.5" />官网
                    </a>
                  ) : null}
                  <Button variant="ghost" size="sm" onClick={() => openEdit(carrier)} className="gap-1.5"><Pencil className="h-3.5 w-3.5" />编辑</Button>
                  <Button variant="ghost" size="sm" onClick={() => void remove(carrier)} className="gap-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-3.5 w-3.5" />删除</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {formOpen ? (
        <ModalPortal onBackdropClick={closeForm}>
          <Card className="w-full max-w-xl overflow-visible shadow-floating">
            <div className="flex items-center justify-between rounded-t-2xl border-b border-line bg-surface px-6 py-5">
              <div>
                <h3 className="font-semibold text-ink">{editing ? "编辑运营商" : "新增运营商"}</h3>
                <p className="mt-1 text-xs text-ink-muted">先选择国家 / 地区，再从常用运营商中一键填入名称和官网。</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={closeForm} aria-label="关闭运营商编辑"><X className="h-4 w-4" /></Button>
            </div>

            <form onSubmit={submit} className="space-y-4 rounded-b-2xl bg-surface p-6">
              <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                <div className="space-y-1.5 text-sm">
                  <span className="font-medium text-ink-secondary">国家 / 地区</span>
                  <CountryRegionSelect value={form.countryCode} onChange={changeCountry} disabled={saving} />
                </div>

                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-ink-secondary">国家代码</span>
                  <Input value={selectedRegion?.code ?? ""} readOnly tabIndex={-1} placeholder="自动生成" className="bg-surface-subtle font-medium text-ink-muted" />
                </label>
              </div>

              {form.countryCode ? (
                <div className="rounded-xl border border-line bg-surface-subtle p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-ink-secondary">常用运营商</div>
                      <div className="mt-0.5 text-xs text-ink-muted">点击后自动填入运营商名称和官方网站。</div>
                    </div>
                    <span className="rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink-muted shadow-sm">{selectedRegion?.name}</span>
                  </div>

                  {commonCarriers.length ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {commonCarriers.map((carrier) => {
                        const selected = carrier.name === form.name && carrier.website === form.website;
                        return (
                          <button
                            key={`${form.countryCode}-${carrier.name}`}
                            type="button"
                            onClick={() => useCarrierPreset(carrier.name, carrier.website)}
                            className={`flex min-w-0 items-center gap-3 rounded-xl border bg-surface px-3 py-2.5 text-left transition hover:border-line-strong hover:shadow-sm ${selected ? "border-brand ring-2 ring-brand-soft-strong" : "border-line"}`}
                          >
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selected ? "bg-brand-soft text-brand" : "bg-surface-subtle text-ink-muted"}`}>
                              {selected ? <Check className="h-4 w-4" /> : <RadioTower className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-ink">{carrier.name}</div>
                              <div className="truncate text-[11px] text-ink-muted">{carrier.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-dashed border-line bg-surface px-3 py-3 text-xs text-ink-muted">这个国家 / 地区暂未收录常用运营商，你仍然可以在下方手动填写。</div>
                  )}
                </div>
              ) : null}

              <label className="block space-y-1.5 text-sm">
                <span className="font-medium text-ink-secondary">运营商名称</span>
                <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="可选择上方常用运营商，也可手动填写" />
              </label>

              <label className="block space-y-1.5 text-sm">
                <span className="font-medium text-ink-secondary">官网</span>
                <Input value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} placeholder="https://" type="url" />
              </label>

              <label className="block space-y-1.5 text-sm">
                <span className="font-medium text-ink-secondary">备注</span>
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  placeholder="可记录客服入口、充值渠道、特殊说明等"
                  rows={4}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-faint focus:border-brand focus:ring-4 focus:ring-focus"
                />
              </label>

              {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={closeForm}>取消</Button>
                <Button type="submit" disabled={saving} className="min-w-24 gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{editing ? "保存修改" : "添加运营商"}</Button>
              </div>
            </form>
          </Card>
        </ModalPortal>
      ) : null}
    </div>
  );
}
