import { AlertTriangle, Archive, CheckCircle2, CircleAlert, CirclePause, Settings2 } from "lucide-react";
import { getSimHealthStatusLabel, type SimHealthStatus } from "@/lib/sim-health-types";

function healthClass(status: SimHealthStatus) {
  if (status === "healthy") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (status === "attention") return "bg-amber-50 text-amber-700 ring-amber-100";
  if (status === "critical") return "bg-rose-50 text-rose-700 ring-rose-100";
  if (status === "setup") return "bg-sky-50 text-sky-700 ring-sky-100";
  return "bg-slate-100 text-slate-500 ring-slate-200";
}

function HealthIcon({ status }: { status: SimHealthStatus }) {
  if (status === "healthy") return <CheckCircle2 className="h-3 w-3" />;
  if (status === "attention") return <CircleAlert className="h-3 w-3" />;
  if (status === "critical") return <AlertTriangle className="h-3 w-3" />;
  if (status === "setup") return <Settings2 className="h-3 w-3" />;
  if (status === "paused") return <CirclePause className="h-3 w-3" />;
  return <Archive className="h-3 w-3" />;
}

export function SimHealthBadge({ status, className = "" }: { status: SimHealthStatus; className?: string }) {
  return (
    <span
      data-sim-health-status={status}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${healthClass(status)} ${className}`}
    >
      <HealthIcon status={status} />
      {getSimHealthStatusLabel(status)}
    </span>
  );
}
