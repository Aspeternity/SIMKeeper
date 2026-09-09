"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Link2, Loader2 } from "lucide-react";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  getServiceBindingStatusLabel,
  getServiceBindingTypeLabel,
  getServiceCategoryLabel,
  getServiceImportanceLabel,
} from "@/lib/service-bindings";
import type { BoundServiceRecord } from "@/lib/service-binding-types";

function importanceClass(value: string) {
  if (value === "critical") return "bg-rose-50 text-rose-700 ring-rose-100";
  if (value === "high") return "bg-amber-50 text-amber-700 ring-amber-100";
  if (value === "low") return "bg-slate-100 text-slate-500 ring-slate-200";
  return "bg-sky-50 text-sky-700 ring-sky-100";
}

function statusClass(value: string) {
  if (value === "active") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (value === "migrated") return "bg-indigo-50 text-indigo-700 ring-indigo-100";
  return "bg-slate-100 text-slate-500 ring-slate-200";
}

function CopyText({ value }: { value: string | null }) {
  const [copied, setCopied] = useState(false);
  const display = value || "未记录";
  if (!value) return <span>{display}</span>;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value!);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" onClick={() => void copy()} title="点击复制" className="group inline-flex max-w-full items-center gap-1.5 text-left transition hover:text-ink">
      <span className="min-w-0 break-all">{display}</span>
      {copied ? <Check className="h-3 w-3 shrink-0 text-emerald-600" /> : <Copy className="h-3 w-3 shrink-0 text-ink-muted opacity-0 transition group-hover:opacity-100" />}
    </button>
  );
}

export function ServiceOverviewSection({ simId }: { simId: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bindings, setBindings] = useState<BoundServiceRecord[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/services?simId=${simId}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "绑定服务加载失败");
        if (active) setBindings(data.bindings || []);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "绑定服务加载失败");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [simId]);

  const activeCount = bindings.filter((item) => item.status === "active").length;
  const criticalCount = bindings.filter((item) => item.status === "active" && item.importance === "critical").length;
  const description = loading
    ? "正在检查绑定关系…"
    : bindings.length
      ? `当前绑定 ${activeCount} 项${criticalCount ? ` · 关键 ${criticalCount} 项` : ""}，历史共 ${bindings.length} 项。`
      : "记录这个号码绑定的账号和业务，停用前可集中检查。";

  return (
    <CollapsibleSection
      title="绑定服务"
      description={description}
      icon={<Link2 className="h-4 w-4" />}
      open={open}
      onToggle={() => setOpen((value) => !value)}
      badge={!loading && activeCount ? <span className="rounded-md bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand">{activeCount} 项</span> : undefined}
      action={<Link href="/services" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink-secondary shadow-sm transition hover:border-line-strong hover:bg-surface-hover hover:text-ink"><Link2 className="h-3.5 w-3.5" />管理绑定</Link>}
      dataAttribute="services"
    >
      {loading ? (
        <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-line text-sm text-ink-muted"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载绑定服务…</div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : bindings.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {bindings.map((binding) => (
            <div key={binding.id} className={`rounded-xl border p-4 ${binding.status === "active" ? "border-line bg-surface" : "border-line bg-surface-subtle"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{binding.serviceName}</span>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${importanceClass(binding.importance)}`}>{getServiceImportanceLabel(binding.importance)}</span>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${statusClass(binding.status)}`}>{getServiceBindingStatusLabel(binding.status)}</span>
                  </div>
                  <div className="mt-1 text-xs text-ink-muted">{getServiceCategoryLabel(binding.category)} · {getServiceBindingTypeLabel(binding.bindingType)}</div>
                </div>
                {binding.website ? <a href={binding.website} target="_blank" rel="noreferrer" title="打开服务网站" className="rounded-lg p-1.5 text-ink-muted transition hover:bg-surface-hover hover:text-ink"><ExternalLink className="h-3.5 w-3.5" /></a> : null}
              </div>

              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <div className="rounded-lg bg-surface-subtle px-3 py-2.5">
                  <div className="text-[10px] font-medium text-ink-muted">账号标识</div>
                  <div className="mt-0.5 font-medium text-ink-secondary"><CopyText value={binding.accountIdentifier} /></div>
                </div>
                <div className="rounded-lg bg-surface-subtle px-3 py-2.5">
                  <div className="text-[10px] font-medium text-ink-muted">最后确认</div>
                  <div className="mt-0.5 font-medium tabular-nums text-ink-secondary">{binding.verifiedAt || "未记录"}</div>
                </div>
              </div>
              {binding.notes ? <div className="mt-2 text-xs leading-5 text-ink-muted">{binding.notes}</div> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-ink-muted">还没有记录绑定服务。号码准备停用或更换前，建议先把关键账号补录进来。</div>
      )}
    </CollapsibleSection>
  );
}
