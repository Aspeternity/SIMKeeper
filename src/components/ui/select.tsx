import * as React from "react";
import { cn } from "@/lib/utils";

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink-secondary shadow-sm outline-none transition-[border-color,box-shadow,background-color] duration-150 focus:border-brand focus:ring-4 focus:ring-focus disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-muted aria-[invalid=true]:border-rose-300 aria-[invalid=true]:focus:border-rose-400 aria-[invalid=true]:focus:ring-rose-100",
        className,
      )}
      {...props}
    />
  );
}
