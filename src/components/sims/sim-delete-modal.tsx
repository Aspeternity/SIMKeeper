"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, ArrowRight, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogAlert, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import {
  getServiceBindingTypeLabel,
  getServiceCategoryLabel,
  getServiceImportanceLabel,
} from "@/lib/service-bindings";
import type { SimRecord } from "@/lib/sim-types";

type BindingRecord = {
  id: number;
  simId: number;
  serviceName: string;
  category: string;
  bindingType: string;
  accountIdentifier: string | null;
  importance: string;
  status: string;
};

type BindingAction = "pending" | "migrate" | "delete";

type BindingResolution = {
  action: BindingAction;
  targetSimId: string;
};

function initialResolutions(bindings: BindingRecord[]) {
  return Object.fromEntries(
    bindings.map((binding) => [binding.id, { action: "pending", targetSimId: "" } satisfies BindingResolution]),
  ) as Record<number, BindingResolution>;
}

function hasArchivedEsimCredentials(sim: SimRecord) {
  const profile = sim.esimProfile;
  if (!profile) return false;
  return Boolean(
    profile.hasSmdpAddress ||
      profile.hasActivationCode ||
      profile.hasConfirmationCode ||
      profile.hasLpaString ||
      profile.hasOriginalQr,
  );
}

