import { ListChecks } from "lucide-react";

export function ProcessingCenterHeader() {
  return (
    <header
      className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      data-processing-center-header="alpha.51.6"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <ListChecks className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">统一任务视图</div>
            <h2 className="mt-0.5 text-2xl font-semibold tracking-tight text-ink">处理中心</h2>
          </div>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-secondary">
          集中处理号码生命周期、低余额与同步健康事项；异地备份等实例级故障继续单独归入系统维护，避免和某张 SIM 的任务混在一起。
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 text-[11px] font-medium text-ink-muted">
        <span className="rounded-lg border border-line bg-surface px-2.5 py-1.5">15 秒自动刷新</span>
        <span className="rounded-lg border border-line bg-surface px-2.5 py-1.5">系统维护独立分区</span>
      </div>
    </header>
  );
}
