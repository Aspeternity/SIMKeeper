import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FormField({
  label,
  required = false,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5 text-sm", className)}>
      <span className="flex items-center gap-1 font-medium text-ink-secondary">
        {label}
        {required ? <span className="text-rose-500" aria-hidden="true">*</span> : null}
      </span>
      {children}
      {error ? (
        <span className="block text-xs leading-5 text-rose-600">{error}</span>
      ) : hint ? (
        <span className="block text-xs leading-5 text-ink-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function FormSection({
  title,
  description,
  icon,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4 border-t border-line pt-5 first:border-t-0 first:pt-0", className)}>
      {title || description ? (
        <div className="flex items-start gap-2.5">
          {icon ? <div className="mt-0.5 text-ink-muted">{icon}</div> : null}
          <div className="min-w-0">
            {title ? <h4 className="text-sm font-semibold text-ink">{title}</h4> : null}
            {description ? <p className="mt-1 text-xs leading-5 text-ink-muted">{description}</p> : null}
          </div>
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function FormGrid({
  children,
  columns = 2,
  className,
}: {
  children: ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  const grids = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-3",
  };
  return <div className={cn("grid gap-4", grids[columns], className)}>{children}</div>;
}