export function SimDeleteModal({
  sim,
  sims,
  onClose,
  onDeleted,
}: {
  sim: SimRecord;
  sims: SimRecord[];
  onClose: () => void;
  onDeleted: () => Promise<void> | void;
}) {
  const [bindings, setBindings] = useState<BindingRecord[]>([]);
  const [resolutions, setResolutions] = useState<Record<number, BindingResolution>>({});
  const [preserveSnapshot, setPreserveSnapshot] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const targetSims = useMemo(() => sims.filter((item) => item.id !== sim.id), [sim.id, sims]);
  const archivedEsimCredentials = hasArchivedEsimCredentials(sim);

  const loadBindings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/services?simId=${sim.id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "绑定服务加载失败");
      const active = ((data.bindings || []) as BindingRecord[]).filter((binding) => binding.status === "active");
      setBindings(active);
      setResolutions(initialResolutions(active));
    } catch (err) {
      setError(err instanceof Error ? err.message : "绑定服务加载失败");
    } finally {
      setLoading(false);
    }
  }, [sim.id]);

  useEffect(() => {
    void loadBindings();
  }, [loadBindings]);

  const resolvedCount = useMemo(
    () =>
      bindings.filter((binding) => {
        const resolution = resolutions[binding.id];
        return resolution?.action === "delete" || (resolution?.action === "migrate" && Boolean(resolution.targetSimId));
      }).length,
    [bindings, resolutions],
  );

  const readyToDelete = !loading && bindings.length === resolvedCount;

  function changeAction(bindingId: number, action: BindingAction) {
    setResolutions((current) => ({
      ...current,
      [bindingId]: {
        action,
        targetSimId: action === "migrate" ? current[bindingId]?.targetSimId || "" : "",
      },
    }));
  }

  function changeTarget(bindingId: number, targetSimId: string) {
    setResolutions((current) => ({
      ...current,
      [bindingId]: {
        action: "migrate",
        targetSimId,
      },
    }));
  }

  async function submit() {
    if (!readyToDelete || saving) return;

    setSaving(true);
    setError("");
    try {
      const payload = {
        simId: sim.id,
        preserveSnapshot,
        bindings: bindings.map((binding) => {
          const resolution = resolutions[binding.id];
          if (resolution.action === "migrate") {
            return {
              id: binding.id,
              action: "migrate" as const,
              targetSimId: Number(resolution.targetSimId),
            };
          }
          return { id: binding.id, action: "delete" as const };
        }),
      };

      const response = await fetch("/api/sims/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) await loadBindings();
        throw new Error(data.error || "删除号码失败");
      }
      await onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除号码失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog onClose={onClose} busy={saving} size="md" dataAttribute="sim-delete">
      <DialogHeader
        eyebrow="危险操作"
        icon={<Trash2 className="h-4 w-4" />}
        title={`删除 ${sim.label}`}
        description={`${sim.phoneNumber || "未填写手机号"} · ${sim.carrierName} · ${sim.country}`}
        onClose={onClose}
        busy={saving}
        tone="danger"
      />

      <DialogBody className="space-y-4">
        <DialogAlert>
          删除后，原号码及其资费、保号规则、活动记录、实名原始资料等关联数据会永久移除。可在下方选择是否额外保留一份只读号码概要。
        </DialogAlert>

        {archivedEsimCredentials ? (
          <DialogAlert tone="warning">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">这张 eSIM 仍保存有激活凭据</div>
                <div className="mt-1 text-xs leading-5 opacity-80">删除号码后，已归档的二维码、Activation Code、LPA 等激活资料也会永久删除；即使保留号码概要也不会保留这些凭据。</div>
              </div>
            </div>
          </DialogAlert>
        ) : null}

        {loading ? (
          <div className="flex min-h-40 items-center justify-center text-sm text-ink-muted">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />正在检查绑定服务…
          </div>
        ) : bindings.length === 0 ? (
          <DialogAlert tone="success">
            <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />没有仍处于“当前绑定”的服务</div>
            <p className="mt-1 text-xs leading-5 opacity-80">可以直接删除这个号码。</p>
          </DialogAlert>
        ) : (
          <section className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h4 className="text-sm font-semibold text-ink">先处理绑定服务</h4>
                <p className="mt-1 text-xs leading-5 text-ink-muted">仍有 {bindings.length} 个当前绑定。每一项都必须选择“迁移绑定”或“删除绑定”后才能删除号码。</p>
              </div>
              <div className="text-xs font-medium text-ink-secondary">已处理 {resolvedCount} / {bindings.length}</div>
            </div>

            {bindings.map((binding) => {
              const resolution = resolutions[binding.id] || { action: "pending", targetSimId: "" };
              return (
                <div key={binding.id} className="rounded-xl border border-line bg-surface p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-medium text-ink">{binding.serviceName}</div>
                      {binding.accountIdentifier ? <div className="mt-1 truncate text-xs text-ink-muted">{binding.accountIdentifier}</div> : null}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded-md bg-surface-subtle px-2 py-1 text-[10px] text-ink-secondary">{getServiceCategoryLabel(binding.category)}</span>
                        <span className="rounded-md bg-surface-subtle px-2 py-1 text-[10px] text-ink-secondary">{getServiceBindingTypeLabel(binding.bindingType)}</span>
                        <span className="rounded-md bg-surface-subtle px-2 py-1 text-[10px] text-ink-secondary">{getServiceImportanceLabel(binding.importance)}</span>
                      </div>
                    </div>

                    <label className="w-full space-y-1.5 text-xs sm:w-40">
                      <span className="font-medium text-ink-secondary">处理方式</span>
                      <Select
                        value={resolution.action}
                        onChange={(event) => changeAction(binding.id, event.target.value as BindingAction)}
                        disabled={saving}
                        className="h-9 text-xs"
                      >
                        <option value="pending">未处理</option>
                        <option value="migrate" disabled={targetSims.length === 0}>迁移绑定</option>
                        <option value="delete">删除绑定</option>
                      </Select>
                    </label>
                  </div>

                  {resolution.action === "migrate" ? (
                    <div className="mt-3 rounded-lg bg-surface-subtle p-3">
                      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-ink-secondary">
                        <span>{sim.label}</span><ArrowRight className="h-3.5 w-3.5 text-ink-muted" /><span>选择目标号码</span>
                      </div>
                      <Select
                        value={resolution.targetSimId}
                        onChange={(event) => changeTarget(binding.id, event.target.value)}
                        disabled={saving}
                      >
                        <option value="">请选择迁移到的号码</option>
                        {targetSims.map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.label} · {target.phoneNumber || "未填写手机号"} · {target.carrierName}
                          </option>
                        ))}
                      </Select>
                      <p className="mt-2 text-[11px] leading-5 text-ink-muted">删除当前号码时，这条服务绑定会直接改到所选号码并继续保持“当前绑定”。</p>
                    </div>
                  ) : null}

                  {resolution.action === "delete" ? (
                    <p className="mt-3 text-[11px] leading-5 text-ink-muted">删除当前号码时，这条绑定记录会一并删除。</p>
                  ) : null}

                  {resolution.action === "pending" && targetSims.length === 0 ? (
                    <p className="mt-3 text-[11px] leading-5 text-ink-muted">当前没有其他号码可作为迁移目标；如不再需要这条关联，可选择“删除绑定”。</p>
                  ) : null}
                </div>
              );
            })}

            {readyToDelete ? (
              <DialogAlert tone="success" className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4" />所有当前绑定服务都已选择处理方式，可以删除号码。
              </DialogAlert>
            ) : (
              <DialogAlert tone="warning">还有 {bindings.length - resolvedCount} 个绑定服务尚未处理。</DialogAlert>
            )}
          </section>
        )}

        <section className="rounded-xl border border-line bg-surface p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={preserveSnapshot}
              onChange={(event) => setPreserveSnapshot(event.target.checked)}
              disabled={saving}
              className="mt-1 h-4 w-4 rounded border-line-strong accent-brand disabled:opacity-50"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium text-ink">
                <Archive className="h-4 w-4 text-ink-muted" />保留号码概要记录
              </div>
              <p className="mt-1 text-xs leading-5 text-ink-muted">删除前保存一份独立只读快照。默认不保留；以后可在号码管理的“删除记录”中查看或永久清除。</p>
            </div>
          </label>

          {preserveSnapshot ? (
            <div className="mt-3 rounded-lg bg-surface-subtle px-3 py-2.5 text-[11px] leading-5 text-ink-secondary">
              <div><span className="font-medium text-ink">会保留：</span>号码与 ICCID、国家/地区、运营商、SIM 类型、激活日期、删除时余额与有效期、资费名称、实名状态/姓名/证件类型/证件国家、绑定服务处理结果和备注。</div>
              <div className="mt-1"><span className="font-medium text-ink">不会保留：</span>eSIM 激活凭据、完整证件号码、存放位置、保号规则、充值明细、提醒/处理历史和完整资费参数。</div>
            </div>
          ) : null}
        </section>

        {error ? <DialogAlert>{error}</DialogAlert> : null}
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>取消</Button>
        <Button
          type="button"
          variant="danger"
          onClick={() => void submit()}
          disabled={saving || loading || !readyToDelete || Boolean(error && bindings.length === 0)}
          className="min-w-28 gap-2"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          删除号码
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
