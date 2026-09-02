import { eq } from "drizzle-orm";
import { BellRing } from "lucide-react";
import { ReminderCenter } from "@/components/reminders/reminder-center";
import { db } from "@/db";
import { carriers, simCards, simKeepAliveRules } from "@/db/schema";
import { buildReminderItems } from "@/lib/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function dateInSingapore(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export default function RemindersPage() {
  const sims = db
    .select({
      id: simCards.id,
      label: simCards.label,
      phoneNumber: simCards.phoneNumber,
      status: simCards.status,
      validUntil: simCards.validUntil,
      carrierName: carriers.name,
      country: carriers.country,
    })
    .from(simCards)
    .innerJoin(carriers, eq(simCards.carrierId, carriers.id))
    .all();

  const rules = db
    .select({
      id: simKeepAliveRules.id,
      simId: simKeepAliveRules.simId,
      name: simKeepAliveRules.name,
      dueDateSource: simKeepAliveRules.dueDateSource,
      nextDueDate: simKeepAliveRules.nextDueDate,
      warningDays: simKeepAliveRules.warningDays,
      gracePeriodDays: simKeepAliveRules.gracePeriodDays,
      enabled: simKeepAliveRules.enabled,
    })
    .from(simKeepAliveRules)
    .all();

  const reminders = buildReminderItems({
    sims,
    rules,
    today: dateInSingapore(new Date()),
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <BellRing className="h-4 w-4" />
          生命周期提醒
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">提醒中心</h2>
        <p className="mt-1 text-sm text-slate-500">统一查看号码有效期和独立保号规则产生的待处理事项；跟随号码有效期的规则会自动合并为同一条提醒。</p>
      </div>

      <ReminderCenter reminders={reminders} />
    </div>
  );
}