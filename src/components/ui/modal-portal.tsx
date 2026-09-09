"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function ModalPortal({
  children,
  onBackdropClick,
}: {
  children: ReactNode;
  onBackdropClick?: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!onBackdropClick) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onBackdropClick?.();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBackdropClick]);

  if (!mounted) return null;

  function handleBackdropMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (!onBackdropClick || event.target !== event.currentTarget) return;
    onBackdropClick();
  }

  return createPortal(
    <div
      className="sim-modal-backdrop fixed inset-0 z-[100] h-[100dvh] overflow-y-auto bg-slate-950/35 backdrop-blur-[3px]"
      onMouseDown={handleBackdropMouseDown}
      data-modal-foundation="alpha.51.3"
    >
      <div
        className="sim-modal-stage flex min-h-full w-full items-start justify-center p-3 sm:items-center sm:p-5"
        onMouseDown={handleBackdropMouseDown}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
