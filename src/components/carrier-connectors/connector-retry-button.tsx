"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

export function ConnectorRetryButton({ connectorId }: { connectorId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function retry() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setFailed(false);

    try {
      const response = await fetch("/api/carrier-connectors/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "同步重试失败");
      setMessage(data.message || (data.ok ? "同步成功" : "同步失败"));
      setFailed(!data.ok);
      router.refresh();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "同步重试失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => void retry()}
        disabled={busy}
        className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        {busy ? "正在重试" : "立即重试"}
      </button>
      {message ? (
        <div className={`max-w-72 text-right text-[11px] leading-4 ${failed ? "text-rose-600" : "text-emerald-600"}`}>
          {message}
        </div>
      ) : null}
    </div>
  );
}
