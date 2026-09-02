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

  if (!mounted) return null;

  function handleBackdropMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (!onBackdropClick || event.target !== event.currentTarget) return;
    onBackdropClick();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] h-[100dvh] overflow-y-auto bg-slate-950/40 backdrop-blur-sm"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        className="flex min-h-full w-full items-start justify-center p-4 sm:items-center"
        onMouseDown={handleBackdropMouseDown}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
