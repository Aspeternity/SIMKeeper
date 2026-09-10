import {
  Activity,
  AlertTriangle,
  BellRing,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ReminderItem } from "@/lib/reminders";

const SUMMARY_ITEMS: Array<{
  key: "total" | "urgent" | "upcoming" | "condition";
  label: string;
  description: string;
  icon: LucideIcon;
  iconClass: string;
}> = [
  {
    key: "total",
    label: "待处理事项",
    description: "当前仍需要查看或处理的全部号码任务。",
    icon: BellRing,
    iconClass: "bg-brand-soft text-brand",
  },
  {
    key: "urgent",
    label: "优先处理",
    description: "已逾期、处于宽限期或今天到期。",
    icon: AlertTriangle,
    iconClass: "bg-rose-50 text-rose-600",
  },
  {
    key: "upcoming",
    label: "近期关注",
    description: "已经进入提醒窗口、但尚未到期的事项。",
    icon: CalendarClock,
    iconClass: "bg-sky-50 text-sky-600",
  },
  {
    key: "condition",
    label: "状态提醒",
    description: "低余额或同步健康等持续条件提醒。",
    icon: Activity,
    iconClass: "bg-indigo-50 text-indigo-600",
  },
];

export function ProcessingCenterSummary({ reminders }: { reminders: ReminderItem[] }) {
  const summary = {
    total: reminders.length,
    urgent: reminders.filter((item) => ["overdue", "grace", "today"].includes(item.status)).length,
    upcoming: reminders.filter((item) => item.status === "upcoming").length,
    condition: reminders.filter((item) => item.kind === "low_balance" || item.kind === "sync_health").length,
  };

  return (
    <section
      className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4"
      aria-label="处理中心状态概览"
      data-processing-center-summary="alpha.51.6"
      data-mobile-processing-summary="alpha.52.2"
    >
      {SUMMARY_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.key} className="relative overflow-hidden p-3.5 sm:p-5">
            <div className="flex items-start justify-between gap-2 sm:gap-4">
              <div>
                <div className="text-xs font-medium text-ink-secondary sm:text-sm">{item.label}</div>
                <div className="mt-1.5 text-2xl font-semibold tracking-tight text-ink sm:mt-2 sm:text-3xl">{summary[item.key]}</div>
              </div>
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10 ${item.iconClass}`}>
                <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
              </div>
            </div>
            <div className="mt-4 hidden border-t border-line pt-3 text-xs leading-5 text-ink-muted sm:block">{item.description}</div>
          </Card>
        );
      })}
    </section>
  );
}
