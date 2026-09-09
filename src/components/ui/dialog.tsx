"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import { cn } from "@/lib/utils";

export type DialogSize = "sm" | "md" | "lg" | "xl";

const dialogSizes: Record<DialogSize, string> = {
  sm: "sm:max-w-lg",
  md: "sm:max-w-2xl",
  lg: "sm:max-w-3xl",
  xl: "sm:max-w-4xl",
};

export function Dialog({
  children,
  onClose,
  busy = false,
  size = "md",
  className,
  dataAttribute,
}: {
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  size?: DialogSize;
  className?: string;
  dataAttribute?: string;
}) {
  return (
    <ModalPortal onBackdropClick={busy ? undefined : onClose}>
      <section
        role="dialog"
        aria-modal="true"
        data-dialog-system="alpha.51.3"
        data-dialog={dataAttribute}
        className={cn(
          "sim-dialog flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-[20px] border border-line bg-surface shadow-floating sm:max-h-[calc(100dvh-2rem)]",
          dialogSizes[size],
          className,
        )}
      >
        {children}
      </section>
    </ModalPortal>
  );
}

export function DialogHeader({
  title,
  description,
  eyebrow,
  icon,
  onClose,
  busy = false,
  tone = "default",
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  icon?: ReactNode;
  onClose: () => void;
  busy?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <header className="sim-dialog-header flex shrink-0 items-start justify-between gap-4 border-b border-line bg-surface px-5 py-4 sm:px-6 sm:py-5">
      <div className="min-w-0">
        {eyebrow ? (
          <div className={cn(
            "mb-1.5 flex items-center gap-2 text-xs font-semibold tracking-wide",
            tone === "danger" ? "text-rose-600" : "text-ink-muted",
          )}>
            {icon}
            <span>{eyebrow}</span>
          </div>
        ) : null}
        <h3 className="text-lg font-semibold tracking-[-0.015em] text-ink">{title}</h3>
        {description ? <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-muted">{description}</p> : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClose}
        disabled={busy}
        aria-label="关闭"
        className="-mr-1 -mt-1 h-9 w-9 shrink-0 text-ink-muted"
      >
        <X className="h-4 w-4" />
      </Button>
    </header>
  );
}

export function DialogBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("sim-dialog-body min-h-0 flex-1 overflow-y-auto bg-surface px-5 py-5 sm:px-6", className)}>
      {children}
    </div>
  );
}

export function DialogFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <footer className={cn(
      "sim-dialog-footer flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-subtle px-5 py-3.5 sm:px-6",
      className,
    )}>
      {children}
    </footer>
  );
}

export function DialogAlert({
  children,
  tone = "danger",
  className,
}: {
  children: ReactNode;
  tone?: "danger" | "warning" | "info" | "success";
  className?: string;
}) {
  const tones = {
    danger: "border-rose-200 bg-rose-50 text-rose-700",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    info: "border-line bg-surface-subtle text-ink-secondary",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };

  return (
    <div className={cn("rounded-xl border px-4 py-3 text-sm leading-6", tones[tone], className)}>
      {children}
    </div>
  );
}
