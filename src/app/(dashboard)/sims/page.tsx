"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CreditCard, Loader2, Pencil, Plus, Search, Smartphone, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CURRENCIES, getDefaultCurrency, getSimStatusLabel, getSimTypeLabel, SIM_STATUSES, SIM_TYPES } from "@/lib/sim-options";

type Carrier = {
  id: number;
  name: string;
  country: string;
  countryCode: string;
};

type SimCard = {
  id: number;
  label: string;
  phoneNumber: string | null;
  carrierId: number;
  carrierName: string;
  country: string;
  countryCode: string;
  simType: string;
  iccid: string | null;
  balance: number | null;
  currencyCode: string | null;
  status: string;
  activationDate: string | null;
  validUntil: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  label: string;
  phoneNumber: string;
  carrierId: string;
  simType: string;
  iccid: string;
  balance: string;
  currencyCode: string;
  status: string;
  activationDate: string;
  validUntil: string;
  notes: string;
};

const emptyForm: FormState = {
  label: "",
  phoneNumber: "",
  carrierId: "",
  simType: "physical",
  iccid: "",
  balance: "",
  currencyCode: "USD",
  status: "active",
  activationDate: "",
  validUntil: "",
  notes: "",
};

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

function dateHint(sim: SimCard) {
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
    case "closed":
      return "bg-slate-100 text-slate-500 ring-slate-200";
    default:
      return "bg-slate-100 text-slate-500 ring-slate-200";
  }
}

