import Link from "next/link";
import { AlertTriangle, CloudCog, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { AttentionItem } from "@/lib/attention-items";

function tone(item: AttentionItem) {
  if (item.priority === "critical") return "border-rose-200 bg-rose-50/70 text-rose-800";
  if (item.priority === "attention") return "border-amber-200 bg-amber-50/70 text-amber-800";
  return "border-sky-200 bg-sky-50/70 text-sky-800";
}

export function BackupAttentionPanel({ items }: { items: AttentionItem[] }) {
  if (!items.length) return null;

  return (
    <Card className="overflow-hidden" id="backup-health">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <CloudCog className="h-4 w-4 text-slate-400" />系统维护事项
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-400">异地备份异常属于实例级系统事项，不会伪装成某张 SIM 的生命周期任务。</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{items.length}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map((item) => (
          <div key={item.key} className="p-4 sm:p-5">
            <div className={`rounded-xl border px-4 py-3 ${tone(item)}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {item.priority === "critical" ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <ShieldCheck className="h-4 w-4 shrink-0" />}
                    {item.title}
                  </div>
                  <p className="mt-1 text-xs leading-5 opacity-80">{item.detail}</p>
                  <div className="mt-2 text-[11px] opacity-70">{item.subjectMeta} · {item.relativeLabel}</div>
                </div>
                <Link
                  href={item.href}
                  className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg bg-white/80 px-3 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200 transition hover:bg-white"
                >
                  {item.actionLabel}
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
