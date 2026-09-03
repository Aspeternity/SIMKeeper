import { BellRing } from "lucide-react";
import { ReminderCenter } from "@/components/reminders/reminder-center";
import { listReminderActions } from "@/lib/reminder-actions";
import { getCurrentReminderItems } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function RemindersPage() {
  const reminders = getCurrentReminderItems();
  const history = listReminderActions(100);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <BellRing className="h-4 w-4" />
          生命周期提醒
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">提醒中心</h2>
        <p className="mt-1 text-sm text-slate-500">统一处理号码有效期和保号规则产生的事项；处理、稍后提醒或忽略本次都会保留历史，新的截止日期会自动生成下一轮提醒。</p>
      </div>

      <ReminderCenter reminders={reminders} history={history} />
    </div>
  );
}
