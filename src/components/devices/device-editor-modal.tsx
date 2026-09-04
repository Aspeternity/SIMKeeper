"use client";

import { FormEvent, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModalPortal } from "@/components/ui/modal-portal";
import { DEVICE_TYPES, type DeviceRecord, type DeviceType } from "@/lib/device-types";

type FormState = {
  name: string;
  type: DeviceType;
  brand: string;
  model: string;
  notes: string;
};

function initialForm(editing: DeviceRecord | null): FormState {
  return editing
    ? {
        name: editing.name,
        type: editing.type,
        brand: editing.brand || "",
        model: editing.model || "",
        notes: editing.notes || "",
      }
    : {
        name: "",
        type: "phone",
        brand: "",
        model: "",
        notes: "",
      };
}

export function DeviceEditorModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: DeviceRecord | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(editing));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/devices", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, ...form } : form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败");
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal onBackdropClick={saving ? undefined : onClose}>
      <Card className="flex w-full max-w-2xl flex-col overflow-hidden shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b bg-white px-6 py-5">
          <div>
            <h3 className="font-semibold">{editing ? "编辑设备" : "新增设备"}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">设备用于号码的“存放位置”选择，不记录卡槽、启停状态或 eSIM Profile 的实时切换。</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col bg-white">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
            <div className="grid gap-4 sm:grid-cols-[1.35fr_0.65fr]">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">设备名称</span>
                <Input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="例如：主力手机、eSTK Plus+、SIM 卡收纳盒"
                  required
                  autoFocus
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">设备类型</span>
                <select
                  value={form.type}
                  onChange={(event) => setForm({ ...form, type: event.target.value as DeviceType })}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                >
                  {DEVICE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">品牌</span>
                <Input value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} placeholder="可选" />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">型号</span>
                <Input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} placeholder="可选" />
              </label>
            </div>

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">备注</span>
              <textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="可选，例如这台设备的用途或需要记住的信息"
                rows={3}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
              />
            </label>

            {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t bg-white px-6 py-4">
            <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">取消</button>
            <button type="submit" disabled={saving} className="inline-flex h-10 min-w-24 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editing ? "保存修改" : "添加设备"}
            </button>
          </div>
        </form>
      </Card>
    </ModalPortal>
  );
}
