import Link from "next/link";
import { AlertTriangle, CloudCog, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { AttentionItem } from "@/lib/attention-items";

function tone(item: AttentionItem) {
  if (item.priority === "critical") return "border-rose-200 bg-rose-50/70 text-rose-800";
  if (item.priority === "attention") return "border-amber-200 bg-amber-50/70 text-amber-800";
  return "border-sky-200 bg-sky-50/70 text-sky-800";
}

function iconTone(item: AttentionItem) {
  if (item.priority === "critical") return "bg-rose-100 text-rose-600";
  if (item.priority === "attention") return "bg-amber-100 text-amber-700";
  return "bg-sky-100 text-sky-700";
}

export function BackupAttentionPanel({ items }: { items: AttentionItem[] }) {
  if (!items.length) return null;

  const criticalCount = items.filter((item) => item.priority === "critical").length;

  return (
    <Card className="overflow-hidden" id="backup-health" data-processing-center-maintenance="alpha.51.6" data-mobile-processing-maintenance="alpha.52.2">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-5">
        <div className="flex items-start gap-2.5 sm:gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand sm:h-10 sm:w-10">
            <CloudCog className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-ink">系统维护事项</div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-muted">
              异地备份异常属于实例级系统事项，不会伪装成某张 SIM 的生命周期任务。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
          {criticalCount ? <span className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-rose-700 ring-1 ring-inset ring-rose-100">严重 {criticalCount}</span> : null}
          <span className="rounded-lg border border-line bg-surface-subtle px-2.5 py-1.5 text-ink-secondary">共 {items.length} 项</span>
        </div>
      </div>

      <div className="grid gap-2 bg-surface-subtle p-3 sm:gap-3 sm:p-5">
        {items.map((item) => (
          <div key={item.key} className={`rounded-2xl border px-3 py-3.5 sm:px-4 sm:py-4 ${tone(item)}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconTone(item)}`}>
                  {item.priority === "critical" ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{item.title}</div>
                  <p className="mt-1 text-xs leading-5 opacity-80">{item.detail}</p>
                  <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px] opacity-70">
                    <span>{item.subjectMeta}</span>
                    <span>·</span>
                    <span>{item.relativeLabel}</span>
                  </div>
                </div>
              </div>
              <Link
                href={item.href}
                className="inline-flex h-11 w-full shrink-0 items-center justify-center rounded-xl border border-white/70 bg-white/80 px-3.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-white sm:h-9 sm:w-auto"
              >
                {item.actionLabel}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
