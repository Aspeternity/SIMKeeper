"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, ArrowRight, CheckCircle2, Loader2, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ModalPortal } from "@/components/ui/modal-portal";
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
    <ModalPortal onBackdropClick={saving ? undefined : onClose}>
      <Card className="flex w-full max-w-2xl flex-col overflow-hidden shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <div className="flex shrink-0 items-start justify-between border-b bg-white px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-rose-600">
              <Trash2 className="h-4 w-4" />
              删除号码
            </div>
            <h3 className="mt-2 text-lg font-semibold text-slate-950">{sim.label}</h3>
            <p className="mt-1 text-xs text-slate-400">{sim.phoneNumber || "未填写手机号"} · {sim.carrierName} · {sim.country}</p>
          </div>
          <button onClick={onClose} disabled={saving} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-white p-6">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
            删除后，原号码及其资费、保号规则、活动记录、实名原始资料等关联数据会永久移除。可在下方选择是否额外保留一份只读号码概要。
          </div>

          {archivedEsimCredentials ? (
            <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">这张 eSIM 仍保存有激活凭据</div>
                <div className="mt-1 text-xs leading-5 text-amber-700">删除号码后，已归档的二维码、Activation Code、LPA 等激活资料也会永久删除；即使保留号码概要也不会保留这些凭据。</div>
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />正在检查绑定服务…
            </div>
          ) : bindings.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4" />没有仍处于“当前绑定”的服务</div>
              <p className="mt-1 text-xs leading-5 text-emerald-600">可以直接删除这个号码。</p>
            </div>
          ) : (
            <section className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">先处理绑定服务</h4>
                  <p className="mt-1 text-xs leading-5 text-slate-400">仍有 {bindings.length} 个当前绑定。每一项都必须选择“迁移绑定”或“删除绑定”后才能删除号码。</p>
                </div>
                <div className="text-xs font-medium text-slate-500">已处理 {resolvedCount} / {bindings.length}</div>
              </div>

              {bindings.map((binding) => {
                const resolution = resolutions[binding.id] || { action: "pending", targetSimId: "" };
                return (
                  <div key={binding.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800">{binding.serviceName}</div>
                        {binding.accountIdentifier ? <div className="mt-1 truncate text-xs text-slate-400">{binding.accountIdentifier}</div> : null}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-600">{getServiceCategoryLabel(binding.category)}</span>
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-600">{getServiceBindingTypeLabel(binding.bindingType)}</span>
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-600">{getServiceImportanceLabel(binding.importance)}</span>
                        </div>
                      </div>

                      <label className="w-full space-y-1.5 text-xs sm:w-40">
                        <span className="font-medium text-slate-600">处理方式</span>
                        <select
                          value={resolution.action}
                          onChange={(event) => changeAction(binding.id, event.target.value as BindingAction)}
                          disabled={saving}
                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:opacity-60"
                        >
                          <option value="pending">未处理</option>
                          <option value="migrate" disabled={targetSims.length === 0}>迁移绑定</option>
                          <option value="delete">删除绑定</option>
                        </select>
                      </label>
                    </div>

                    {resolution.action === "migrate" ? (
                      <div className="mt-3 rounded-lg bg-slate-50 p-3">
                        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-600">
                          <span>{sim.label}</span><ArrowRight className="h-3.5 w-3.5 text-slate-400" /><span>选择目标号码</span>
                        </div>
                        <select
                          value={resolution.targetSimId}
                          onChange={(event) => changeTarget(binding.id, event.target.value)}
                          disabled={saving}
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:opacity-60"
                        >
                          <option value="">请选择迁移到的号码</option>
                          {targetSims.map((target) => (
                            <option key={target.id} value={target.id}>
                              {target.label} · {target.phoneNumber || "未填写手机号"} · {target.carrierName}
                            </option>
                          ))}
                        </select>
                        <p className="mt-2 text-[11px] leading-5 text-slate-400">删除当前号码时，这条服务绑定会直接改到所选号码并继续保持“当前绑定”。</p>
                      </div>
                    ) : null}

                    {resolution.action === "delete" ? (
                      <p className="mt-3 text-[11px] leading-5 text-slate-400">删除当前号码时，这条绑定记录会一并删除。</p>
                    ) : null}

                    {resolution.action === "pending" && targetSims.length === 0 ? (
                      <p className="mt-3 text-[11px] leading-5 text-slate-400">当前没有其他号码可作为迁移目标；如不再需要这条关联，可选择“删除绑定”。</p>
                    ) : null}
                  </div>
                );
              })}

              {readyToDelete ? (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />所有当前绑定服务都已选择处理方式，可以删除号码。
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                  还有 {bindings.length - resolvedCount} 个绑定服务尚未处理。
                </div>
              )}
            </section>
          )}

          <section className="rounded-xl border border-slate-200 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={preserveSnapshot}
                onChange={(event) => setPreserveSnapshot(event.target.checked)}
                disabled={saving}
                className="mt-1 h-4 w-4 rounded border-slate-300 accent-slate-900 disabled:opacity-50"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <Archive className="h-4 w-4 text-slate-500" />保留号码概要记录
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-400">删除前保存一份独立只读快照。默认不保留；以后可在号码管理的“删除记录”中查看或永久清除。</p>
              </div>
            </label>

            {preserveSnapshot ? (
              <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-slate-500">
                <div><span className="font-medium text-slate-600">会保留：</span>号码与 ICCID、国家/地区、运营商、SIM 类型、激活日期、删除时余额与有效期、资费名称、实名状态/姓名/证件类型/证件国家、绑定服务处理结果和备注。</div>
                <div className="mt-1"><span className="font-medium text-slate-600">不会保留：</span>eSIM 激活凭据、完整证件号码、存放位置、保号规则、充值明细、提醒/处理历史和完整资费参数。</div>
              </div>
            ) : null}
          </section>

          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t bg-white px-6 py-4">
          <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">取消</button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || loading || !readyToDelete || Boolean(error && bindings.length === 0)}
            className="inline-flex h-10 min-w-28 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            删除号码
          </button>
        </div>
      </Card>
    </ModalPortal>
  );
}
