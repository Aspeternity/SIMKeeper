import { AlertTriangle, Archive, CheckCircle2, CircleAlert, CirclePause, Settings2 } from "lucide-react";
import { StatusBadge, type StatusBadgeTone } from "@/components/ui/status-badge";
import { getSimHealthStatusLabel, type SimHealthStatus } from "@/lib/sim-health-types";

function healthTone(status: SimHealthStatus): StatusBadgeTone {
  if (status === "healthy") return "success";
  if (status === "attention") return "warning";
  if (status === "critical") return "danger";
  if (status === "setup") return "info";
  return "neutral";
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
    <StatusBadge tone={healthTone(status)} size="sm" data-sim-health-status={status} className={className}>
      <HealthIcon status={status} />
      {getSimHealthStatusLabel(status)}
    </StatusBadge>
  );
}