export default function SimsPage() {
  const [sims, setSims] = useState<SimCard[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [carrierFilter, setCarrierFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SimCard | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const selectedCarrier = useMemo(
    () => carriers.find((carrier) => carrier.id === Number(form.carrierId)) ?? null,
    [carriers, form.carrierId],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [simsResponse, carriersResponse] = await Promise.all([
        fetch("/api/sims", { cache: "no-store" }),
        fetch("/api/carriers", { cache: "no-store" }),
      ]);
      const [simsData, carriersData] = await Promise.all([simsResponse.json(), carriersResponse.json()]);
      if (!simsResponse.ok) throw new Error(simsData.error || "号码数据加载失败");
      if (!carriersResponse.ok) throw new Error(carriersData.error || "运营商数据加载失败");
      setSims(simsData.sims || []);
      setCarriers(carriersData.carriers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "号码数据加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return sims.filter((sim) => {
      const matchesQuery =
        !value ||
        [sim.label, sim.phoneNumber || "", sim.carrierName, sim.country, sim.countryCode, sim.iccid || "", sim.notes || ""].some((field) =>
          field.toLowerCase().includes(value),
        );
      const matchesStatus = statusFilter === "all" || sim.status === statusFilter;
      const matchesCarrier = carrierFilter === "all" || sim.carrierId === Number(carrierFilter);
      return matchesQuery && matchesStatus && matchesCarrier;
    });
  }, [carrierFilter, query, sims, statusFilter]);

  const summary = useMemo(() => {
    const today = todayDate();
    let active = 0;
    let dueSoon = 0;
    let overdue = 0;
    for (const sim of sims) {
      const expiredByDate = Boolean(sim.validUntil && sim.validUntil < today);
      if (sim.status === "expired" || expiredByDate) overdue += 1;
      if (sim.status === "active" && !expiredByDate) active += 1;
      if (sim.status === "active" && sim.validUntil && sim.validUntil >= today && daysUntil(sim.validUntil) <= 30) dueSoon += 1;
    }
    return { active, dueSoon, overdue };
  }, [sims]);

  function openCreate() {
    if (!carriers.length) return;
    const carrier = carriers[0];
    setEditing(null);
    setForm({
      ...emptyForm,
      carrierId: String(carrier.id),
      currencyCode: getDefaultCurrency(carrier.countryCode),
    });
    setError("");
    setFormOpen(true);
  }

  function openEdit(sim: SimCard) {
    setEditing(sim);
    setForm({
      label: sim.label,
      phoneNumber: sim.phoneNumber || "",
      carrierId: String(sim.carrierId),
      simType: sim.simType,
      iccid: sim.iccid || "",
      balance: sim.balance === null ? "" : String(sim.balance),
      currencyCode: sim.currencyCode || getDefaultCurrency(sim.countryCode),
      status: sim.status,
      activationDate: sim.activationDate || "",
      validUntil: sim.validUntil || "",
      notes: sim.notes || "",
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

  function changeCarrier(carrierId: string) {
    const carrier = carriers.find((item) => item.id === Number(carrierId));
    setForm((current) => ({
      ...current,
      carrierId,
      currencyCode: carrier ? getDefaultCurrency(carrier.countryCode) : current.currencyCode,
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.carrierId) {
      setError("请选择运营商");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/sims", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, ...form } : form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败");
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(sim: SimCard) {
    if (!window.confirm(`确定删除“${sim.label}”吗？号码资料将被永久移除。`)) return;
    setError("");
    try {
      const response = await fetch(`/api/sims?id=${sim.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除失败");
      setSims((current) => current.filter((item) => item.id !== sim.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <Smartphone className="h-4 w-4" />
            生命周期
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">号码管理</h2>
          <p className="mt-1 text-sm text-slate-500">集中管理 SIM / eSIM 的运营商、余额、状态和有效期。</p>
        </div>
        {carriers.length ? (
          <button
            onClick={openCreate}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            新增号码
          </button>
        ) : (
          <Link
            href="/carriers"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            先添加运营商
          </Link>
        )}
      </div>

      {error && !formOpen ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {!loading && carriers.length === 0 ? (
        <Card className="border-dashed p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium">号码需要关联运营商</div>
              <p className="mt-1 text-sm text-slate-500">先建立至少一个运营商，再录入号码。国家/地区信息会自动从运营商继承。</p>
            </div>
            <Link href="/carriers" className="text-sm font-medium text-slate-950 underline underline-offset-4">
              前往运营商管理
            </Link>
          </div>
        </Card>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["号码总数", sims.length, Smartphone],
          ["正常", summary.active, CreditCard],
          ["30 天内到期", summary.dueSoon, CalendarDays],
          ["已逾期 / 失效", summary.overdue, CalendarDays],
        ].map(([label, value, Icon]) => {
          const IconComponent = Icon as typeof Smartphone;
          return (
            <Card key={String(label)} className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">{String(label)}</span>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <IconComponent className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4 text-3xl font-semibold tracking-tight">{String(value)}</div>
            </Card>
          );
        })}
      </section>

      <Card className="overflow-hidden">
        <div className="space-y-3 border-b p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="font-medium">号码列表</div>
              <div className="mt-1 text-xs text-slate-400">显示 {filtered.length} / {sims.length} 个号码</div>
            </div>
            <div className="relative w-full lg:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索号码、名称、运营商或 ICCID" className="pl-9" />
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 outline-none focus:border-slate-400"
            >
              <option value="all">全部状态</option>
              {SIM_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
            <select
              value={carrierFilter}
              onChange={(event) => setCarrierFilter(event.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 outline-none focus:border-slate-400"
            >
              <option value="all">全部运营商</option>
              {carriers.map((carrier) => (
                <option key={carrier.id} value={carrier.id}>{carrier.name} · {carrier.country}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            正在加载号码…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <Smartphone className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm font-medium">{sims.length ? "没有匹配的号码" : "还没有录入号码"}</p>
            <p className="mt-1 max-w-md text-xs leading-5 text-slate-400">
              {sims.length ? "尝试调整搜索关键词或筛选条件。" : "从你最常用的一张 SIM / eSIM 开始录入，SIMKeeper 会据此建立生命周期管理。"}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((sim) => {
              const hint = dateHint(sim);
              const isDateOverdue = Boolean(sim.validUntil && sim.validUntil < todayDate());
              return (
                <div key={sim.id} className="p-4 transition hover:bg-slate-50/70">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                        <Smartphone className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-slate-900">{sim.label}</span>
                          <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${statusClass(sim.status)}`}>
                            {getSimStatusLabel(sim.status)}
                          </span>
                          {isDateOverdue && sim.status !== "expired" && sim.status !== "closed" ? (
                            <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-inset ring-rose-100">有效期已过</span>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500">
                          <span>{sim.phoneNumber || "未填写手机号"}</span>
                          <span>{sim.carrierName}</span>
                          <span>{sim.country} · {sim.countryCode}</span>
                          <span>{getSimTypeLabel(sim.simType)}</span>
                        </div>
                        {sim.notes ? <div className="mt-1 line-clamp-1 text-xs text-slate-400">{sim.notes}</div> : null}
                      </div>
                    </div>

                    <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:w-[430px]">
                      <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <div className="text-[11px] text-slate-400">余额</div>
                        <div className="mt-1 text-sm font-medium text-slate-700">
                          {sim.balance === null ? "未记录" : `${sim.balance} ${sim.currencyCode || ""}`}
                        </div>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <div className="text-[11px] text-slate-400">有效期至</div>
                        <div className={`mt-1 text-sm font-medium ${hint ? "text-amber-700" : "text-slate-700"}`}>
                          {sim.validUntil || "未设置"}
                        </div>
                        {hint ? <div className="mt-0.5 text-[10px] text-amber-600">{hint}</div> : null}
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1">
                        <button
                          onClick={() => openEdit(sim)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-slate-950"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          编辑
                        </button>
                        <button
                          onClick={() => void remove(sim)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/30 p-4 backdrop-blur-sm sm:items-center">
          <Card className="my-4 w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between border-b bg-white px-6 py-5">
              <div>
                <h3 className="font-semibold">{editing ? "编辑号码" : "新增号码"}</h3>
                <p className="mt-1 text-xs text-slate-400">国家/地区会根据所选运营商自动继承，无需重复填写。</p>
              </div>
              <button onClick={closeForm} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-5 bg-white p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">号码名称</span>
                  <Input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="例如 Globe 主号" autoFocus required />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">手机号 / MSISDN</span>
                  <Input value={form.phoneNumber} onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })} placeholder="可选，例如 +63..." />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-[1.4fr_0.6fr]">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">运营商</span>
                  <select
                    value={form.carrierId}
                    onChange={(event) => changeCarrier(event.target.value)}
                    required
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                  >
                    <option value="">请选择运营商</option>
                    {carriers.map((carrier) => (
                      <option key={carrier.id} value={carrier.id}>{carrier.name} · {carrier.country}</option>
                    ))}
                  </select>
                  {selectedCarrier ? <div className="text-xs text-slate-400">{selectedCarrier.country} · {selectedCarrier.countryCode}</div> : null}
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">SIM 类型</span>
                  <select
                    value={form.simType}
                    onChange={(event) => setForm({ ...form, simType: event.target.value })}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                  >
                    {SIM_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-[1.4fr_0.6fr]">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">ICCID</span>
                  <Input value={form.iccid} onChange={(event) => setForm({ ...form, iccid: event.target.value.replace(/\s+/g, "") })} placeholder="可选，10-32 位数字" inputMode="numeric" />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">状态</span>
                  <select
                    value={form.status}
                    onChange={(event) => setForm({ ...form, status: event.target.value })}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                  >
                    {SIM_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">余额</span>
                  <Input value={form.balance} onChange={(event) => setForm({ ...form, balance: event.target.value })} placeholder="可选，例如 100" inputMode="decimal" type="number" min="0" step="any" />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">币种</span>
                  <select
                    value={form.currencyCode}
                    onChange={(event) => setForm({ ...form, currencyCode: event.target.value })}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                  >
                    {CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} · {currency.label}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">激活日期</span>
                  <Input value={form.activationDate} onChange={(event) => setForm({ ...form, activationDate: event.target.value })} type="date" />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium text-slate-700">有效期至</span>
                  <Input value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} type="date" />
                </label>
              </div>

              <label className="block space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">备注</span>
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  placeholder="可记录套餐、用途、卡槽位置、实名信息提示等"
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                />
              </label>

              {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={closeForm} className="h-10 rounded-xl border px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50">取消</button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-10 min-w-24 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {editing ? "保存修改" : "添加号码"}
                </button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
