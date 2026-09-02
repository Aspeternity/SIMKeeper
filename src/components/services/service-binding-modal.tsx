"use client";

import { useMemo, useState } from "react";
import { Link2, Loader2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModalPortal } from "@/components/ui/modal-portal";
import {
  SERVICE_BINDING_STATUSES,
  SERVICE_BINDING_TYPES,
  SERVICE_CATEGORIES,
  SERVICE_IMPORTANCE_LEVELS,
} from "@/lib/service-bindings";
import type { BoundServiceRecord, BoundServiceSimSummary } from "@/lib/service-binding-types";

type FormState = {
  simId: string;
  serviceName: string;
  category: string;
  bindingType: string;
  accountIdentifier: string;
  importance: string;
  status: string;
  website: string;
  boundAt: string;
  verifiedAt: string;
  notes: string;
};

function formFromBinding(binding: BoundServiceRecord | null, sims: BoundServiceSimSummary[], initialSimId?: number): FormState {
  return {
    simId: String(binding?.simId ?? initialSimId ?? sims[0]?.id ?? ""),
    serviceName: binding?.serviceName ?? "",
    category: binding?.category ?? "communication",
    bindingType: binding?.bindingType ?? "verification",
    accountIdentifier: binding?.accountIdentifier ?? "",
    importance: binding?.importance ?? "normal",
    status: binding?.status ?? "active",
    website: binding?.website ?? "",
    boundAt: binding?.boundAt ?? "",
    verifiedAt: binding?.verifiedAt ?? "",
    notes: binding?.notes ?? "",
  };
}

export function ServiceBindingModal({
  binding,
  sims,
  initialSimId,
  onClose,
  onSaved,
}: {
  binding: BoundServiceRecord | null;
  sims: BoundServiceSimSummary[];
  initialSimId?: number;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [form, setForm] = useState<FormState>(() => formFromBinding(binding, sims, initialSimId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedSim = useMemo(() => sims.find((sim) => String(sim.id) === form.simId) ?? null, [form.simId, sims]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (saving) return;
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/services", {
        method: binding ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: binding?.id,
          simId: Number(form.simId),
          serviceName: form.serviceName,
          category: form.category,
          bindingType: form.bindingType,
          accountIdentifier: form.accountIdentifier,
          importance: form.importance,
          status: form.status,
          website: form.website,
          boundAt: form.boundAt,
          verifiedAt: form.verifiedAt,
          notes: form.notes,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存绑定服务失败");
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存绑定服务失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal onBackdropClick={saving ? undefined : onClose}>
      <Card className="flex w-full max-w-3xl flex-col overflow-hidden shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b bg-white px-5 py-4 sm:px-6">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500"><Link2 className="h-4 w-4" />绑定服务</div>
            <h3 className="mt-1 text-xl font-semibold text-slate-900">{binding ? "编辑绑定服务" : "新增绑定服务"}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">记录号码与账号/业务之间的绑定关系。不要在这里保存密码、验证码、恢复码或其他秘密凭据。</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-white px-5 py-5 sm:px-6">
          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium text-slate-700">号码</span>
              <select value={form.simId} onChange={(event) => update("simId", event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400">
                <option value="">请选择号码</option>
                {sims.map((sim) => <option key={sim.id} value={sim.id}>{sim.label} · {sim.phoneNumber || "未填写号码"} · {sim.carrierName}</option>)}
              </select>
              {selectedSim ? <div className="text-xs text-slate-400">{selectedSim.country} · {selectedSim.countryCode}</div> : null}
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">服务名称</span>
              <Input value={form.serviceName} onChange={(event) => update("serviceName", event.target.value)} placeholder="例如 Telegram、Apple ID、银行" />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">服务分类</span>
              <select value={form.category} onChange={(event) => update("category", event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400">
                {SERVICE_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">号码用途</span>
              <select value={form.bindingType} onChange={(event) => update("bindingType", event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400">
                {SERVICE_BINDING_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">账号标识</span>
              <Input value={form.accountIdentifier} onChange={(event) => update("accountIdentifier", event.target.value)} placeholder="可选：邮箱、用户名、账号尾号等" />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">重要程度</span>
              <select value={form.importance} onChange={(event) => update("importance", event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400">
                {SERVICE_IMPORTANCE_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">绑定状态</span>
              <select value={form.status} onChange={(event) => update("status", event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400">
                {SERVICE_BINDING_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>

            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium text-slate-700">服务网址</span>
              <Input value={form.website} onChange={(event) => update("website", event.target.value)} placeholder="可选：https://" />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">绑定日期</span>
              <Input type="date" value={form.boundAt} onChange={(event) => update("boundAt", event.target.value)} />
            </label>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">最后确认日期</span>
              <Input type="date" value={form.verifiedAt} onChange={(event) => update("verifiedAt", event.target.value)} />
            </label>

            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium text-slate-700">备注</span>
              <textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} rows={4} placeholder="可记录换绑入口、客服要求、解绑注意事项等" className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-slate-400" />
            </label>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-white px-5 py-4 sm:px-6">
          <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">取消</button>
          <button type="button" onClick={() => void save()} disabled={saving || !form.simId || !form.serviceName.trim()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}{binding ? "保存修改" : "添加绑定"}
          </button>
        </div>
      </Card>
    </ModalPortal>
  );
}
