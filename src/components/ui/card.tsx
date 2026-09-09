import * as React from "react";
import { cn } from "@/lib/utils";

export type CardVariant = "default" | "interactive" | "subtle" | "status";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
};

export function Card({ className, variant = "default", ...props }: CardProps) {
  const variants: Record<CardVariant, string> = {
    default: "sim-card rounded-2xl border border-line bg-surface",
    interactive: "sim-card sim-card-interactive rounded-2xl border border-line bg-surface",
    subtle: "rounded-xl border border-line bg-surface-subtle",
    status: "sim-card rounded-2xl border border-line border-l-[3px] border-l-brand bg-surface",
  };

  return <div className={cn(variants[variant], className)} {...props} />;
}
