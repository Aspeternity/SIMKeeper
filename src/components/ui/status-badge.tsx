import * as React from "react";
import { cn } from "@/lib/utils";

export type StatusBadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

type StatusBadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusBadgeTone;
  size?: "default" | "sm";
};

export function StatusBadge({ className, tone = "neutral", size = "default", ...props }: StatusBadgeProps) {
  const tones: Record<StatusBadgeTone, string> = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
    info: "border-sky-200 bg-sky-50 text-sky-700",
    neutral: "border-line bg-surface-subtle text-ink-secondary",
  };
  const sizes = {
    default: "gap-1.5 px-2.5 py-1 text-xs",
    sm: "gap-1 px-2 py-0.5 text-[11px]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium leading-none",
        tones[tone],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
