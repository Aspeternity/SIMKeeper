import { ListChecks } from "lucide-react";

export function ProcessingCenterHeader() {
  return (
    <header
      className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4"
      data-processing-center-header="alpha.51.6"
      data-mobile-processing-header="alpha.52.2"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand sm:h-10 sm:w-10">
            <ListChecks className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted sm:text-[11px] sm:tracking-[0.16em]">统一任务视图</div>
            <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">处理中心</h2>
          </div>
        </div>
        <p className="mt-2 max-w-3xl text-[13px] leading-5 text-ink-secondary sm:mt-3 sm:text-sm sm:leading-6">
          集中处理号码生命周期、低余额与同步健康事项；异地备份等实例级故障继续单独归入系统维护，避免和某张 SIM 的任务混在一起。
        </p>
      </div>
      <div className="flex shrink-0 flex-nowrap gap-2 overflow-x-auto pb-0.5 text-[11px] font-medium text-ink-muted sm:flex-wrap sm:overflow-visible sm:pb-0">
        <span className="shrink-0 whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 py-1.5">15 秒自动刷新</span>
        <span className="shrink-0 whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 py-1.5">系统维护独立分区</span>
      </div>
    </header>
  );
}
