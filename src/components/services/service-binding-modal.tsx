"use client";

import { useMemo, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogAlert, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { FormField, FormGrid, FormSection } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
    <Dialog onClose={onClose} busy={saving} size="lg" dataAttribute="service-binding-editor">
      <DialogHeader
        eyebrow="绑定服务"
        icon={<Link2 className="h-4 w-4" />}
        title={binding ? "编辑绑定服务" : "新增绑定服务"}
        description="记录号码与账号或业务之间的依赖关系。不要在这里保存密码、验证码、恢复码或其他秘密凭据。"
        onClose={onClose}
        busy={saving}
      />

      <DialogBody className="space-y-5">
        {error ? <DialogAlert>{error}</DialogAlert> : null}

        <FormSection title="绑定对象" description="先确认使用哪一张号码，再记录服务与账号信息。">
          <FormField
            label="号码"
            required
            hint={selectedSim ? `${selectedSim.country} · ${selectedSim.countryCode}` : "请选择需要记录绑定关系的号码。"}
          >
            <Select value={form.simId} onChange={(event) => update("simId", event.target.value)}>
              <option value="">请选择号码</option>
              {sims.map((sim) => <option key={sim.id} value={sim.id}>{sim.label} · {sim.phoneNumber || "未填写号码"} · {sim.carrierName}</option>)}
            </Select>
          </FormField>
        </FormSection>

        <FormSection title="服务信息" description="服务名称与用途会用于筛选、处理中心和号码详情展示。">
          <FormGrid>
            <FormField label="服务名称" required>
              <Input value={form.serviceName} onChange={(event) => update("serviceName", event.target.value)} placeholder="例如 Telegram、Apple ID、银行" />
            </FormField>
            <FormField label="服务分类">
              <Select value={form.category} onChange={(event) => update("category", event.target.value)}>
                {SERVICE_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </Select>
            </FormField>
            <FormField label="号码用途">
              <Select value={form.bindingType} onChange={(event) => update("bindingType", event.target.value)}>
                {SERVICE_BINDING_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </Select>
            </FormField>
            <FormField label="账号标识" hint="仅保存可公开辨认的账号信息，不保存密码或恢复秘密。">
              <Input value={form.accountIdentifier} onChange={(event) => update("accountIdentifier", event.target.value)} placeholder="邮箱、用户名、账号尾号等" />
            </FormField>
            <FormField label="重要程度">
              <Select value={form.importance} onChange={(event) => update("importance", event.target.value)}>
                {SERVICE_IMPORTANCE_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </Select>
            </FormField>
            <FormField label="绑定状态">
              <Select value={form.status} onChange={(event) => update("status", event.target.value)}>
                {SERVICE_BINDING_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </Select>
            </FormField>
          </FormGrid>

          <FormField label="服务网址">
            <Input value={form.website} onChange={(event) => update("website", event.target.value)} placeholder="可选：https://" />
          </FormField>
        </FormSection>

        <FormSection title="维护记录" description="日期和备注用于以后判断是否需要重新核验或迁移。">
          <FormGrid>
            <FormField label="绑定日期">
              <Input type="date" value={form.boundAt} onChange={(event) => update("boundAt", event.target.value)} />
            </FormField>
            <FormField label="最后确认日期">
              <Input type="date" value={form.verifiedAt} onChange={(event) => update("verifiedAt", event.target.value)} />
            </FormField>
          </FormGrid>
          <FormField label="备注">
            <Textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} rows={4} placeholder="可记录换绑入口、客服要求、解绑注意事项等" />
          </FormField>
        </FormSection>
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>取消</Button>
        <Button type="button" onClick={() => void save()} disabled={saving || !form.simId || !form.serviceName.trim()} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          {binding ? "保存修改" : "添加绑定"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
