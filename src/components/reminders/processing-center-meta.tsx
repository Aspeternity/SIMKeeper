export function ProcessingCenterMeta({ active, history }: { active: number; history: number }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between" data-processing-center-meta="alpha.51.6">
      <div>
        <div className="text-sm font-semibold text-ink">号码待处理</div>
        <p className="mt-1 text-xs leading-5 text-ink-muted">按真实生命周期与当前状态处理任务；点击号码可以直接查看详情。</p>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] font-medium text-ink-muted">
        <span className="rounded-lg border border-line bg-surface-subtle px-2.5 py-1.5">待处理 {active}</span>
        <span className="rounded-lg border border-line bg-surface-subtle px-2.5 py-1.5">历史 {history}</span>
        <span className="rounded-lg border border-line bg-surface-subtle px-2.5 py-1.5">实时同步</span>
      </div>
    </div>
  );
}
