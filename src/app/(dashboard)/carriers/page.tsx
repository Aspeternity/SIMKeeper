"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Loader2, Pencil, Plus, RadioTower, Search, Trash2, X } from "lucide-react";
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

export default function CarriersPage() {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
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

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return carriers;
    return carriers.filter((carrier) =>
      [carrier.name, carrier.country, carrier.countryCode, carrier.notes || ""].some((field) =>
        field.toLowerCase().includes(value),
      ),
    );
  }, [carriers, query]);

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
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <RadioTower className="h-4 w-4" />
            基础资料
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">运营商管理</h2>
          <p className="mt-1 text-sm text-slate-500">选择国家/地区后可直接使用内置常用运营商资料，也可以继续手动添加其他运营商。</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          新增运营商
        </button>
      </div>

      {error && !formOpen ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-medium">运营商列表</div>
            <div className="mt-1 text-xs text-slate-400">共 {carriers.length} 个运营商</div>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名称、国家或代码"
              className="pl-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            正在加载运营商…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <RadioTower className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm font-medium">{query ? "没有匹配的运营商" : "还没有运营商资料"}</p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">
              {query ? "尝试更换关键词。" : "从你正在使用的运营商开始添加，后续录入号码时即可直接选择。"}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((carrier) => (
              <div key={carrier.id} className="flex flex-col gap-4 p-4 transition hover:bg-slate-50/70 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <RadioTower className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{carrier.name}</span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{carrier.countryCode}</span>
                    </div>
                    <div className="mt-1 text-sm text-slate-500">{carrier.country}</div>
                    {carrier.notes ? <div className="mt-1 line-clamp-1 text-xs text-slate-400">{carrier.notes}</div> : null}
                  </div>
                </div>

                <div className="flex items-center gap-2 md:justify-end">
                  {carrier.website ? (
                    <a
                      href={carrier.website}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-slate-950"
                    >
                      官网
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                  <button
                    onClick={() => openEdit(carrier)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-slate-950"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    编辑
                  </button>
                  <button
                    onClick={() => void remove(carrier)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {formOpen ? (
        <ModalPortal onBackdropClick={closeForm}>
          <Card className="w-full max-w-xl overflow-visible shadow-2xl">
            <div className="flex items-center justify-between rounded-t-2xl border-b bg-white px-6 py-5">
              <div>
                <h3 className="font-semibold">{editing ? "编辑运营商" : "新增运营商"}</h3>
                <p className="mt-1 text-xs text-slate-400">先选择国家/地区，再从常用运营商中一键填入名称和官网。</p>
              </div>
              <button onClick={closeForm} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4 rounded-b-2xl bg-white p-6">
              <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                <div className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">国家 / 地区</span>
                  <CountryRegionSelect value={form.countryCode} onChange={changeCountry} disabled={saving} />
                </div>

                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">国家代码</span>
                  <Input
                    value={selectedRegion?.code ?? ""}
                    readOnly
                    tabIndex={-1}
                    placeholder="自动生成"
                    className="bg-slate-50 font-medium text-slate-500"
                  />
                </label>
              </div>

              {form.countryCode ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-700">常用运营商</div>
                      <div className="mt-0.5 text-xs text-slate-400">点击后自动填入运营商名称和官方网站。</div>
                    </div>
                    <span className="rounded-md bg-white px-2 py-1 text-[11px] font-medium text-slate-500 shadow-sm">
                      {selectedRegion?.name}
                    </span>
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
                            className={`flex min-w-0 items-center gap-3 rounded-xl border bg-white px-3 py-2.5 text-left transition hover:border-slate-300 hover:shadow-sm ${
                              selected ? "border-slate-400 ring-2 ring-slate-100" : "border-slate-200"
                            }`}
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                              {selected ? <Check className="h-4 w-4" /> : <RadioTower className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-slate-700">{carrier.name}</div>
                              <div className="truncate text-[11px] text-slate-400">{carrier.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-dashed bg-white px-3 py-3 text-xs text-slate-400">
                      这个国家 / 地区暂未收录常用运营商，你仍然可以在下方手动填写。
                    </div>
                  )}
                </div>
              ) : null}

              <label className="block space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">运营商名称</span>
                <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="可选择上方常用运营商，也可手动填写" />
              </label>

              <label className="block space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">官网</span>
                <Input value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} placeholder="https://" type="url" />
              </label>

              <label className="block space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">备注</span>
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  placeholder="可记录客服入口、充值渠道、特殊说明等"
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                />
              </label>

              {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeForm} className="h-10 rounded-xl border px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-10 min-w-24 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {editing ? "保存修改" : "添加运营商"}
                </button>
              </div>
            </form>
          </Card>
        </ModalPortal>
      ) : null}
    </div>
  );
}
