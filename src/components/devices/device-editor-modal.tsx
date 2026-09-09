"use client";

import { FormEvent, useState } from "react";
import { Box, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogAlert, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { FormField, FormGrid } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
    <Dialog onClose={onClose} busy={saving} size="md" dataAttribute="device-editor">
      <DialogHeader
        eyebrow="设备管理"
        icon={<Box className="h-4 w-4" />}
        title={editing ? "编辑设备" : "新增设备"}
        description="设备用于号码的“存放位置”选择，不记录卡槽、启停状态或 eSIM Profile 的实时切换。"
        onClose={onClose}
        busy={saving}
      />

      <form onSubmit={submit} className="contents">
        <DialogBody className="space-y-5">
          <FormGrid>
            <FormField label="设备名称" required>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="例如：主力手机、eSTK Plus+、SIM 卡收纳盒"
                required
                autoFocus
              />
            </FormField>
            <FormField label="设备类型">
              <Select
                value={form.type}
                onChange={(event) => setForm({ ...form, type: event.target.value as DeviceType })}
              >
                {DEVICE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </Select>
            </FormField>
          </FormGrid>

          <FormGrid>
            <FormField label="品牌">
              <Input value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} placeholder="可选" />
            </FormField>
            <FormField label="型号">
              <Input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} placeholder="可选" />
            </FormField>
          </FormGrid>

          <FormField label="备注" hint="可记录这台设备的用途、卡槽规划或其他需要记住的信息。">
            <Textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="可选"
              rows={3}
            />
          </FormField>

          {error ? <DialogAlert>{error}</DialogAlert> : null}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>取消</Button>
          <Button type="submit" disabled={saving} className="min-w-24 gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editing ? "保存修改" : "添加设备"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
