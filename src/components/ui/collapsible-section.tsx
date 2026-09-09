import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function CollapsibleSection({
  title,
  description,
  icon,
  open,
  onToggle,
  action,
  badge,
  children,
  className,
  contentClassName,
  dataAttribute,
}: {
  title: string;
  description?: string;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  action?: ReactNode;
  badge?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  dataAttribute?: string;
}) {
  return (
    <section
      className={cn("overflow-hidden rounded-2xl border border-line bg-surface shadow-card", className)}
      data-collapsible-section={dataAttribute || title}
    >
      <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <button
          type="button"
          onClick={onToggle}
          className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-4 focus-visible:ring-focus"
          title={open ? "收起" : "展开"}
          aria-expanded={open}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-subtle text-ink-muted transition-colors duration-150 group-hover:bg-brand-soft group-hover:text-brand">
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">{title}</span>
              {badge}
            </span>
            {description ? (
              <span className="mt-0.5 block text-xs font-normal leading-5 text-ink-muted">{description}</span>
            ) : null}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-ink-muted transition-transform duration-150",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
        </button>
        {action ? <div className="shrink-0 pl-12 sm:pl-0">{action}</div> : null}
      </div>

      {open ? (
        <div className={cn("border-t border-line bg-surface px-4 py-4 sm:px-5", contentClassName)}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
