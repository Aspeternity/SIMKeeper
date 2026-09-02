"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function ModalPortal({ children }: { children: ReactNode }) {
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

  return createPortal(
    <div className="fixed inset-0 z-[100] h-[100dvh] overflow-y-auto bg-slate-950/40 backdrop-blur-sm">
      <div className="flex min-h-full w-full items-start justify-center p-4 sm:items-center">
        {children}
      </div>
    </div>,
    document.body,
  );
}
